"use server";

import { hashPassword, verifyPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { emailSchema } from "@/lib/validation/auth";
import { adminUpdateUser, AdminInputError, deleteUser, reactivateUser, requireAdmin, signOutCurrent, suspendUser } from "../admin";
import { audit } from "../audit";
import { auth } from "../auth";
import { prisma } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import { changeWallet, PaymentSettingsError, resetPaymentQr, setPaymentsEnabled, updatePricing, uploadPaymentQr } from "../payment-settings";
import { rateLimit } from "../rate-limit";
import type { ActionResult } from "./result";
import { adminSetTxHash, approveRequest, markUnderReview, rejectRequest, UpgradeError, verifyRequestOnChain } from "../upgrades";

const INVALID = "Invalid email or password.";
let dummyHash: Promise<string> | null = null;

async function requestIp() {
  const chain = (await headers()).get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain[chain.length - 1] || "unknown";
}

/**
 * Admin sign-in (/admin/login). Only ADMIN accounts get a session here: the role is checked before signing in, and
 * other accounts get the same answer as a wrong password (with a password check of equal cost). Rate limited per IP
 * and per email; Better Auth's own sign-in limits apply too.
 */
export async function adminSignInAction(input: { email: string; password: string }): Promise<ActionResult<null>> {
  const email = emailSchema.safeParse(input?.email);
  const password = typeof input?.password === "string" ? input.password : "";
  if (!email.success || !password || password.length > 128) return { ok: false, error: INVALID };
  const ip = await requestIp();
  for (const [key, max] of [
    [`admin-login-ip:${ip}`, 10],
    [`admin-login-email:${email.data.toLowerCase()}`, 5],
  ] as const) {
    if (!(await rateLimit(key, max, 15 * 60_000)).allowed) return { ok: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  }
  const user = await prisma.user.findUnique({ where: { email: email.data.toLowerCase() }, select: { id: true, role: true, status: true } });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") {
    dummyHash ??= hashPassword(`not-a-real-password-${Math.random()}`);
    await verifyPassword({ hash: await dummyHash, password }).catch(() => false);
    await audit(prisma, { actor: { type: "SYSTEM" }, action: "admin.login_failed", subject: { type: "admin_login", id: email.data.toLowerCase().slice(0, 120) }, detail: { ip: ip.slice(0, 64) } });
    return { ok: false, error: INVALID };
  }
  try {
    await auth.api.signInEmail({ body: { email: email.data, password }, headers: await headers() });
  } catch {
    await audit(prisma, { actor: { type: "SYSTEM" }, action: "admin.login_failed", subject: { type: "user", id: user.id }, detail: { ip: ip.slice(0, 64) } });
    return { ok: false, error: INVALID };
  }
  await audit(prisma, { actor: { type: "ADMIN", id: user.id }, action: "admin.login", subject: { type: "user", id: user.id }, detail: { ip: ip.slice(0, 64) } });
  return { ok: true, data: null };
}

export async function adminSignOutAction(): Promise<ActionResult<null>> {
  await signOutCurrent();
  return { ok: true, data: null };
}

function failure(error: unknown, context: string): ActionResult<never> {
  if (error instanceof AdminInputError) return { ok: false, error: error.message };
  if (error instanceof PaymentSettingsError) return { ok: false, error: error.message };
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  if (error instanceof NotFoundError) return { ok: false, error: "User not found." };
  console.error(`[action:${context}]`, error instanceof Error ? error.message : "Unknown error");
  return { ok: false, error: "Couldn't save. Please try again." };
}

async function adminCall<T>(context: string, run: (admin: Awaited<ReturnType<typeof requireAdmin>>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const admin = await requireAdmin();
    if (!(await rateLimit(`admin-action:${admin.id}`, 60, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a minute." };
    const data = await run(admin);
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (error) {
    return failure(error, context);
  }
}

export async function adminUpdateUserAction(userId: string, input: { name: string; username: string }) {
  return adminCall("adminUpdateUser", (admin) => adminUpdateUser(admin, String(userId), { name: String(input?.name ?? ""), username: String(input?.username ?? "") }));
}

export async function suspendUserAction(userId: string, reason: string) {
  return adminCall("suspendUser", (admin) => suspendUser(admin, String(userId), String(reason ?? "")));
}

export async function reactivateUserAction(userId: string) {
  return adminCall("reactivateUser", (admin) => reactivateUser(admin, String(userId)));
}

export async function deleteUserAction(userId: string, confirm: string) {
  return adminCall("deleteUser", (admin) => deleteUser(admin, String(userId), String(confirm ?? "")));
}

// ------------------------------------------------------------------ payments

function paymentCall<T>(context: string, run: (admin: Awaited<ReturnType<typeof requireAdmin>>) => Promise<T>): Promise<ActionResult<T>> {
  return adminCall(context, async (admin) => {
    try {
      return await run(admin);
    } catch (error) {
      if (error instanceof UpgradeError) throw new AdminInputError(error.message);
      throw error;
    }
  });
}

export async function markUnderReviewAction(orderId: string) {
  return paymentCall("markUnderReview", (admin) => markUnderReview(admin, String(orderId)));
}

export async function verifyOnChainAction(orderId: string) {
  return paymentCall("verifyOnChain", async (admin) => {
    const result = await verifyRequestOnChain(admin, String(orderId));
    return { ok: result.ok };
  });
}

export async function adminSetTxHashAction(orderId: string, txHash: string) {
  return paymentCall("adminSetTxHash", (admin) => adminSetTxHash(admin, String(orderId), String(txHash)));
}

export async function approveRequestAction(orderId: string) {
  return paymentCall("approveRequest", async (admin) => {
    const pass = await approveRequest(admin, String(orderId));
    return { endsAt: pass.endsAt.toISOString() };
  });
}

export async function rejectRequestAction(orderId: string, reason: string) {
  return paymentCall("rejectRequest", (admin) => rejectRequest(admin, String(orderId), String(reason)));
}

// ------------------------------------------------------------------ payment settings (server-checked admin only)

export async function setPaymentsEnabledAction(enabled: boolean) {
  return adminCall("setPaymentsEnabled", (admin) => setPaymentsEnabled(admin, enabled === true));
}

/** Requires the admin's current password (re-authentication) in addition to the admin session. */
export async function changeWalletAction(input: { address: string; password: string }) {
  return adminCall("changeWallet", (admin) => changeWallet(admin, { address: String(input?.address ?? ""), password: String(input?.password ?? "") }));
}

export async function uploadPaymentQrAction(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Choose an image to upload." };
  return adminCall("uploadPaymentQr", (admin) => uploadPaymentQr(admin, file));
}

export async function resetPaymentQrAction() {
  return adminCall("resetPaymentQr", (admin) => resetPaymentQr(admin));
}

/** Price (USD, charged 1:1 in USDT) and length of the pass for NEW orders. Needs the admin password again. */
export async function updatePricingAction(input: { price: string; days: string; password: string }) {
  return adminCall("updatePricing", async (admin) => {
    const change = await updatePricing(admin, { price: String(input?.price ?? ""), days: String(input?.days ?? ""), password: String(input?.password ?? "") });
    return { price: change.next.priceLabel, days: change.next.days };
  });
}
