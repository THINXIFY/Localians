import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { projectInputSchema } from "@/lib/validation/project";
import type { AdminUser } from "@/server/admin";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { prisma } from "@/server/db";
import { DEFAULT_RECIPIENT } from "@/server/payment-settings";
import { adminGrantPass, adminRevokePass, getPlanManagement } from "@/server/plan-management";
import { getProjectPlan } from "@/server/plans";
import { archiveProject, createProject } from "@/server/projects";
import { createUpgradeRequest, submitTxHash, verifyRequestOnChain } from "@/server/upgrades";
import { readOutbox } from "../setup/outbox";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

// Server actions read the request's cookies; outside a request there is no session, as for a signed-out visitor.
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, getAll: () => [] }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const project = (name: string, port: number) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: String(port) });
const DAY = 86_400_000;
const near = (a: Date | string, b: number, slack = 15_000) => Math.abs(new Date(a).getTime() - b) < slack;
const key = () => crypto.randomUUID();

const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const txHash = (n: number) => `0x${(0xa000 + n).toString(16).padStart(64, "0")}`;
/** A fake BNB Smart Chain where every known transaction is a confirmed 5 USDT transfer to the default wallet. */
const txs = new Map<string, number>();
let rpc: http.Server;

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let app: Awaited<ReturnType<typeof startLocalApp>>;
let admin: AdminUser;

beforeAll(async () => {
  rpc = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { method, params } = JSON.parse(body) as { method: string; params: string[] };
    const head = 1_000_000;
    let result: unknown = null;
    if (method === "eth_chainId") result = "0x38";
    if (method === "eth_blockNumber") result = `0x${head.toString(16)}`;
    if (method === "eth_getTransactionReceipt" && txs.has(params[0]))
      result = { status: "0x1", blockNumber: `0x${(head - 20).toString(16)}`, logs: [{ address: USDT, topics: [TRANSFER, pad("0x1111111111111111111111111111111111111111"), pad(DEFAULT_RECIPIENT)], data: `0x${(5_000_000n * 10n ** 12n).toString(16)}` }] };
    if (method === "eth_getBlockByNumber") result = { timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  process.env.BSC_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
  await prisma.paymentSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true, recipient: DEFAULT_RECIPIENT }, update: { enabled: true } });

  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "http", CLI_DEVICE_RATE_LIMIT: "1000" });
  controlPlane = await startControlPlane();
  const started = await startTestGateway(controlPlane.url);
  ({ gateway, port: gatewayPort } = started);
  process.env.GATEWAY_CONTROL_URL = started.adminUrl; // so grants and revocations reach the gateway right away
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  app = await startLocalApp();

  const { user } = await createVerifiedUser("Plan Admin");
  const row = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  admin = { id: row.id, email: row.email, name: row.name, publicId: row.publicId };
});

afterAll(async () => {
  delete process.env.BSC_RPC_URL;
  delete process.env.GATEWAY_CONTROL_URL;
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
  await new Promise((r) => rpc?.close(r));
});

async function customer(name: string) {
  const { user } = await createVerifiedUser(name);
  const anon = createApi(controlPlane.url, null, "test");
  const start = await anon.startDeviceLogin("Localians for VS Code");
  await decideDeviceAuthorization(user.id, start.user_code, true);
  const { access_token } = await anon.pollDeviceLogin(start.device_code);
  return { user, api: createApi(controlPlane.url, access_token, "test") };
}

/** Uses up a project's free preview, so only a pass can share it. */
const freeUsed = (p: { id: string; workspaceId: string }, userId: string) =>
  prisma.freePreviewGrant.create({ data: { projectId: p.id, workspaceId: p.workspaceId, userId, startedAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - 2 * DAY) } });

describe("Manage Plan: complimentary and support passes", () => {
  it("upgrades ONE project (not the account): CLI and VS Code see the pass, the gateway serves it, the dashboard shows it", async () => {
    const { user, api } = await customer("Comp Customer");
    const paid = await createProject(user.id, project("Comp Paid", app.port));
    const other = await createProject(user.id, project("Comp Other", app.port));
    await freeUsed(paid, user.id);
    await freeUsed(other, user.id);
    await expect(api.createTunnel(paid.id, app.port)).rejects.toMatchObject({ code: "free_used" });

    const result = await adminGrantPass(admin, { userId: user.id, projectId: paid.id, reason: "COMPLIMENTARY", note: "Launch partner", key: key() });
    expect(result).toMatchObject({ renewal: false, duplicate: false });
    expect(near(result.startsAt, Date.now())).toBe(true);
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(7 * DAY);

    // Labelled complimentary, no order or payment record, audited with the admin and the reason.
    const pass = await prisma.previewPass.findUniqueOrThrow({ where: { id: result.passId } });
    expect(pass).toMatchObject({ source: "ADMIN", grantReason: "COMPLIMENTARY", grantNote: "Launch partner", requestId: null, createdById: admin.id });
    expect(await prisma.upgradeRequest.count({ where: { userId: user.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { subjectId: pass.id, action: "plan.upgraded" } });
    expect(log).toMatchObject({ actorType: "ADMIN", actorId: admin.id });
    expect(log.detail).toMatchObject({ reason: "COMPLIMENTARY", note: "Launch partner", userId: user.id, projectId: paid.id });
    const mail = readOutbox(user.email, "pass-granted").at(-1)!;
    expect(mail.subject).toBe("7-Day Preview Pass added to Comp Paid");
    expect(mail.text).toContain("complimentary");
    expect(mail.text).not.toContain("Launch partner"); // internal note stays internal

    // The dashboard plan, the CLI/VS Code API and the gateway agree; the other project stays free.
    expect((await getProjectPlan(paid, user.id)).passEndsAt?.getTime()).toBe(pass.endsAt.getTime());
    expect((await getProjectPlan(other, user.id)).passEndsAt).toBeNull();
    await expect(api.createTunnel(other.id, app.port)).rejects.toMatchObject({ code: "free_used" });
    const session = await api.createTunnel(paid.id, app.port);
    expect(session.plan).toBe("pass");
    expect(new Date(session.expiresAt).getTime()).toBe(pass.endsAt.getTime());
    let first: string | null = session.connectToken;
    const agent = startAgent({
      gatewayUrl: session.gatewayUrl,
      localPort: app.port,
      localAddress: "127.0.0.1",
      // Like the CLI and VS Code: reconnects ask the API for a new token, which it refuses once the pass is gone.
      getConnectToken: async () => {
        const token = first ?? (await api.connectToken(session.sessionId));
        first = null;
        return token;
      },
    });
    await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "connected");
    expect((await publicRequest(gatewayPort, `${session.label}.${PREVIEW_DOMAIN}`, "/")).status).toBe(200);

    // Revoking (with a reason) ends the live preview at the gateway right away.
    await expect(adminRevokePass(admin, { userId: user.id, passId: pass.id, reason: "" })).rejects.toThrow("short reason");
    expect(await adminRevokePass(admin, { userId: user.id, passId: pass.id, reason: "Granted by mistake" })).toEqual({ revoked: true });
    await waitFor(() => !gateway.hasTunnel(session.label), 10_000, "gateway dropped the tunnel");
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: session.sessionId } })).status).toBe("EXPIRED");
    expect((await getProjectPlan(paid, user.id)).passEndsAt).toBeNull();
    await expect(api.createTunnel(paid.id, app.port)).rejects.toMatchObject({ code: "free_used" });
    expect(await adminRevokePass(admin, { userId: user.id, passId: pass.id, reason: "Again" })).toEqual({ revoked: false });
    expect(await prisma.auditLog.count({ where: { subjectId: pass.id, action: { in: ["pass.revoked", "plan.revoked"] } } })).toBe(2);
    expect(readOutbox(user.email, "pass-revoked").at(-1)?.text).toContain("Granted by mistake");
    agent.stop();
    await agent.done;
  });

  it("renewing keeps the remaining time (the new period starts when the current one ends) and extends live previews", async () => {
    const { user, api } = await customer("Renew Customer");
    const p = await createProject(user.id, project("Renew App", app.port));
    const first = await adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() });
    const live = await api.createTunnel(p.id, app.port);
    const second = await adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "SUPPORT_ADJUSTMENT", note: "Compensation for the outage", key: key() });
    expect(second.renewal).toBe(true);
    expect(second.startsAt.getTime()).toBe(first.endsAt.getTime());
    expect(second.endsAt.getTime() - first.startsAt.getTime()).toBe(14 * DAY);
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: live.sessionId } })).expiresAt.getTime()).toBe(second.endsAt.getTime());
    expect(readOutbox(user.email, "pass-granted").at(-1)?.text).toContain("added by our support team");

    const view = await getPlanManagement(user.id);
    const row = view.projects.find((x) => x.id === p.id)!;
    expect(row).toMatchObject({ paid: true, paidUntil: second.endsAt });
    expect(row.passes.map((x) => [x.current, x.reason])).toEqual([
      [true, "COMPLIMENTARY"],
      [false, "SUPPORT_ADJUSTMENT"],
    ]);

    // Revoking the current pass moves the scheduled one up: paid time stays contiguous.
    await adminRevokePass(admin, { userId: user.id, passId: first.passId, reason: "Replaced" });
    const moved = await prisma.previewPass.findUniqueOrThrow({ where: { id: second.passId } });
    expect(near(moved.startsAt, Date.now())).toBe(true);
    await api.closeTunnel(live.sessionId);
  });

  it("a repeated or concurrent click activates once; a support adjustment needs an explanation", async () => {
    const { user } = await customer("Double Click");
    const p = await createProject(user.id, project("Double Click", app.port));
    await expect(adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "SUPPORT_ADJUSTMENT", note: "short", key: key() })).rejects.toThrow("at least 10 characters");
    await expect(prisma.previewPass.create({ data: { projectId: p.id, workspaceId: p.workspaceId, startsAt: new Date(), endsAt: new Date(Date.now() + DAY), source: "ADMIN", grantReason: "SUPPORT_ADJUSTMENT", grantKey: key() } })).rejects.toThrow(); // database CHECK

    const k = key();
    const input = { userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: k };
    const results = await Promise.all([adminGrantPass(admin, input), adminGrantPass(admin, input), adminGrantPass(admin, input)]);
    expect(new Set(results.map((r) => r.passId)).size).toBe(1);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect((await adminGrantPass(admin, input)).duplicate).toBe(true);
    expect(await prisma.previewPass.count({ where: { projectId: p.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "plan.upgraded", subjectId: results[0].passId } })).toBe(1);
    expect(readOutbox(user.email, "pass-granted")).toHaveLength(1);
  });
});

describe("Manage Plan: verified payments", () => {
  it("activates only an order of this project that passed the on-chain check, once", async () => {
    const { user, api } = await customer("Paying Customer");
    const p = await createProject(user.id, project("Paying App", app.port));
    const other = await createProject(user.id, project("Paying Other", app.port));
    await freeUsed(p, user.id);
    const { request } = await createUpgradeRequest(user.id, p.id);

    // Not verified yet: refused, nothing granted.
    const attempt = { userId: user.id, projectId: p.id, reason: "VERIFIED_PAYMENT", orderId: request.orderId, key: key() };
    await expect(adminGrantPass(admin, attempt)).rejects.toThrow("on-chain check");
    expect((await getPlanManagement(user.id)).orders[0]).toMatchObject({ orderId: request.orderId, activatable: false });
    txs.set(txHash(1), 5);
    await submitTxHash(user.id, request.orderId, txHash(1));
    await expect(adminGrantPass(admin, attempt)).rejects.toThrow("on-chain check");
    expect((await verifyRequestOnChain(admin, request.orderId)).ok).toBe(true);
    expect((await getPlanManagement(user.id)).orders[0]).toMatchObject({ orderId: request.orderId, activatable: true, amount: "5 USDT" });

    // The order belongs to another project / no order: refused.
    await expect(adminGrantPass(admin, { ...attempt, projectId: other.id })).rejects.toThrow("verified order for this project");
    await expect(adminGrantPass(admin, { ...attempt, orderId: "ORD-NOTREAL1" })).rejects.toThrow("verified order for this project");

    const [a, b] = await Promise.all([adminGrantPass(admin, attempt), adminGrantPass(admin, attempt)]);
    expect(a.passId).toBe(b.passId);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const pass = await prisma.previewPass.findUniqueOrThrow({ where: { id: a.passId } });
    expect(pass).toMatchObject({ source: "PAYMENT", requestId: request.id, grantReason: null });
    expect((await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("APPROVED");
    expect(readOutbox(user.email, "pass-activated")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "plan.upgraded", subjectId: pass.id } })).toBe(1);
    expect((await api.createTunnel(p.id, app.port)).plan).toBe("pass");
    const view = await getPlanManagement(user.id);
    expect(view.projects.find((x) => x.id === p.id)!.passes[0]).toMatchObject({ reason: "VERIFIED_PAYMENT", orderId: request.orderId });
  });
});

describe("Manage Plan: who and what can be changed", () => {
  it("refuses signed-out callers, admin accounts, other users' projects, archived projects and suspended accounts", async () => {
    const { adminGrantPassAction, adminRevokePassAction } = await import("@/server/actions/admin");
    const { user } = await customer("Guarded Customer");
    const p = await createProject(user.id, project("Guarded App", app.port));
    expect(await adminGrantPassAction({ userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() })).toEqual({ ok: false, error: "Administrator sign-in required." });
    expect(await adminRevokePassAction({ userId: user.id, passId: "x", reason: "nope" })).toEqual({ ok: false, error: "Administrator sign-in required." });
    expect(await prisma.previewPass.count({ where: { projectId: p.id } })).toBe(0);

    await expect(adminGrantPass(admin, { userId: admin.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() })).rejects.toThrow("Administrator accounts");
    const stranger = await customer("Stranger");
    await expect(adminGrantPass(admin, { userId: stranger.user.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() })).rejects.toThrow("doesn't belong to this user");
    const granted = await adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() });
    await expect(adminRevokePass(admin, { userId: stranger.user.id, passId: granted.passId, reason: "Wrong user" })).rejects.toThrow("doesn't belong to this user");
    await expect(adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "FREE_MONEY", key: key() })).rejects.toThrow("Choose a reason");
    await expect(adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: "x" })).rejects.toThrow("Reload");

    const archived = await createProject(user.id, project("Archived App", app.port));
    await archiveProject(user.id, archived.id);
    await expect(adminGrantPass(admin, { userId: user.id, projectId: archived.id, reason: "COMPLIMENTARY", key: key() })).rejects.toThrow("archived");
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expect(adminGrantPass(admin, { userId: user.id, projectId: p.id, reason: "COMPLIMENTARY", key: key() })).rejects.toThrow("Reactivate");
    expect(await prisma.previewPass.count({ where: { projectId: { in: [p.id, archived.id] } } })).toBe(1);
  });
});
