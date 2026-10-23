import http from "node:http";
import type { AddressInfo } from "node:net";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { projectInputSchema } from "@/lib/validation/project";
import type { AdminUser } from "@/server/admin";
import { prisma } from "@/server/db";
import { DEFAULT_RECIPIENT, getPassOffer, updatePricing } from "@/server/payment-settings";
import { createProject } from "@/server/projects";
import { approveRequest, createUpgradeRequest, markUnderReview, paymentInfo, submitTxHash, verifyRequestOnChain } from "@/server/upgrades";
import { readOutbox } from "../setup/outbox";
import { createVerifiedUser } from "./helpers";

// Admin-controlled pricing: new orders use the latest server-side price and length; existing orders keep theirs.

const ADMIN_PASSWORD = "Pricing-Admin-Password-91";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const HEAD = 3_000_000;
const txs = new Map<string, { micros: bigint; block: number }>();
let rpc: http.Server;
let admin: AdminUser;

beforeAll(async () => {
  rpc = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { method, params } = JSON.parse(body) as { method: string; params: string[] };
    let result: unknown = null;
    if (method === "eth_chainId") result = "0x38";
    if (method === "eth_blockNumber") result = `0x${HEAD.toString(16)}`;
    if (method === "eth_getTransactionReceipt") {
      const tx = txs.get(params[0]);
      result = tx ? { status: "0x1", blockNumber: `0x${tx.block.toString(16)}`, logs: [{ address: USDT, topics: [TRANSFER, pad("0x1111111111111111111111111111111111111111"), pad(DEFAULT_RECIPIENT)], data: `0x${(tx.micros * 10n ** 12n).toString(16)}` }] } : null;
    }
    if (method === "eth_getBlockByNumber") result = { timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  process.env.BSC_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
  const { user } = await createVerifiedUser("Pricing Admin");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: await hashPassword(ADMIN_PASSWORD) } });
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  admin = { id: row.id, email: row.email, name: row.name, publicId: row.publicId };
  await prisma.paymentSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true, recipient: DEFAULT_RECIPIENT }, update: { enabled: true, recipient: DEFAULT_RECIPIENT, qrImageId: null, priceMicros: 5_000_000n, passDays: 7 } });
});

afterAll(async () => {
  await prisma.paymentSetting.update({ where: { id: 1 }, data: { priceMicros: 5_000_000n, passDays: 7, pricingUpdatedAt: null } });
  delete process.env.BSC_RPC_URL;
  await new Promise((r) => rpc.close(r));
});

async function buyer(name: string) {
  const { user } = await createVerifiedUser(name);
  await prisma.user.update({ where: { id: user.id }, data: { username: name.toLowerCase().replace(/\W+/g, "_").slice(0, 20) } });
  return { user, p: await createProject(user.id, projectInputSchema.parse({ name: `${name} App`, description: "", framework: "NEXTJS", defaultPort: "3000" })) };
}

describe("admin pricing", () => {
  it("needs the admin password and valid values, is audited, and only changes NEW orders", async () => {
    expect(await getPassOffer()).toMatchObject({ priceLabel: "$5", days: 7 });
    await expect(updatePricing(admin, { price: "9.99", days: "14", password: "wrong-password" })).rejects.toThrow("password isn't correct");
    await expect(updatePricing(admin, { price: "0.50", days: "14", password: ADMIN_PASSWORD })).rejects.toThrow("between $1 and $500");
    await expect(updatePricing(admin, { price: "4.999", days: "14", password: ADMIN_PASSWORD })).rejects.toThrow("US dollars");
    await expect(updatePricing(admin, { price: "9.99", days: "90", password: ADMIN_PASSWORD })).rejects.toThrow("1 to 60 days");
    await expect(updatePricing(admin, { price: "5", days: "7", password: ADMIN_PASSWORD })).rejects.toThrow("already the current");
    // The database refuses out-of-range values even if the app didn't.
    await expect(prisma.paymentSetting.update({ where: { id: 1 }, data: { priceMicros: 1_234_567n } })).rejects.toThrow();

    const before = await buyer("Old Price Buyer");
    const old = (await createUpgradeRequest(before.user.id, before.p.id)).request;
    expect(old).toMatchObject({ amountMicros: 5_000_000n, passDays: 7 });

    const change = await updatePricing(admin, { price: "$9.99", days: "14", password: ADMIN_PASSWORD });
    expect(change.next).toMatchObject({ priceLabel: "$9.99", usdtLabel: "9.99 USDT", days: 14, name: "14-Day Preview Pass" });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "payments.pricing_changed" }, orderBy: { createdAt: "desc" } });
    expect(log).toMatchObject({ actorId: admin.id, detail: { previous: { priceMicros: "5000000", days: 7 }, next: { priceMicros: "9990000", days: 14 } } });
    expect((await prisma.paymentSetting.findUniqueOrThrow({ where: { id: 1 } })).pricingUpdatedAt).not.toBeNull();

    // The checkout shows the new price; a new order snapshots it (never anything from the client).
    expect(await paymentInfo()).toMatchObject({ amountLabel: "9.99 USDT", offer: { priceLabel: "$9.99", days: 14 } });
    const after = await buyer("New Price Buyer");
    const fresh = (await createUpgradeRequest(after.user.id, after.p.id)).request;
    expect(fresh).toMatchObject({ amountMicros: 9_990_000n, passDays: 14, product: "PASS_14D" });
    expect(await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ amountMicros: 5_000_000n, passDays: 7 });

    // On-chain verification requires each order's own amount: 5 USDT pays the old order, not the new one.
    txs.set(`0x${"c3".repeat(32)}`, { micros: 5_000_000n, block: HEAD - 40 });
    await submitTxHash(after.user.id, fresh.orderId, `0x${"c3".repeat(32)}`);
    expect((await verifyRequestOnChain(admin, fresh.orderId)).ok).toBe(false);
    txs.set(`0x${"d4".repeat(32)}`, { micros: 9_990_000n, block: HEAD - 41 });
    await submitTxHash(after.user.id, fresh.orderId, `0x${"d4".repeat(32)}`);
    await markUnderReview(admin, fresh.orderId);
    expect((await verifyRequestOnChain(admin, fresh.orderId)).ok).toBe(true);
    txs.set(`0x${"e5".repeat(32)}`, { micros: 5_000_000n, block: HEAD - 42 });
    await submitTxHash(before.user.id, old.orderId, `0x${"e5".repeat(32)}`);
    await markUnderReview(admin, old.orderId);
    expect((await verifyRequestOnChain(admin, old.orderId)).ok).toBe(true);

    // Each pass lasts what its order said.
    const day = 86_400_000;
    const newPass = await approveRequest(admin, fresh.orderId);
    expect(Math.round((newPass.endsAt.getTime() - newPass.startsAt.getTime()) / day)).toBe(14);
    const oldPass = await approveRequest(admin, old.orderId);
    expect(Math.round((oldPass.endsAt.getTime() - oldPass.startsAt.getTime()) / day)).toBe(7);
    expect(readOutbox(after.user.email, "pass-activated").at(-1)?.subject).toContain("14-Day Preview Pass");
    expect(readOutbox(before.user.email, "pass-activated").at(-1)?.subject).toContain("7-Day Preview Pass");

    await updatePricing(admin, { price: "5", days: "7", password: ADMIN_PASSWORD });
  });
});
