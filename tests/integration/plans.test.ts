import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startAgent } from "@tunnel/cli/agent";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { projectInputSchema } from "@/lib/validation/project";
import { hashPassword } from "@/server/access";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { prisma } from "@/server/db";
import { grantPass, revokePass } from "@/server/passes";
import { getProjectPlan, NAME_GRACE_MS } from "@/server/plans";
import { claimName, expireHolds, holdName, labelState, NameError, releaseLapsedNames } from "@/server/preview-names";
import { createProject, deleteProject } from "@/server/projects";
import { createShareSetup, updateShareSetup } from "@/server/share-setup";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, publicRequest, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

const project = (name: string, port: number) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: String(port) });
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const near = (a: Date | string, b: number, slack = 15_000) => Math.abs(new Date(a).getTime() - b) < slack;

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let app: Awaited<ReturnType<typeof startLocalApp>>;

beforeAll(async () => {
  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "http", CLI_DEVICE_RATE_LIMIT: "1000", PREVIEW_CUSTOM_NAMES: "on" });
  controlPlane = await startControlPlane();
  ({ gateway, port: gatewayPort } = await startTestGateway(controlPlane.url));
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  app = await startLocalApp();
});

afterAll(async () => {
  delete process.env.PREVIEW_CUSTOM_NAMES;
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
});

async function login(name: string) {
  const { user } = await createVerifiedUser(name);
  const anon = createApi(controlPlane.url, null, "test");
  const start = await anon.startDeviceLogin("CLI on plans-test");
  await decideDeviceAuthorization(user.id, start.user_code, true);
  const { access_token } = await anon.pollDeviceLogin(start.device_code);
  return { user, api: createApi(controlPlane.url, access_token, "test") };
}

function connect(api: ReturnType<typeof createApi>, session: { sessionId: string; gatewayUrl: string; connectToken: string }) {
  let first: string | null = session.connectToken;
  return startAgent({
    gatewayUrl: session.gatewayUrl,
    localPort: app.port,
    localAddress: "127.0.0.1",
    getConnectToken: async () => {
      if (first) {
        const t = first;
        first = null;
        return t;
      }
      return api.connectToken(session.sessionId);
    },
  });
}

/** Moves a project's free window into the past (as if it started `hoursAgo`). */
const ageFreeWindow = (projectId: string, hoursAgo: number) =>
  prisma.freePreviewGrant.update({ where: { projectId }, data: { startedAt: new Date(Date.now() - hoursAgo * HOUR), endsAt: new Date(Date.now() - hoursAgo * HOUR + DAY) } });

describe("free preview: one 24-hour window per project", () => {
  it("starts with the first share; later shares (restart, other port, setup code) stay inside it", async () => {
    const { user, api } = await login("Free Window");
    const p = await createProject(user.id, project("Free Window", app.port));
    const before = await getProjectPlan(p, user.id);
    expect(before.free).toEqual({ state: "available" });

    const first = await api.createTunnel(p.id, app.port);
    expect(first.plan).toBe("free");
    expect(near(first.expiresAt, Date.now() + DAY)).toBe(true); // no auto-stop: runs until the window ends
    await api.closeTunnel(first.sessionId);
    const grant = await prisma.freePreviewGrant.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(near(grant.endsAt, grant.startedAt.getTime() + DAY, 1000)).toBe(true);

    // A shorter auto-stop is honoured…
    const short = await api.createTunnel(p.id, app.port, 60);
    expect(near(short.expiresAt, Date.now() + HOUR)).toBe(true);
    await api.closeTunnel(short.sessionId);

    // …and nothing outlives the window: 23 hours in, a new share (another port, via a setup code) gets 1 hour.
    await ageFreeWindow(p.id, 23);
    const setup = await createShareSetup(user.id);
    await updateShareSetup(user.id, setup.id, { port: app.port, durationMinutes: 12 * 60, project: { kind: "existing", id: p.id }, access: { mode: "PUBLIC" } });
    const redeemed = await api.redeemSetup(setup.code, app.port);
    const late = await api.createTunnel(redeemed.project!.id, 4999, redeemed.durationMinutes ?? undefined);
    expect(near(late.expiresAt, Date.now() + HOUR)).toBe(true);
    await api.closeTunnel(late.sessionId);
    expect(await prisma.freePreviewGrant.count({ where: { projectId: p.id } })).toBe(1);
  });

  it("refuses another free preview once the window has ended — from any client, on any port", async () => {
    const { user, api } = await login("Free Used");
    const p = await createProject(user.id, project("Free Used", app.port));
    await api.closeTunnel((await api.createTunnel(p.id, app.port)).sessionId);
    await ageFreeWindow(p.id, 25);

    for (const attempt of [() => api.createTunnel(p.id, app.port), () => api.createTunnel(p.id, 5555, 5), () => api.createTunnel(p.id, app.port, undefined, "random")]) {
      await expect(attempt()).rejects.toMatchObject({ status: 402, code: "free_used", message: expect.stringContaining("Preview Pass") });
    }
    // A fresh setup code doesn't help either.
    const setup = await createShareSetup(user.id);
    await updateShareSetup(user.id, setup.id, { port: app.port, project: { kind: "existing", id: p.id }, access: { mode: "PUBLIC" } });
    const redeemed = await api.redeemSetup(setup.code, app.port);
    await expect(api.createTunnel(redeemed.project!.id, app.port)).rejects.toMatchObject({ code: "free_used" });
    expect((await getProjectPlan(p, user.id)).free.state).toBe("used");
  });

  it("a live free preview can't outlive its window: the session ends with the window, reconnects are refused", async () => {
    const { user, api } = await login("Free Live");
    const p = await createProject(user.id, project("Free Live", app.port));
    const session = await api.createTunnel(p.id, app.port);
    const agent = connect(api, session);
    await waitFor(() => agent.state === "connected" && gateway.hasTunnel(session.label), 10_000, "connected");
    // The window ends now: the session's deadline is the window's end.
    await ageFreeWindow(p.id, 24);
    await prisma.tunnelSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1) } });
    await gateway.heartbeat();
    expect(await agent.done).toBe("ended");
    expect((await publicRequest(gatewayPort, `${session.label}.${PREVIEW_DOMAIN}`, "/")).status).not.toBe(200);
    await expect(api.connectToken(session.sessionId)).rejects.toMatchObject({ status: 410 });
    await expect(api.createTunnel(p.id, app.port)).rejects.toMatchObject({ code: "free_used" });
  });

  it("concurrent first shares start exactly one free window", async () => {
    const { user, api } = await login("Free Race");
    const p = await createProject(user.id, project("Free Race", app.port));
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => api.createTunnel(p.id, app.port, 5)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(4);
    expect(await prisma.freePreviewGrant.count({ where: { projectId: p.id } })).toBe(1);
    for (const r of results) if (r.status === "fulfilled") await api.closeTunnel(r.value.sessionId);
  });

  it("limits new free windows per workspace; deleting a project doesn't give its window back", async () => {
    const { user, api } = await login("Free Abuse");
    process.env.QUOTA_FREE_PREVIEWS_PER_30_DAYS = "2";
    try {
      const a = await createProject(user.id, project("Abuse A", 4101));
      const b = await createProject(user.id, project("Abuse B", 4102));
      await api.closeTunnel((await api.createTunnel(a.id, app.port, 5)).sessionId);
      await api.closeTunnel((await api.createTunnel(b.id, app.port, 5)).sessionId);
      const c = await createProject(user.id, project("Abuse C", 4103));
      await expect(api.createTunnel(c.id, app.port)).rejects.toMatchObject({ status: 429, code: "free_limit" });
      expect((await getProjectPlan(c, user.id)).free.state).toBe("limit_reached");
      // Delete A and re-create it: still no new free window.
      await deleteProject(user.id, a.id);
      const again = await createProject(user.id, project("Abuse A", 4101));
      await expect(api.createTunnel(again.id, app.port)).rejects.toMatchObject({ code: "free_limit" });
      expect(await prisma.freePreviewGrant.count({ where: { workspaceId: a.workspaceId } })).toBe(2);
      // Projects still inside their window keep working.
      await api.closeTunnel((await api.createTunnel(b.id, app.port, 5)).sessionId);
    } finally {
      delete process.env.QUOTA_FREE_PREVIEWS_PER_30_DAYS;
    }
  });

  it("projects with previews from before plans get their full free window (nothing retroactive)", async () => {
    const { user, api } = await login("Old Project");
    const p = await createProject(user.id, project("Old Project", app.port));
    await prisma.tunnelSession.create({
      data: { projectId: p.id, userId: user.id, hostname: "oldsessionaa", localPort: 3000, status: "DISCONNECTED", createdAt: new Date(Date.now() - 10 * DAY), expiresAt: new Date(Date.now() - 9 * DAY) },
    });
    expect((await getProjectPlan(p, user.id)).free.state).toBe("available");
    const s = await api.createTunnel(p.id, app.port);
    expect(near(s.expiresAt, Date.now() + DAY)).toBe(true);
    await api.closeTunnel(s.sessionId);
  });
});

describe("7-Day Pass", () => {
  it("unlocks 7 more days after the free preview, with sessions up to the pass end", async () => {
    const { user, api } = await login("Pass Buyer");
    const p = await createProject(user.id, project("Pass Buyer", app.port));
    await api.closeTunnel((await api.createTunnel(p.id, app.port)).sessionId);
    await ageFreeWindow(p.id, 30);
    await expect(api.createTunnel(p.id, app.port)).rejects.toMatchObject({ code: "free_used" });

    const { pass } = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN", id: "test-admin" } });
    expect(near(pass.endsAt, pass.startsAt.getTime() + 7 * DAY, 1000)).toBe(true);
    const full = await api.createTunnel(p.id, app.port);
    expect(full.plan).toBe("pass");
    expect(near(full.expiresAt, pass.endsAt.getTime(), 1000)).toBe(true);
    await api.closeTunnel(full.sessionId);
    const threeDays = await api.createTunnel(p.id, app.port, 3 * 24 * 60);
    expect(near(threeDays.expiresAt, Date.now() + 3 * DAY)).toBe(true);
    await api.closeTunnel(threeDays.sessionId);
    // Free projects can't pick pass-only durations.
    const other = await createProject(user.id, project("No Pass", 4200));
    await expect(api.createTunnel(other.id, app.port, 7 * 24 * 60)).rejects.toMatchObject({ status: 403, code: "plan_required" });
  });

  it("renewing before expiry adds 7 days after the current pass and extends live previews", async () => {
    const { user, api } = await login("Pass Renew");
    const p = await createProject(user.id, project("Pass Renew", app.port));
    const first = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    const live = await api.createTunnel(p.id, app.port); // until the pass ends
    const short = await api.createTunnel(p.id, 4300, 60); // explicit 1-hour auto-stop
    const second = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    expect(second.pass.startsAt.getTime()).toBe(first.pass.endsAt.getTime());
    expect(second.pass.endsAt.getTime() - first.pass.startsAt.getTime()).toBe(14 * DAY);
    const [liveRow, shortRow] = await Promise.all([prisma.tunnelSession.findUniqueOrThrow({ where: { id: live.sessionId } }), prisma.tunnelSession.findUniqueOrThrow({ where: { id: short.sessionId } })]);
    expect(liveRow.expiresAt.getTime()).toBe(second.pass.endsAt.getTime());
    expect(near(shortRow.expiresAt, Date.now() + HOUR)).toBe(true); // a chosen auto-stop stays
    const plan = await getProjectPlan(p, user.id);
    expect(plan.passEndsAt?.getTime()).toBe(second.pass.endsAt.getTime());
    await api.closeTunnel(live.sessionId);
    await api.closeTunnel(short.sessionId);
  });

  it("activating a pass extends a live free preview instead of cutting it off", async () => {
    const { user, api } = await login("Pass Upgrade");
    const p = await createProject(user.id, project("Pass Upgrade", app.port));
    const free = await api.createTunnel(p.id, app.port);
    const { pass } = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    const row = await prisma.tunnelSession.findUniqueOrThrow({ where: { id: free.sessionId } });
    expect(row.expiresAt.getTime()).toBe(pass.endsAt.getTime());
    expect(row.planTier).toBe("PASS");
    await api.closeTunnel(free.sessionId);
  });

  it("revoking a pass (refund) ends its live previews and the project is back to its free state", async () => {
    const { user, api } = await login("Pass Revoke");
    const p = await createProject(user.id, project("Pass Revoke", app.port));
    await prisma.freePreviewGrant.create({ data: { projectId: p.id, workspaceId: p.workspaceId, userId: user.id, startedAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) } });
    const { pass } = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    const live = await api.createTunnel(p.id, app.port);
    await revokePass(pass.id, { reason: "Refunded", actor: { type: "ADMIN", id: "test-admin" } });
    expect((await prisma.tunnelSession.findUniqueOrThrow({ where: { id: live.sessionId } })).status).toBe("EXPIRED");
    await expect(api.createTunnel(p.id, app.port)).rejects.toMatchObject({ code: "free_used" });
    expect(await prisma.auditLog.count({ where: { subjectId: pass.id, action: "pass.revoked" } })).toBe(1);
  });

  it("an expired pass stops sharing until renewed", async () => {
    const { user, api } = await login("Pass Expired");
    const p = await createProject(user.id, project("Pass Expired", app.port));
    await prisma.freePreviewGrant.create({ data: { projectId: p.id, workspaceId: p.workspaceId, userId: user.id, startedAt: new Date(Date.now() - 10 * DAY), endsAt: new Date(Date.now() - 9 * DAY) } });
    await prisma.previewPass.create({ data: { projectId: p.id, workspaceId: p.workspaceId, startsAt: new Date(Date.now() - 8 * DAY), endsAt: new Date(Date.now() - DAY), source: "ADMIN" } });
    await expect(api.createTunnel(p.id, app.port)).rejects.toMatchObject({ code: "free_used" });
    const { pass } = await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    expect(near(pass.startsAt, Date.now())).toBe(true); // a renewal after expiry starts now
  });
});

describe("custom URLs (with a 7-Day Pass)", () => {
  it("need a pass, are unique, route the preview, keep password protection, and show offline when idle", async () => {
    const { user, api } = await login("Custom Owner");
    const p = await createProject(user.id, project("Agent Axio", app.port));
    await expect(claimName(user.id, p.id, "agentaxio-test")).rejects.toMatchObject({ code: "plan_required" });
    await grantPass({ projectId: p.id, source: "ADMIN", actor: { type: "ADMIN" } });
    await claimName(user.id, p.id, "agentaxio-test");

    // Someone else can't take it.
    const other = await login("Custom Rival");
    const q = await createProject(other.user.id, project("Rival", app.port));
    await grantPass({ projectId: q.id, source: "ADMIN", actor: { type: "ADMIN" } });
    await expect(claimName(other.user.id, q.id, "agentaxio-test")).rejects.toBeInstanceOf(NameError);

    await prisma.project.update({ where: { id: p.id }, data: { accessMode: "PASSWORD", accessPasswordHash: await hashPassword("axio-secret-1") } });
    const session = await api.createTunnel(p.id, app.port);
    expect(session.label).toBe("agentaxio-test");
    expect(session.publicUrl).toContain("agentaxio-test.preview.test");
    const agent = connect(api, session);
    await waitFor(() => agent.state === "connected" && gateway.hasTunnel("agentaxio-test"), 10_000, "connected");
    const host = `agentaxio-test.${PREVIEW_DOMAIN}`;
    await waitFor(async () => (await publicRequest(gatewayPort, host, "/", { headers: { accept: "text/html" } })).status === 401, 5000, "password page");

    // A random link is still possible on request.
    const random = await api.createTunnel(p.id, 4400, 5, "random");
    expect(random.label).toMatch(/^[a-z2-7]{12}$/);
    await api.closeTunnel(random.sessionId);

    agent.stop();
    await agent.done;
    await api.closeTunnel(session.sessionId).catch(() => {});
    await waitFor(() => !gateway.hasTunnel("agentaxio-test"), 5000, "closed");
    expect(await labelState("agentaxio-test")).toBe("offline");
    const idle = await publicRequest(gatewayPort, host, "/");
    expect(idle.status).toBe(503);
    expect(idle.headers["x-localians-gateway-error"]).toBe("offline");
  });

  it("free projects keep random links; checkout holds expire; lapsed passes release the name after the grace period", async () => {
    const { user, api } = await login("Custom Lapse");
    const p = await createProject(user.id, project("Lapse", app.port));
    await expect(api.createTunnel(p.id, app.port, 5, "custom")).rejects.toMatchObject({ status: 403, code: "plan_required" });

    // Checkout hold: reserved for 15 minutes, then anyone may take it.
    await prisma.$transaction((tx) => holdName(tx, { userId: user.id, workspaceId: p.workspaceId, projectId: p.id, name: "lapse-hold-name" }));
    await prisma.previewName.update({ where: { name: "lapse-hold-name" }, data: { heldUntil: new Date(Date.now() - 1000) } });
    await expireHolds();
    expect((await prisma.previewName.findUniqueOrThrow({ where: { name: "lapse-hold-name" } })).status).toBe("RELEASED");

    // Pass ended 4 days ago (beyond the 3-day grace): the name is released into quarantine.
    const { pass } = await grantPass({ projectId: p.id, source: "ADMIN", requestedName: "lapse-hold-name", actor: { type: "ADMIN" } });
    expect((await prisma.previewName.findUniqueOrThrow({ where: { name: "lapse-hold-name" } })).status).toBe("ACTIVE");
    await prisma.previewPass.update({ where: { id: pass.id }, data: { startsAt: new Date(Date.now() - 11 * DAY), endsAt: new Date(Date.now() - NAME_GRACE_MS - DAY) } });
    await releaseLapsedNames();
    const released = await prisma.previewName.findUniqueOrThrow({ where: { name: "lapse-hold-name" } });
    expect(released.status).toBe("RELEASED");
    expect(released.availableAt!.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });
});
