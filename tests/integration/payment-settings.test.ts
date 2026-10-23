import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { qrPath } from "@/lib/payment-qr";
import { projectInputSchema } from "@/lib/validation/project";
import type { AdminUser } from "@/server/admin";
import { prisma } from "@/server/db";
import { changeWallet, DEFAULT_RECIPIENT, getPaymentSettingsView, paymentsEnabled, resetPaymentQr, setPaymentsEnabled, uploadPaymentQr } from "@/server/payment-settings";
import { createProject } from "@/server/projects";
import { createUpgradeRequest, orderPayTo, paymentInfo, submitTxHash, verifyRequestOnChain } from "@/server/upgrades";
import { getCurrentWorkspace, removeWorkspaceAvatar, setWorkspaceAvatar } from "@/server/workspaces";
import { readOutbox } from "../setup/outbox";
import { createVerifiedUser } from "./helpers";

// Admin-managed payment settings (/admin/settings), payment QR uploads and workspace avatars.

const ADMIN_PASSWORD = "Settings-Admin-Password-77";
const NEW_WALLET = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
const NEW_WALLET_CHECKSUM = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (a: string) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const project = (name: string) => projectInputSchema.parse({ name, description: "", framework: "NEXTJS", defaultPort: "3000" });

// ---------------------------------------------------------------- minimal fake BNB Smart Chain node
const HEAD = 2_000_000;
const txs = new Map<string, { to: string; block: number; time: number }>();
let rpc: http.Server;
let admin: AdminUser;
let uploads: string;

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
      result = tx
        ? { status: "0x1", blockNumber: `0x${tx.block.toString(16)}`, logs: [{ address: USDT, topics: [TRANSFER, pad("0x1111111111111111111111111111111111111111"), pad(tx.to)], data: `0x${(5_000_000n * 10n ** 12n).toString(16)}` }] }
        : null;
    }
    if (method === "eth_getBlockByNumber") {
      const tx = [...txs.values()].find((t) => t.block === Number(BigInt(params[0])));
      result = { timestamp: `0x${Math.floor((tx?.time ?? Date.now()) / 1000).toString(16)}` };
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  });
  await new Promise<void>((r) => rpc.listen(0, "127.0.0.1", r));
  process.env.BSC_RPC_URL = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), "localians-uploads-"));
  process.env.LOCALIANS_UPLOAD_DIR = uploads;

  // An administrator with a known password (the wallet change re-checks it).
  const { user } = await createVerifiedUser("Settings Admin");
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: await hashPassword(ADMIN_PASSWORD) } });
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  admin = { id: row.id, email: row.email, name: row.name, publicId: row.publicId };
  await prisma.paymentSetting.upsert({ where: { id: 1 }, create: { id: 1, enabled: true, recipient: DEFAULT_RECIPIENT }, update: { enabled: true, recipient: DEFAULT_RECIPIENT, qrImageId: null } });
});

afterAll(async () => {
  await prisma.paymentSetting.update({ where: { id: 1 }, data: { enabled: true, recipient: DEFAULT_RECIPIENT, qrImageId: null } });
  delete process.env.BSC_RPC_URL;
  delete process.env.LOCALIANS_UPLOAD_DIR;
  delete process.env.PAYMENTS_EMERGENCY_DISABLE;
  fs.rmSync(uploads, { recursive: true, force: true });
  await new Promise((r) => rpc.close(r));
});

async function buyer(name: string) {
  const { user } = await createVerifiedUser(name);
  await prisma.user.update({ where: { id: user.id }, data: { username: name.toLowerCase().replace(/\W+/g, "_").slice(0, 20) } });
  return { user, p: await createProject(user.id, project(`${name} App`)) };
}
const svgQr = (text: string) => {
  const qr = qrPath(text);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="${qr.size * 8}" height="${qr.size * 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`,
  );
};
const asFile = (bytes: Uint8Array | Buffer, name = "upload.png", type = "image/png") => new File([new Uint8Array(bytes)], name, { type });
const qrPng = async (text: string) => asFile(await sharp(svgQr(text)).png().toBuffer());
const solidPng = async (color: string, size = 300) => asFile(await sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer());

describe("payment settings", () => {
  it("the admin toggle is the single authority: it gates new orders, is audited, and the emergency switch overrides it", async () => {
    const { user, p } = await buyer("Toggle Buyer");
    await setPaymentsEnabled(admin, false);
    expect(await paymentsEnabled()).toBe(false);
    expect(await paymentInfo()).toMatchObject({ enabled: false, recipient: null, qr: null, qrImageUrl: null });
    await expect(createUpgradeRequest(user.id, p.id)).rejects.toMatchObject({ code: "disabled" });
    await setPaymentsEnabled(admin, true);
    expect(await paymentsEnabled()).toBe(true);
    const logs = await prisma.auditLog.findMany({ where: { actorId: admin.id, action: { in: ["payments.disabled", "payments.enabled"] } }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.action, l.detail])).toEqual([
      ["payments.disabled", { previous: true, next: false }],
      ["payments.enabled", { previous: false, next: true }],
    ]);

    process.env.PAYMENTS_EMERGENCY_DISABLE = "on";
    try {
      expect(await paymentsEnabled()).toBe(false);
      await expect(createUpgradeRequest(user.id, p.id)).rejects.toMatchObject({ code: "disabled" });
      expect(await getPaymentSettingsView()).toMatchObject({ enabled: true, effective: false, emergencyDisabled: true });
    } finally {
      delete process.env.PAYMENTS_EMERGENCY_DISABLE;
    }

    // Once the setting exists, PAYMENTS_ENABLED in the environment no longer decides anything.
    await setPaymentsEnabled(admin, false);
    process.env.PAYMENTS_ENABLED = "on";
    try {
      expect(await paymentsEnabled()).toBe(false);
    } finally {
      delete process.env.PAYMENTS_ENABLED;
      await setPaymentsEnabled(admin, true);
    }
  });

  it("wallet changes need the admin password and a valid address, are audited and emailed, and never touch existing orders", async () => {
    await expect(changeWallet(admin, { address: NEW_WALLET, password: "not-the-password" })).rejects.toThrow("password isn't correct");
    expect(await prisma.auditLog.count({ where: { actorId: admin.id, action: "payments.reauth_failed" } })).toBe(1);
    await expect(changeWallet(admin, { address: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD", password: ADMIN_PASSWORD })).rejects.toThrow("checksum");
    await expect(changeWallet(admin, { address: "0x123", password: ADMIN_PASSWORD })).rejects.toThrow("BNB Smart Chain address");
    await expect(changeWallet(admin, { address: "0x0000000000000000000000000000000000000000", password: ADMIN_PASSWORD })).rejects.toThrow("zero address");
    await expect(changeWallet(admin, { address: DEFAULT_RECIPIENT, password: ADMIN_PASSWORD })).rejects.toThrow("already the configured wallet");

    const before = await buyer("Before Change");
    const old = (await createUpgradeRequest(before.user.id, before.p.id)).request;
    expect(old.recipient).toBe(DEFAULT_RECIPIENT);

    expect(await changeWallet(admin, { address: NEW_WALLET_CHECKSUM, password: ADMIN_PASSWORD })).toEqual({ previous: DEFAULT_RECIPIENT, next: NEW_WALLET });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "payments.wallet_changed" }, orderBy: { createdAt: "desc" } });
    expect(log.detail).toMatchObject({ previous: DEFAULT_RECIPIENT, next: NEW_WALLET });
    const mail = readOutbox("hello@thinxify.com", "payment-destination-changed").at(-1);
    expect(mail?.text).toContain(DEFAULT_RECIPIENT);
    expect(mail?.text).toContain(NEW_WALLET);

    // The old order keeps its wallet; new orders and the checkout use the new one.
    const after = await buyer("After Change");
    const fresh = (await createUpgradeRequest(after.user.id, after.p.id)).request;
    expect(fresh.recipient).toBe(NEW_WALLET);
    expect((await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: old.id } })).recipient).toBe(DEFAULT_RECIPIENT);
    expect(orderPayTo(old, true)?.recipient).toBe(DEFAULT_RECIPIENT);
    expect(orderPayTo(old, false)).toBeNull();
    expect((await paymentInfo()).recipient).toBe(NEW_WALLET);

    // Verification checks each order against its own destination, not the current setting.
    txs.set(`0x${"a1".repeat(32)}`, { to: DEFAULT_RECIPIENT, block: HEAD - 30, time: Date.now() });
    await submitTxHash(before.user.id, old.orderId, `0x${"a1".repeat(32)}`);
    expect((await verifyRequestOnChain(admin, old.orderId)).ok).toBe(true);
    txs.set(`0x${"b2".repeat(32)}`, { to: DEFAULT_RECIPIENT, block: HEAD - 31, time: Date.now() });
    await submitTxHash(after.user.id, fresh.orderId, `0x${"b2".repeat(32)}`);
    expect((await verifyRequestOnChain(admin, fresh.orderId)).ok).toBe(false);

    await changeWallet(admin, { address: DEFAULT_RECIPIENT, password: ADMIN_PASSWORD });
  });

  it("QR uploads must decode to the configured wallet; unsafe or wrong files are rejected; orders keep the QR they were shown", async () => {
    await expect(uploadPaymentQr(admin, await qrPng(NEW_WALLET))).rejects.toThrow("not the configured wallet");
    await expect(uploadPaymentQr(admin, asFile(new TextEncoder().encode("not an image at all")))).rejects.toThrow("PNG, JPEG or WebP");
    await expect(uploadPaymentQr(admin, asFile(svgQr(DEFAULT_RECIPIENT)))).rejects.toThrow("PNG, JPEG or WebP"); // SVG renamed .png
    await expect(uploadPaymentQr(admin, await solidPng("#ffffff"))).rejects.toThrow("No QR code");
    await expect(uploadPaymentQr(admin, asFile(new Uint8Array(3 * 1024 * 1024)))).rejects.toThrow("2 MB");
    expect(await prisma.mediaFile.count({ where: { kind: "payment_qr" } })).toBe(0);

    await uploadPaymentQr(admin, await qrPng(DEFAULT_RECIPIENT));
    const media = await prisma.mediaFile.findFirstOrThrow({ where: { kind: "payment_qr" } });
    expect(media).toMatchObject({ qrData: DEFAULT_RECIPIENT, contentType: "image/png" });
    expect(media.storageKey).toMatch(/^qr-[0-9a-f]{32}\.png$/);
    expect(fs.existsSync(path.join(uploads, media.storageKey))).toBe(true);
    expect((await paymentInfo()).qrImageUrl).toBe(`/api/media/payment-qr/${media.id}`);

    const b = await buyer("Qr Buyer");
    const order = (await createUpgradeRequest(b.user.id, b.p.id)).request;
    expect(order.qrImageId).toBe(media.id);

    // A wallet change drops the uploaded QR for new orders; the order (and the file) keep it.
    await changeWallet(admin, { address: NEW_WALLET, password: ADMIN_PASSWORD });
    expect((await paymentInfo()).qrImageUrl).toBeNull();
    expect((await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: order.id } })).qrImageId).toBe(media.id);
    expect(orderPayTo(order, true)?.qrImageUrl).toBe(`/api/media/payment-qr/${media.id}`);
    expect(fs.existsSync(path.join(uploads, media.storageKey))).toBe(true);
    await changeWallet(admin, { address: DEFAULT_RECIPIENT, password: ADMIN_PASSWORD });
    await resetPaymentQr(admin);
  });
});

describe("workspace avatars", () => {
  it("owners set, replace and remove it (256px WebP, old file deleted); members and outsiders can't; bad files are refused", async () => {
    const { user: owner } = await createVerifiedUser("Avatar Owner");
    const ws = await getCurrentWorkspace(owner.id);
    expect(ws.avatarUrl).toBeNull();

    const url = await setWorkspaceAvatar(owner.id, ws.id, await solidPng("#3366ff"));
    const first = await prisma.mediaFile.findFirstOrThrow({ where: { kind: "workspace_avatar", workspaceId: ws.id } });
    expect(url).toBe(`/api/media/workspace-avatar/${ws.id}?v=${first.id}`);
    expect(first).toMatchObject({ contentType: "image/webp", width: 256, height: 256 });

    await setWorkspaceAvatar(owner.id, ws.id, await solidPng("#ff3366"));
    expect(fs.existsSync(path.join(uploads, first.storageKey))).toBe(false);
    expect(await prisma.mediaFile.count({ where: { kind: "workspace_avatar", workspaceId: ws.id } })).toBe(1);

    const { user: member } = await createVerifiedUser("Avatar Member");
    await prisma.workspaceMember.create({ data: { workspaceId: ws.id, userId: member.id, role: "MEMBER" } });
    await expect(setWorkspaceAvatar(member.id, ws.id, await solidPng("#000000"))).rejects.toThrow("Only the workspace owner");
    const { user: stranger } = await createVerifiedUser("Avatar Stranger");
    await expect(removeWorkspaceAvatar(stranger.id, ws.id)).rejects.toThrow();

    await expect(setWorkspaceAvatar(owner.id, ws.id, asFile(new TextEncoder().encode("<svg onload=alert(1)>")))).rejects.toThrow("PNG, JPEG or WebP");
    await expect(setWorkspaceAvatar(owner.id, ws.id, await solidPng("#00ff00", 8))).rejects.toThrow("too small");

    await removeWorkspaceAvatar(owner.id, ws.id);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: ws.id } })).avatarId).toBeNull();
    expect(await prisma.mediaFile.count({ where: { kind: "workspace_avatar", workspaceId: ws.id } })).toBe(0);
  });
});
