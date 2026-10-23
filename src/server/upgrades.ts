import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { qrPath } from "@/lib/payment-qr";
import type { AdminUser } from "./admin";
import { audit } from "./audit";
import { BSC, TX_HASH, verifyUsdtTransfer, type TransferVerification } from "./bsc";
import { getTunnelConfig, previewUrl, siteUrl } from "./cli/config";
import { prisma } from "./db";
import { sendEmail } from "./email/send";
import { passActivatedMessage, upgradeRejectedMessage, upgradeRequestAdminMessage } from "./email/templates";
import { NotFoundError } from "./errors";
import { log } from "./log";
import { grantPassInTx, notifyGateways } from "./passes";
import { afterPaymentMessage, makeOffer } from "@/lib/offer";
import { currentQrImageId, getPassOffer, getPaymentSettings, paymentQrImageUrl, paymentsEnabled } from "./payment-settings";
import { holdName } from "./preview-names";
import { getProjectForUser } from "./projects";
import { requireMembership } from "./workspaces";

/**
 * 7-Day Pass purchases by manual USDT payment:
 *
 *   customer: Upgrade → request (Order ID) → pays 5 USDT on BSC → submits the transaction hash (and/or emails it)
 *   admin:    Mark under review → Verify on BSC (server-side checks) → Approve & Activate | Reject
 *
 * Approval is atomic (request locked, pass created, request APPROVED in one transaction) and only possible after a
 * passing on-chain verification, recorded on the request (also enforced by a database CHECK). A transaction hash can
 * belong to one request only (unique). Whether requests can be taken, and the wallet new orders pay to, come from the
 * admin-managed payment settings (payment-settings.ts); each order snapshots its wallet and QR.
 */
/** What every pass is paid in. The price and length come from the admin settings (getPassOffer) and are snapshotted per order. */
export const PASS_PRICE = {
  currency: "USDT",
  network: "BSC",
  networkLabel: "BNB Smart Chain (BEP20)",
} as const;

export const SUPPORT_EMAIL = "hello@thinxify.com";
export { afterPaymentMessage };

const adminNotifyEmail = () => process.env.ADMIN_NOTIFY_EMAIL?.trim() || SUPPORT_EMAIL;

/** The QR for a wallet, generated from the address itself (tests decode it back to that exact address). */
const RECIPIENT_FORMAT = /^0x[0-9a-f]{40}$/;
export function paymentQr(recipient: string) {
  if (!RECIPIENT_FORMAT.test(recipient)) {
    log("error", "payment recipient is not a valid address; QR hidden");
    return null;
  }
  return qrPath(recipient);
}

export { paymentsEnabled };

export class UpgradeError extends Error {
  constructor(
    readonly code: "disabled" | "invalid" | "not_found" | "state" | "duplicate_hash" | "unverified" | "project_gone" | "rate_limited",
    message: string,
  ) {
    super(message);
  }
}

const ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newOrderId = () => `ORD-${Array.from(randomBytes(8), (b) => ORDER_ALPHABET[b % 32]).join("")}`;
const OPEN = ["PENDING", "UNDER_REVIEW"] as const;
const dashboardUrl = (projectId: string | null) => `${siteUrl()}/dashboard${projectId ? `/projects/${projectId}#plan` : ""}`;

async function notifyAdmin(requestId: string, txHash?: string | null) {
  const r = await prisma.upgradeRequest.findUnique({ where: { id: requestId }, select: { orderId: true, projectName: true, user: { select: { username: true, email: true, publicId: true } } } });
  if (!r) return;
  await sendEmail(
    upgradeRequestAdminMessage({ to: adminNotifyEmail(), orderId: r.orderId, username: r.user.username ?? r.user.publicId, email: r.user.email, projectName: r.projectName, txHash, url: `${siteUrl()}/admin/payments/${r.orderId}` }),
  ).catch((error) => log("error", "admin upgrade notification failed", { error: error instanceof Error ? error.message : "unknown" }));
}

// ------------------------------------------------------------------ customer

/**
 * Creates (or returns the open) upgrade request for a project, holding the chosen custom URL for 15 minutes. Any
 * member of the project's workspace may request; the pass applies to the project.
 */
export async function createUpgradeRequest(userId: string, projectId: string, input: { name?: string | null } = {}) {
  if (!(await paymentsEnabled())) throw new UpgradeError("disabled", "The Preview Pass isn't available to buy yet.");
  // Make sure the settings row exists before the transaction reads it.
  await getPaymentSettings();
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  const open = await prisma.upgradeRequest.findFirst({ where: { projectId: project.id, status: { in: [...OPEN] } } });
  if (open) return { request: open, created: false };
  if ((await prisma.upgradeRequest.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } })) >= 10) {
    throw new UpgradeError("rate_limited", "Too many upgrade requests today. Contact hello@thinxify.com if you need help.");
  }
  try {
    const request = await prisma.$transaction(async (tx) => {
      const name = input.name?.trim() ? (await holdName(tx, { userId, workspaceId: project.workspaceId, projectId: project.id, name: input.name })).name : null;
      // Snapshot where this order pays to: later settings changes never alter it, and it is verified against it.
      const settings = await tx.paymentSetting.findUniqueOrThrow({ where: { id: 1 } });
      const qrImageId = await currentQrImageId(settings);
      const created = await tx.upgradeRequest.create({
        data: {
          orderId: newOrderId(),
          userId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          projectName: project.name,
          // Price and length are taken from the server-side settings at this moment, never from the client.
          product: `PASS_${settings.passDays}D`,
          amountMicros: settings.priceMicros,
          passDays: settings.passDays,
          currency: PASS_PRICE.currency,
          network: PASS_PRICE.network,
          recipient: settings.recipient,
          qrImageId,
          requestedName: name,
        },
      });
      await audit(tx, { workspaceId: project.workspaceId, actor: { type: "USER", id: userId }, action: "upgrade.requested", subject: { type: "upgrade_request", id: created.id }, detail: { orderId: created.orderId, projectId: project.id } });
      return created;
    });
    void notifyAdmin(request.id);
    log("info", "upgrade requested", { orderId: request.orderId });
    return { request, created: true };
  } catch (error) {
    // A concurrent click created the open request first (one open request per project).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.upgradeRequest.findFirst({ where: { projectId: project.id, status: { in: [...OPEN] } } });
      if (existing) return { request: existing, created: false };
    }
    throw error;
  }
}

async function ownRequest(userId: string, orderId: string) {
  const request = await prisma.upgradeRequest.findUnique({ where: { orderId } });
  if (!request) throw new NotFoundError("Order not found.");
  await requireMembership(userId, request.workspaceId).catch(() => {
    throw new NotFoundError("Order not found.");
  });
  return request;
}

/** The customer adds the transaction hash (verification still happens on the admin side). */
export async function submitTxHash(userId: string, orderId: string, raw: string) {
  const hash = String(raw ?? "").trim().toLowerCase();
  if (!TX_HASH.test(hash)) throw new UpgradeError("invalid", "Paste the transaction hash: 0x followed by 64 letters and numbers.");
  const request = await ownRequest(userId, orderId);
  if (!OPEN.includes(request.status as (typeof OPEN)[number])) throw new UpgradeError("state", "This order is already closed.");
  if (request.txHash === hash) return request;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.upgradeRequest.update({ where: { id: request.id }, data: { txHash: hash, txSubmittedAt: new Date(), verifiedOk: false, verification: Prisma.DbNull, verifiedAt: null } });
      await audit(tx, { workspaceId: request.workspaceId, actor: { type: "USER", id: userId }, action: "upgrade.tx_submitted", subject: { type: "upgrade_request", id: request.id }, detail: { orderId, txHash: hash } });
      return row;
    });
    void notifyAdmin(request.id, hash);
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new UpgradeError("duplicate_hash", "That transaction was already submitted for another order.");
    throw error;
  }
}

export async function cancelUpgradeRequest(userId: string, orderId: string) {
  const request = await ownRequest(userId, orderId);
  const { count } = await prisma.upgradeRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (!count) throw new UpgradeError("state", "Only pending orders can be cancelled.");
  await audit(prisma, { workspaceId: request.workspaceId, actor: { type: "USER", id: userId }, action: "upgrade.cancelled", subject: { type: "upgrade_request", id: request.id }, detail: { orderId } });
}

/** The project's most recent upgrade request, for the dashboard. */
export async function getProjectUpgrade(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const request = await prisma.upgradeRequest.findFirst({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, status: true, txHash: true, createdAt: true, requestedName: true, reviewNote: true, reviewedAt: true },
  });
  return request;
}

// ------------------------------------------------------------------ admin

export async function listUpgradeRequests({ status, q }: { status?: string; q?: string } = {}) {
  const query = (q ?? "").trim().slice(0, 100);
  const where: Prisma.UpgradeRequestWhereInput = {
    ...(status === "open" ? { status: { in: [...OPEN] } } : status && ["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"].includes(status) ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            { orderId: { contains: query.toUpperCase() } },
            { txHash: { contains: query.toLowerCase() } },
            { user: { username: { contains: query.toLowerCase() } } },
            { user: { email: { contains: query, mode: "insensitive" } } },
            { projectName: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return prisma.upgradeRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, orderId: true, status: true, amountMicros: true, currency: true, txHash: true, projectName: true, createdAt: true, verifiedOk: true, user: { select: { username: true, email: true, publicId: true } } },
  });
}

export async function getUpgradeRequest(orderId: string) {
  const request = await prisma.upgradeRequest.findUnique({
    where: { orderId },
    include: {
      user: { select: { publicId: true, username: true, email: true, name: true, status: true } },
      project: { select: { id: true, name: true, status: true } },
      pass: { select: { startsAt: true, endsAt: true, status: true } },
    },
  });
  if (!request) throw new NotFoundError("Order not found.");
  const reviewer = request.reviewedById ? await prisma.user.findUnique({ where: { id: request.reviewedById }, select: { email: true } }) : null;
  return { ...request, reviewerEmail: reviewer?.email ?? null, verification: request.verification as TransferVerification | null };
}

async function lockRequest(tx: Prisma.TransactionClient, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM upgrade_requests WHERE "orderId" = ${orderId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundError("Order not found.");
  return tx.upgradeRequest.findUniqueOrThrow({ where: { id: rows[0].id } });
}

export async function markUnderReview(admin: AdminUser, orderId: string) {
  await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, orderId);
    if (request.status !== "PENDING") throw new UpgradeError("state", "Only pending orders can be marked under review.");
    await tx.upgradeRequest.update({ where: { id: request.id }, data: { status: "UNDER_REVIEW", reviewedById: admin.id } });
    await audit(tx, { workspaceId: request.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "upgrade.under_review", subject: { type: "upgrade_request", id: request.id }, detail: { orderId } });
  });
}

/** Runs the on-chain checks for the request's transaction and records the result on it. */
export async function verifyRequestOnChain(admin: AdminUser, orderId: string) {
  const request = await prisma.upgradeRequest.findUnique({ where: { orderId } });
  if (!request) throw new NotFoundError("Order not found.");
  if (!request.txHash) throw new UpgradeError("invalid", "The customer hasn't submitted a transaction hash yet. Add it from their email, then verify.");
  if (!OPEN.includes(request.status as (typeof OPEN)[number])) throw new UpgradeError("state", "This order is already closed.");
  const result = await verifyUsdtTransfer({
    txHash: request.txHash,
    recipient: request.recipient,
    minMicros: request.amountMicros,
    notBefore: new Date(request.createdAt.getTime() - 10 * 60_000),
  });
  await prisma.$transaction(async (tx) => {
    await tx.upgradeRequest.update({ where: { id: request.id }, data: { verification: result as unknown as Prisma.InputJsonValue, verifiedAt: new Date(), verifiedOk: result.ok } });
    await audit(tx, { workspaceId: request.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "upgrade.verified", subject: { type: "upgrade_request", id: request.id }, detail: { orderId, ok: result.ok, failed: result.checks.filter((c) => !c.ok).map((c) => c.id) } });
  });
  return result;
}

/** Lets the admin attach a hash the customer sent by email (it must still pass verification). */
export async function adminSetTxHash(admin: AdminUser, orderId: string, raw: string) {
  const hash = String(raw ?? "").trim().toLowerCase();
  if (!TX_HASH.test(hash)) throw new UpgradeError("invalid", "Not a valid transaction hash.");
  await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, orderId);
    if (!OPEN.includes(request.status as (typeof OPEN)[number])) throw new UpgradeError("state", "This order is already closed.");
    try {
      await tx.upgradeRequest.update({ where: { id: request.id }, data: { txHash: hash, txSubmittedAt: new Date(), verifiedOk: false, verification: Prisma.DbNull, verifiedAt: null } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new UpgradeError("duplicate_hash", "That transaction is already attached to another order.");
      throw error;
    }
    await audit(tx, { workspaceId: request.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "upgrade.tx_set_by_admin", subject: { type: "upgrade_request", id: request.id }, detail: { orderId, txHash: hash } });
  });
}

/** Verification older than this must be re-run before approving. */
const VERIFICATION_FRESH_MS = 24 * 3600_000;

/**
 * Approve & Activate: one transaction that locks the request, requires a fresh passing verification, creates the
 * 7-Day Pass (idempotent per request), applies the held custom URL and records the reviewer. Double clicks and
 * concurrent admins can't activate twice (row lock + unique requestId on the pass).
 */
export async function approveRequest(admin: AdminUser, orderId: string) {
  const outcome = await prisma.$transaction(async (tx) => {
    const request = await lockRequest(tx, orderId);
    if (request.status === "APPROVED") throw new UpgradeError("state", "This order is already approved.");
    if (!OPEN.includes(request.status as (typeof OPEN)[number])) throw new UpgradeError("state", "This order is closed.");
    if (!request.txHash || !request.verifiedOk || !request.verifiedAt || Date.now() - request.verifiedAt.getTime() > VERIFICATION_FRESH_MS) {
      throw new UpgradeError("unverified", "Run “Verify on BSC” and make sure every check passes before approving.");
    }
    if (!request.projectId) throw new UpgradeError("project_gone", "The project was deleted. Reject the order and refund, or contact the customer.");
    const result = await grantPassInTx(tx, { projectId: request.projectId, source: "PAYMENT", requestId: request.id, requestedName: request.requestedName, days: request.passDays, actor: { type: "ADMIN", id: admin.id } });
    await tx.upgradeRequest.update({ where: { id: request.id }, data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date() } });
    await audit(tx, { workspaceId: request.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "upgrade.approved", subject: { type: "upgrade_request", id: request.id }, detail: { orderId, passId: result.pass.id, txHash: request.txHash } });
    return { request, result };
  });
  await notifyGateways(outcome.request.projectId!, outcome.result.work);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: outcome.request.userId }, select: { email: true, name: true } });
  const config = getTunnelConfig();
  await sendEmail(
    passActivatedMessage({
      to: user.email,
      name: user.name,
      orderId,
      projectName: outcome.request.projectName,
      endsAt: outcome.result.pass.endsAt,
      customUrl: outcome.result.name && config ? previewUrl(config, outcome.result.name) : null,
      url: dashboardUrl(outcome.request.projectId),
      passName: makeOffer(outcome.request.amountMicros, outcome.request.passDays).name,
    }),
  ).catch((error) => log("error", "pass activation email failed", { error: error instanceof Error ? error.message : "unknown" }));
  log("info", "upgrade approved", { orderId });
  return outcome.result.pass;
}

export async function rejectRequest(admin: AdminUser, orderId: string, reason: string) {
  const note = String(reason ?? "").trim().slice(0, 300);
  if (note.length < 3) throw new UpgradeError("invalid", "Give the customer a short reason.");
  const request = await prisma.$transaction(async (tx) => {
    const row = await lockRequest(tx, orderId);
    if (!OPEN.includes(row.status as (typeof OPEN)[number])) throw new UpgradeError("state", "This order is already closed.");
    await tx.upgradeRequest.update({ where: { id: row.id }, data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note } });
    await audit(tx, { workspaceId: row.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "upgrade.rejected", subject: { type: "upgrade_request", id: row.id }, detail: { orderId, reason: note } });
    return row;
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: request.userId }, select: { email: true, name: true } });
  await sendEmail(upgradeRejectedMessage({ to: user.email, name: user.name, orderId, reason: note, url: dashboardUrl(request.projectId) })).catch(() => undefined);
}

export async function upgradeCounts() {
  const [pending, approved] = await Promise.all([prisma.upgradeRequest.count({ where: { status: { in: [...OPEN] } } }), prisma.upgradeRequest.count({ where: { status: "APPROVED" } })]);
  return { pending, approved };
}

export { BSC };

/** What the checkout shows for a NEW order: the current wallet and QR, only while payments are on. */
export async function paymentInfo(): Promise<import("@/lib/plans").PaymentInfo> {
  const enabled = await paymentsEnabled();
  const settings = await getPaymentSettings();
  const offer = await getPassOffer();
  const qrImageId = enabled ? await currentQrImageId(settings) : null;
  return {
    enabled,
    offer,
    amountLabel: offer.usdtLabel,
    networkLabel: PASS_PRICE.networkLabel,
    // While payments are off, the deposit address and QR aren't sent to the browser at all.
    recipient: enabled ? settings.recipient : null,
    qr: enabled ? paymentQr(settings.recipient) : null,
    qrImageUrl: paymentQrImageUrl(qrImageId),
    supportEmail: SUPPORT_EMAIL,
    afterPaymentMessage: afterPaymentMessage(offer.name),
  };
}

/** Where an existing order pays to: its own snapshot (never the current settings), shown only while payments are on. */
export function orderPayTo(order: { recipient: string; qrImageId: string | null; amountMicros: bigint; passDays: number }, enabled: boolean) {
  if (!enabled) return null;
  return { recipient: order.recipient, qr: paymentQr(order.recipient), qrImageUrl: paymentQrImageUrl(order.qrImageId), offer: makeOffer(order.amountMicros, order.passDays) };
}
