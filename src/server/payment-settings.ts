import "server-only";
import { verifyPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { makeOffer, parsePassDays, parseUsdPrice, type PassOffer } from "@/lib/offer";
import { checkBscAddress } from "@/lib/wallet";
import type { AdminUser } from "./admin";
import { audit } from "./audit";
import { siteUrl } from "./cli/config";
import { prisma } from "./db";
import { sendEmail } from "./email/send";
import { paymentDestinationChangedMessage } from "./email/templates";
import { log } from "./log";
import { MediaError, savePaymentQr } from "./media";
import { rateLimit } from "./rate-limit";

/**
 * Admin-managed payment configuration (payment_settings, one row). This is the single authority for "can customers
 * pay right now" and "where do new orders pay to": the checkout, the order API and the public pages all read it here.
 *
 * - The row is created on first use from PAYMENTS_ENABLED (so an existing deployment keeps its current state) and the
 *   default wallet. After that, only /admin/settings changes it; the environment variable is no longer consulted.
 * - PAYMENTS_EMERGENCY_DISABLE=on forces payments off whatever the row says (a server-side kill switch that needs no
 *   database or admin access). It never turns payments on.
 * - Every order stores its own wallet (upgrade_requests.recipient) and QR snapshot, and is verified against those, so
 *   changing settings never alters what an existing order shows or how it is checked.
 */
export const DEFAULT_RECIPIENT = "0x2f94b75535eff533378c90f8dda29cf10208b174";
/** Static pages that show whether payments are on, or the pass price and length. */
const PUBLIC_PATHS = ["/", "/terms", "/privacy-policy", "/ngrok-alternative", "/share-localhost", "/docs/cli", "/docs/security"];

export class PaymentSettingsError extends Error {}

export const emergencyDisabled = () => process.env.PAYMENTS_EMERGENCY_DISABLE === "on";

async function loadSettings() {
  const row = await prisma.paymentSetting.findUnique({ where: { id: 1 } });
  if (row) return row;
  try {
    return await prisma.paymentSetting.create({ data: { id: 1, enabled: process.env.PAYMENTS_ENABLED === "on", recipient: DEFAULT_RECIPIENT } });
  } catch (error) {
    // Another process created it first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.paymentSetting.findUniqueOrThrow({ where: { id: 1 } });
    throw error;
  }
}

/** The settings row (read once per request; always fresh across requests and processes). */
export const getPaymentSettings = cache(loadSettings);

/** The effective state: the admin setting, unless the emergency switch forces it off. */
export async function paymentsEnabled() {
  if (emergencyDisabled()) return false;
  return (await getPaymentSettings()).enabled;
}

/** The Preview Pass offered to NEW orders (price and length). Existing orders keep their own snapshot. */
export async function getPassOffer(): Promise<PassOffer> {
  const settings = await getPaymentSettings();
  return makeOffer(settings.priceMicros, settings.passDays);
}

/** The uploaded QR to use for new orders: only if it was verified to encode the current wallet. */
export async function currentQrImageId(settings: { recipient: string; qrImageId: string | null }) {
  if (!settings.qrImageId) return null;
  const media = await prisma.mediaFile.findUnique({ where: { id: settings.qrImageId }, select: { kind: true, qrData: true } });
  return media?.kind === "payment_qr" && media.qrData === settings.recipient ? settings.qrImageId : null;
}

export const paymentQrImageUrl = (id: string | null) => (id ? `/api/media/payment-qr/${id}` : null);

function refreshPublicPages() {
  // The homepage pricing button, Terms and Privacy Policy depend on the setting and are statically rendered.
  for (const p of PUBLIC_PATHS) {
    try {
      revalidatePath(p);
    } catch {
      // Outside a Next.js request (scripts, tests): nothing is cached to refresh; pages also revalidate on a timer.
    }
  }
}

/** Everything /admin/settings shows. */
export async function getPaymentSettingsView() {
  const settings = await loadSettings();
  const qrImageId = await currentQrImageId(settings);
  const updatedBy = settings.updatedById ? await prisma.user.findUnique({ where: { id: settings.updatedById }, select: { email: true } }) : null;
  return {
    enabled: settings.enabled,
    effective: settings.enabled && !emergencyDisabled(),
    emergencyDisabled: emergencyDisabled(),
    recipient: settings.recipient,
    qrImageUrl: paymentQrImageUrl(qrImageId),
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: updatedBy?.email ?? null,
    offer: makeOffer(settings.priceMicros, settings.passDays),
    pricingUpdatedAt: settings.pricingUpdatedAt?.toISOString() ?? null,
  };
}

/** Turns taking new payments on or off. Existing orders, passes and records are untouched either way. */
export async function setPaymentsEnabled(admin: AdminUser, enabled: boolean) {
  await loadSettings();
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ enabled: boolean }[]>`SELECT enabled FROM payment_settings WHERE id = 1 FOR UPDATE`;
    if (row.enabled === enabled) return;
    await tx.paymentSetting.update({ where: { id: 1 }, data: { enabled, updatedById: admin.id } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: enabled ? "payments.enabled" : "payments.disabled", subject: { type: "payment_settings", id: "1" }, detail: { previous: row.enabled, next: enabled } });
  });
  log("info", enabled ? "payments enabled by admin" : "payments disabled by admin", { admin: admin.publicId });
  refreshPublicPages();
}

/** Admins re-enter their password for destination changes (recent re-authentication, checked on the server). */
async function confirmAdminPassword(admin: AdminUser, password: string) {
  // Only failures count: 5 wrong passwords in 15 minutes locks wallet changes for this admin until they age out.
  const recentFailures = await prisma.auditLog.count({ where: { actorId: admin.id, action: "payments.reauth_failed", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recentFailures >= 5) throw new PaymentSettingsError("Too many password attempts. Wait 15 minutes and try again.");
  const account = await prisma.account.findFirst({ where: { userId: admin.id, providerId: "credential" }, select: { password: true } });
  const ok = account?.password && password && password.length <= 128 ? await verifyPassword({ hash: account.password, password }).catch(() => false) : false;
  if (!ok) {
    await audit(prisma, { actor: { type: "ADMIN", id: admin.id }, action: "payments.reauth_failed", subject: { type: "payment_settings", id: "1" } });
    throw new PaymentSettingsError("That password isn't correct.");
  }
}

/**
 * Changes the wallet that NEW orders pay to. Requires the admin's password, validates the address (format and EIP-55
 * checksum), clears an uploaded QR (it encodes the old wallet; the generated QR takes over), audits both values and
 * emails the operators. Existing orders keep their own wallet and are verified against it.
 */
export async function changeWallet(admin: AdminUser, input: { address: string; password: string }) {
  await confirmAdminPassword(admin, String(input.password ?? ""));
  const check = checkBscAddress(input.address);
  if (!check.ok) throw new PaymentSettingsError(check.error);
  await loadSettings();
  const previous = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ recipient: string; qrImageId: string | null }[]>`SELECT recipient, "qrImageId" FROM payment_settings WHERE id = 1 FOR UPDATE`;
    if (row.recipient === check.address) throw new PaymentSettingsError("That's already the configured wallet.");
    await tx.paymentSetting.update({ where: { id: 1 }, data: { recipient: check.address, qrImageId: null, updatedById: admin.id } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "payments.wallet_changed", subject: { type: "payment_settings", id: "1" }, detail: { previous: row.recipient, next: check.address, clearedQrImageId: row.qrImageId } });
    return row.recipient;
  });
  log("warn", "payment wallet changed", { admin: admin.publicId, previous, next: check.address });
  const recipients = Array.from(new Set(["hello@thinxify.com", process.env.ADMIN_NOTIFY_EMAIL?.trim()].filter(Boolean) as string[]));
  await Promise.all(
    recipients.map((to) =>
      sendEmail(paymentDestinationChangedMessage({ to, adminEmail: admin.email, previous, next: check.address, at: new Date(), url: `${siteUrl()}/admin/settings` })).catch((error) =>
        log("error", "wallet change email failed", { error: error instanceof Error ? error.message : "unknown" }),
      ),
    ),
  );
  refreshPublicPages();
  return { previous, next: check.address };
}

/** Stores an uploaded QR image for the current wallet; rejected unless it decodes to exactly that wallet. */
export async function uploadPaymentQr(admin: AdminUser, file: File) {
  const limited = await rateLimit(`admin-qr-upload:${admin.id}`, 20, 60 * 60_000);
  if (!limited.allowed) throw new PaymentSettingsError("Too many uploads. Try again later.");
  const settings = await loadSettings();
  let media;
  try {
    media = await savePaymentQr(file, settings.recipient, admin.id);
  } catch (error) {
    if (error instanceof MediaError) throw new PaymentSettingsError(error.message);
    throw error;
  }
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ recipient: string; qrImageId: string | null }[]>`SELECT recipient, "qrImageId" FROM payment_settings WHERE id = 1 FOR UPDATE`;
    // The wallet changed while the image was being checked: it no longer matches.
    if (row.recipient !== media.qrData) throw new PaymentSettingsError("The wallet changed during the upload. Upload a QR code for the new wallet.");
    await tx.paymentSetting.update({ where: { id: 1 }, data: { qrImageId: media.id, updatedById: admin.id } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "payments.qr_uploaded", subject: { type: "payment_settings", id: "1" }, detail: { previous: row.qrImageId, next: media.id, sha256: media.sha256, encodes: media.qrData } });
  });
}

/** Back to the QR generated from the wallet address. The old image is kept (existing orders may still show it). */
export async function resetPaymentQr(admin: AdminUser) {
  await loadSettings();
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ qrImageId: string | null }[]>`SELECT "qrImageId" FROM payment_settings WHERE id = 1 FOR UPDATE`;
    if (!row.qrImageId) return;
    await tx.paymentSetting.update({ where: { id: 1 }, data: { qrImageId: null, updatedById: admin.id } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "payments.qr_reset", subject: { type: "payment_settings", id: "1" }, detail: { previous: row.qrImageId } });
  });
}

/**
 * Changes the Preview Pass price (USD, charged 1:1 in USDT) and/or length for NEW orders. Requires the admin's
 * password, validates both values on the server, and audits old and new values. Existing orders and passes keep the
 * price and length they were created with (each order stores its own amount and days; verification checks the
 * order's amount on chain).
 */
export async function updatePricing(admin: AdminUser, input: { price: string; days: string | number; password: string }) {
  const price = parseUsdPrice(input.price);
  if (!price.ok) throw new PaymentSettingsError(price.error);
  const days = parsePassDays(input.days);
  if (!days.ok) throw new PaymentSettingsError(days.error);
  await confirmAdminPassword(admin, String(input.password ?? ""));
  await loadSettings();
  const change = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ priceMicros: bigint; passDays: number }[]>`SELECT "priceMicros", "passDays" FROM payment_settings WHERE id = 1 FOR UPDATE`;
    if (BigInt(row.priceMicros) === price.micros && row.passDays === days.days) throw new PaymentSettingsError("That's already the current price and length.");
    await tx.paymentSetting.update({ where: { id: 1 }, data: { priceMicros: price.micros, passDays: days.days, pricingUpdatedAt: new Date(), updatedById: admin.id } });
    const previous = makeOffer(row.priceMicros, row.passDays);
    const next = makeOffer(price.micros, days.days);
    await audit(tx, {
      actor: { type: "ADMIN", id: admin.id },
      action: "payments.pricing_changed",
      subject: { type: "payment_settings", id: "1" },
      detail: { previous: { priceMicros: previous.priceMicros, days: previous.days }, next: { priceMicros: next.priceMicros, days: next.days } },
    });
    return { previous, next };
  });
  log("warn", "pass pricing changed", { admin: admin.publicId, previous: change.previous.priceLabel, next: change.next.priceLabel, days: change.next.days });
  refreshPublicPages();
  return change;
}
