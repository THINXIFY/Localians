import { execFileSync } from "node:child_process";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectInputSchema } from "@/lib/validation/project";
import { type AdminUser, deleteUser, getUserDetail, listUsers, reactivateUser, suspendUser } from "@/server/admin";
import { authenticateCli } from "@/server/cli/credentials";
import { prisma } from "@/server/db";
import { getProjectPlan } from "@/server/plans";
import { DEFAULT_RECIPIENT, getPassOffer } from "@/server/payment-settings";
import { createProject } from "@/server/projects";
import {
  adminSetTxHash,
  approveRequest,
  cancelUpgradeRequest,
  createUpgradeRequest,
  markUnderReview,
  paymentInfo,
  PASS_PRICE,
  rejectRequest,
  submitTxHash,
  UpgradeError,
  verifyRequestOnChain,
} from "@/server/upgrades";
import { readOutbox } from "../setup/outbox";
import { TEST_DATABASE_URL } from "../setup/paths";
import { createVerifiedUser } from "./helpers";

const root = path.resolve(__dirname, "..", "..");
const project = (name: string) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: "3000" });
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const units = (usdt: number) => `0x${(BigInt(Math.round(usdt * 1_000_000)) * 10n ** 12n).toString(16)}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

// ---------------------------------------------------------------- fake BNB Smart Chain JSON-RPC
type FakeTx = { status?: "0x1" | "0x0"; token?: string; to?: string; amount?: number; block?: number; time?: number };
const chain = { chainId: 56, head: 1_000_000, txs: new Map<string, FakeTx>(), blockTimes: new Map<number, number>() };
let rpcServer: http.Server;
/** Adds a fake transaction in its own block (so block-time lookups are unambiguous). */
function put(txHash: string, tx: FakeTx) {
  chain.txs.set(txHash, { block: chain.head - 20 - chain.txs.size, ...tx });
}
const eventually = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
};
let admin: AdminUser;

beforeAll(async () => {
  rpcServer = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { method, params } = JSON.parse(body) as { method: string; params: string[] };
    let result: unknown = null;
    if (method === "eth_chainId") result = `0x${chain.chainId.toString(16)}`;
    if (method === "eth_blockNumber") result = `0x${chain.head.toString(16)}`;
    if (method === "eth_getTransactionReceipt") {
      const tx = chain.txs.get(params[0]);
      result = tx
        ? {
            status: tx.status ?? "0x1",
            blockNumber: `0x${(tx.block ?? chain.head - 20).toString(16)}`,
            logs: [{ address: tx.token ?? USDT, topics: [TRANSFER, pad("0x1111111111111111111111111111111111111111"), pad(tx.to ?? DEFAULT_RECIPIENT)], data: units(tx.amount ?? 5) }],
          }
        : null;
    }
    if (method === "eth_getBlockByNumber") {
      const number = Number(BigInt(params[0]));
      const tx = [...chain.txs.values()].find((t) => (t.block ?? chain.head - 20) === number);
      result = { timestamp: `0x${Math.floor((tx?.time ?? Date.now()) / 1000).toString(16)}` };
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  await new Promise<void>((r) => rpcServer.listen(0, "127.0.0.1", r));
  process.env.BSC_RPC_URL = `http://127.0.0.1:${(rpcServer.address() as AddressInfo).port}`;
  process.env.ADMIN_NOTIFY_EMAIL = "admin-inbox@example.test";
  await setPayments(true);
});

/** The authoritative switch is the payment_settings row (what /admin/settings changes). */
async function setPayments(enabled: boolean) {
  await prisma.paymentSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled, recipient: DEFAULT_RECIPIENT }, update: { enabled } });
}

afterAll(async () => {
  delete process.env.BSC_RPC_URL;
  delete process.env.ADMIN_NOTIFY_EMAIL;
  await new Promise((r) => rpcServer?.close(r));
});

describe("admin bootstrap", () => {
  const run = (args: string[], password: string) =>
    execFileSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/create-admin.ts", ...args], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, LOCALIANS_ADMIN_PASSWORD: password },
      encoding: "utf8",
      stdio: "pipe",
    });

  it("creates one administrator from a privately supplied password, never prints it, and refuses to run twice", async () => {
    const weak = (() => {
      try {
        run(["--email", "boss@example.test"], "short");
        return "";
      } catch (error) {
        return String((error as { stderr?: string }).stderr);
      }
    })();
    expect(weak).toContain("Password not accepted");
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(0);

    const secret = "Admin-Bootstrap-Secret-42";
    const out = run(["--email", "boss@example.test"], secret);
    expect(out).toContain("Administrator created: boss@example.test");
    expect(out).not.toContain(secret);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: "boss@example.test" }, include: { accounts: true } });
    expect(row).toMatchObject({ role: "ADMIN", status: "ACTIVE", emailVerified: true, username: "admin" });
    expect(row.publicId).toMatch(/^LOC-\d{6}$/);
    expect(row.accounts[0].password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // Better Auth scrypt hash, not the password
    expect(row.accounts[0].password).not.toContain(secret);
    admin = { id: row.id, email: row.email, name: row.name, publicId: row.publicId };

    const again = (() => {
      try {
        run(["--email", "other@example.test"], secret);
        return "";
      } catch (error) {
        return String((error as { stderr?: string }).stderr);
      }
    })();
    expect(again).toContain("An administrator already exists");
  });
});

describe("accounts: public IDs, usernames, status", () => {
  it("assigns permanent sequential public IDs and enforces unique, well-formed usernames in the database", async () => {
    const a = await createVerifiedUser("Id One");
    const b = await createVerifiedUser("Id Two");
    const [ra, rb] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: a.user.id } }), prisma.user.findUniqueOrThrow({ where: { id: b.user.id } })]);
    expect(Number(rb.publicId.slice(4))).toBe(Number(ra.publicId.slice(4)) + 1);
    await prisma.user.update({ where: { id: a.user.id }, data: { username: "unique_name" } });
    await expect(prisma.user.update({ where: { id: b.user.id }, data: { username: "unique_name" } })).rejects.toMatchObject({ code: "P2002" });
    await expect(prisma.user.update({ where: { id: b.user.id }, data: { username: "Bad Name!" } })).rejects.toThrow();
  });

  it("lists and searches users without credentials; suspend cuts access; delete anonymises but keeps money records", async () => {
    const { user } = await createVerifiedUser("Managed User");
    await prisma.user.update({ where: { id: user.id }, data: { username: "managed_user" } });
    const found = await listUsers({ q: "managed_user" });
    expect(found.users.map((u) => u.id)).toEqual([user.id]);
    expect(JSON.stringify(found)).not.toMatch(/password|token/i);

    const p = await createProject(user.id, project("Managed App"));
    const credential = await prisma.cliCredential.create({ data: { userId: user.id, workspaceId: p.workspaceId, name: "t", tokenHash: "hash-managed", tokenPrefix: "lcl_x", expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.session.create({ data: { id: "managed-session", token: "managed-token", userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
    await suspendUser(admin, user.id, "Abuse report");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect((await prisma.cliCredential.findUniqueOrThrow({ where: { id: credential.id } })).revokedAt).not.toBeNull();
    const bearer = new Request("http://x", { headers: { authorization: "Bearer whatever" } });
    expect(await authenticateCli(bearer)).toBeNull();
    await reactivateUser(admin, user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("ACTIVE");

    const { request } = await createUpgradeRequest(user.id, p.id);
    const publicId = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).publicId;
    await expect(deleteUser(admin, user.id, "LOC-999999")).rejects.toThrow("to confirm");
    await deleteUser(admin, user.id, publicId);
    const gone = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(gone).toMatchObject({ status: "DELETED", name: "Deleted user", username: null });
    expect(gone.email).not.toContain("example.test");
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.upgradeRequest.findUnique({ where: { id: request.id } })).not.toBeNull(); // kept
    expect((await getUserDetail(publicId)).user.status).toBe("DELETED");
    expect(await prisma.auditLog.count({ where: { subjectId: user.id, action: { in: ["user.suspended", "user.reactivated", "user.deleted"] } } })).toBe(3);
  });

  it("admins can't be suspended or deleted through user management", async () => {
    await expect(suspendUser(admin, admin.id, "no")).rejects.toThrow();
  });
});

describe("7-Day Pass upgrade requests and verification", () => {
  async function buyer(name: string) {
    const { user } = await createVerifiedUser(name);
    await prisma.user.update({ where: { id: user.id }, data: { username: name.toLowerCase().replace(/\W+/g, "_").slice(0, 20) } });
    const p = await createProject(user.id, project(`${name} App`));
    return { user, p };
  }

  it("shows the wallet and QR only while payments are on, and never any of it otherwise", async () => {
    try {
      await setPayments(false);
      expect(await paymentInfo()).toMatchObject({ enabled: false, recipient: null, qr: null, qrImageUrl: null });
      await setPayments(true);
      expect(await paymentInfo()).toMatchObject({ enabled: true, recipient: "0x2f94b75535eff533378c90f8dda29cf10208b174" });
      expect((await paymentInfo()).qr).not.toBeNull();
    } finally {
      await setPayments(true);
    }
    expect(PASS_PRICE).toMatchObject({ currency: "USDT", network: "BSC" });
    expect(await getPassOffer()).toMatchObject({ priceMicros: "5000000", days: 7 }); // the default offer
    expect(DEFAULT_RECIPIENT).toBe("0x2f94b75535eff533378c90f8dda29cf10208b174");
  });

  it("request → hash → verify → approve activates 7 days and the custom URL, emails both sides, once", async () => {
    const { user, p } = await buyer("Happy Buyer");
    const { request, created } = await createUpgradeRequest(user.id, p.id, { name: "happy-buyer-app" });
    expect(created).toBe(true);
    expect(request.orderId).toMatch(/^ORD-[A-Z2-9]{8}$/);
    expect((await createUpgradeRequest(user.id, p.id)).request.id).toBe(request.id); // one open request per project
    expect(await eventually(() => readOutbox("admin-inbox@example.test", "upgrade-request-admin").some((m) => m.subject.includes(request.orderId)))).toBe(true);
    expect((await prisma.previewName.findUniqueOrThrow({ where: { name: "happy-buyer-app" } })).status).toBe("HELD");

    // Nothing activates before verification — a hash alone is not enough.
    put(hash(1), { amount: 5, time: Date.now() });
    await submitTxHash(user.id, request.orderId, hash(1).toUpperCase().replace("0X", "0x"));
    await expect(approveRequest(admin, request.orderId)).rejects.toMatchObject({ code: "unverified" });
    expect((await getProjectPlan(p, user.id)).pass).toBeNull();

    await markUnderReview(admin, request.orderId);
    const verification = await verifyRequestOnChain(admin, request.orderId);
    expect(verification.ok).toBe(true);
    expect(verification.checks.map((c) => c.id)).toEqual(["chain", "found", "success", "token", "recipient", "amount", "confirmations", "time"]);

    const [first, second] = await Promise.allSettled([approveRequest(admin, request.orderId), approveRequest(admin, request.orderId)]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]); // double approval is impossible
    expect(await prisma.previewPass.count({ where: { requestId: request.id } })).toBe(1);
    const plan = await getProjectPlan(p, user.id);
    expect(plan.pass).not.toBeNull();
    expect(Math.abs(plan.pass!.endsAt.getTime() - plan.pass!.startsAt.getTime() - 7 * 24 * 3600_000)).toBeLessThan(1000);
    expect((await prisma.previewName.findUniqueOrThrow({ where: { name: "happy-buyer-app" } })).status).toBe("ACTIVE");
    expect(readOutbox(user.email, "pass-activated").length).toBe(1);
    const approved = await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(approved).toMatchObject({ status: "APPROVED", reviewedById: admin.id });
  });

  it.each([
    ["wrong token", { token: "0x000000000000000000000000000000000000dead" }, "token"],
    ["wrong recipient", { to: "0x000000000000000000000000000000000000beef" }, "recipient"],
    ["underpaid", { amount: 4.99 }, "amount"],
    ["failed transaction", { status: "0x0" as const }, "success"],
    ["not enough confirmations", { block: 999_995 }, "confirmations"],
    ["paid before the request", { time: Date.now() - 3 * 24 * 3600_000 }, "time"],
  ])("rejects a %s on chain and won't approve it", async (label, tx, failing) => {
    const { user, p } = await buyer(`Bad ${label}`);
    const { request } = await createUpgradeRequest(user.id, p.id);
    const h = hash(100 + Object.keys(tx).length * 7 + label.length);
    put(h, { time: Date.now(), ...tx });
    await submitTxHash(user.id, request.orderId, h);
    const result = await verifyRequestOnChain(admin, request.orderId);
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => !c.ok)?.id).toBe(failing);
    await expect(approveRequest(admin, request.orderId)).rejects.toMatchObject({ code: "unverified" });
    // Even forcing the flag in the database can't approve without the reviewer and a passing check: CHECK constraint.
    await expect(prisma.upgradeRequest.update({ where: { id: request.id }, data: { status: "APPROVED" } })).rejects.toThrow();
  });

  it("rejects the wrong network and unknown transactions", async () => {
    const { user, p } = await buyer("Wrong Chain");
    const { request } = await createUpgradeRequest(user.id, p.id);
    await submitTxHash(user.id, request.orderId, hash(999));
    expect((await verifyRequestOnChain(admin, request.orderId)).checks.find((c) => !c.ok)?.id).toBe("found");
    chain.chainId = 1;
    try {
      expect((await verifyRequestOnChain(admin, request.orderId)).checks.find((c) => !c.ok)?.id).toBe("chain");
    } finally {
      chain.chainId = 56;
    }
  });

  it("a transaction hash can pay for one order only", async () => {
    const a = await buyer("Hash Owner");
    const b = await buyer("Hash Thief");
    const ra = (await createUpgradeRequest(a.user.id, a.p.id)).request;
    const rb = (await createUpgradeRequest(b.user.id, b.p.id)).request;
    put(hash(7), { time: Date.now() });
    await submitTxHash(a.user.id, ra.orderId, hash(7));
    await expect(submitTxHash(b.user.id, rb.orderId, hash(7))).rejects.toMatchObject({ code: "duplicate_hash" });
    await expect(adminSetTxHash(admin, rb.orderId, hash(7))).rejects.toMatchObject({ code: "duplicate_hash" });
    // Someone else's order can't be touched at all.
    await expect(submitTxHash(b.user.id, ra.orderId, hash(8))).rejects.toThrow("Order not found");
  });

  it("reject and cancel close requests without creating entitlements; requests are off when the flag is off", async () => {
    const { user, p } = await buyer("Rejected Buyer");
    const { request } = await createUpgradeRequest(user.id, p.id);
    await rejectRequest(admin, request.orderId, "No matching transfer found");
    expect(readOutbox(user.email, "upgrade-rejected").length).toBe(1);
    expect(await prisma.previewPass.count({ where: { projectId: p.id } })).toBe(0);
    await expect(approveRequest(admin, request.orderId)).rejects.toBeInstanceOf(UpgradeError);

    const again = await createUpgradeRequest(user.id, p.id);
    await cancelUpgradeRequest(user.id, again.request.orderId);
    expect((await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: again.request.id } })).status).toBe("CANCELLED");

    await setPayments(false);
    try {
      await expect(createUpgradeRequest(user.id, p.id)).rejects.toMatchObject({ code: "disabled" });
    } finally {
      await setPayments(true);
    }
  });
});
