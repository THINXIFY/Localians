import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { z } from "zod";
import { PreviewAccess, TunnelEventType } from "@/generated/prisma/enums";
import type { AccessPolicy } from "@tunnel/shared/protocol";
import { pushPolicyToGateway } from "./cli/gateway-control";
import { ACTIVE_STATES, isActive, recordEvent } from "./cli/lifecycle";
import { prisma } from "./db";
import { log } from "./log";
import { getProjectForUser } from "./projects";
import { rateLimit } from "./rate-limit";
import { requireMembership } from "./workspaces";

// ------------------------------------------------------------------ passwords

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, keylen, { ...options, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))));
}

/** `scrypt$N$r$p$salt$hash` (base64url). Never store or log the password itself. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const previewPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use 128 characters or fewer.");

/** How long visitors stay signed in after entering the password. */
export const ACCESS_TTL_OPTIONS = [60, 8 * 60, 24 * 60, 7 * 24 * 60] as const;

export const accessInputSchema = z
  .object({
    mode: z.enum(["PUBLIC", "PASSWORD"]),
    /** Omit to keep the current password. */
    password: previewPasswordSchema.optional(),
    ttlMinutes: z.number().int().refine((v) => (ACCESS_TTL_OPTIONS as readonly number[]).includes(v), "Choose one of the listed durations."),
  })
  .strict();
export type AccessInput = z.infer<typeof accessInputSchema>;

// ------------------------------------------------------------------ policy

export const policyFor = (project: { accessMode: PreviewAccess; accessVersion: number; accessTtlMinutes: number }): AccessPolicy => ({
  mode: project.accessMode === PreviewAccess.PASSWORD ? "password" : "public",
  version: project.accessVersion,
  ttlS: project.accessTtlMinutes * 60,
});

/** Sends the project's current policy to every gateway serving one of its previews (best effort; heartbeats also carry it). */
async function propagate(projectId: string, type: TunnelEventType, detail: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { workspaceId: true, accessMode: true, accessVersion: true, accessTtlMinutes: true },
  });
  const sessions = await prisma.tunnelSession.findMany({ where: { projectId, status: { in: ACTIVE_STATES } }, select: { id: true, gatewayId: true } });
  const policy = policyFor(project);
  await prisma.$transaction(async (tx) => {
    for (const s of sessions) await recordEvent(tx, { id: s.id, workspaceId: project.workspaceId }, type, detail);
  });
  const results = await Promise.all(sessions.map((s) => pushPolicyToGateway(s.id, s.gatewayId, policy)));
  return { previews: sessions.length, pushed: results.filter(Boolean).length };
}

export async function getProjectAccess(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const row = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { accessMode: true, accessTtlMinutes: true, accessUpdatedAt: true, accessPasswordHash: true },
  });
  return { mode: row.accessMode, ttlMinutes: row.accessTtlMinutes, updatedAt: row.accessUpdatedAt, hasPassword: row.accessPasswordHash !== null };
}

export class AccessError extends Error {}

/**
 * Turns password protection on/off, changes the password or the visitor sign-in duration.
 * Any member of the project's workspace may do this (like editing the project). A new
 * password, or switching modes, signs out every visitor immediately.
 */
export async function updateProjectAccess(userId: string, projectId: string, input: AccessInput) {
  const parsed = accessInputSchema.parse(input);
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  const current = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { accessMode: true, accessPasswordHash: true, accessTtlMinutes: true } });
  if (parsed.mode === "PASSWORD" && !parsed.password && !current.accessPasswordHash) throw new AccessError("Set a password to protect this project's previews.");

  const passwordHash = parsed.password ? await hashPassword(parsed.password) : undefined;
  const modeChanged = current.accessMode !== parsed.mode;
  const signOut = modeChanged || Boolean(passwordHash) || current.accessTtlMinutes !== parsed.ttlMinutes;
  await prisma.project.update({
    where: { id: project.id },
    data: {
      accessMode: parsed.mode,
      ...(passwordHash ? { accessPasswordHash: passwordHash } : {}),
      accessTtlMinutes: parsed.ttlMinutes,
      accessUpdatedAt: new Date(),
      ...(signOut ? { accessVersion: { increment: 1 } } : {}),
    },
  });
  const detail = parsed.mode === "PASSWORD" ? (passwordHash ? "Password protection on (new password)" : "Password protection on") : "Public — anyone with the link";
  log("info", "preview access changed", { projectId: project.id, mode: parsed.mode, passwordChanged: Boolean(passwordHash) });
  return propagate(project.id, TunnelEventType.PROTECTION_CHANGED, detail);
}

/** Ends every visitor's access to this project's previews right away (they must enter the password again). */
export async function signOutVisitors(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  await prisma.project.update({ where: { id: project.id }, data: { accessVersion: { increment: 1 }, accessUpdatedAt: new Date() } });
  log("info", "preview visitors signed out", { projectId: project.id });
  return propagate(project.id, TunnelEventType.VISITORS_SIGNED_OUT, "All visitors must sign in again");
}

// ------------------------------------------------------------------ gateway checks

export type AccessVerdict =
  | { ok: true; policy: AccessPolicy }
  | { ok: false; error: "invalid_password" | "rate_limited" | "not_protected" | "ended"; retryAfterS?: number; policy?: AccessPolicy };

const ATTEMPTS_PER_VISITOR = 8;
const ATTEMPTS_PER_PREVIEW = 60;
const ATTEMPT_WINDOW_MS = 5 * 60_000;

/**
 * Checks a visitor's password for a live preview (called by the gateway). Attempts are rate
 * limited per visitor IP and per preview in the shared store, so brute force doesn't scale
 * with the number of gateways or web instances.
 */
export async function verifyPreviewAccess(sessionId: string, password: string, clientIp: string): Promise<AccessVerdict> {
  const session = await prisma.tunnelSession.findUnique({
    where: { id: sessionId },
    select: { status: true, project: { select: { id: true, accessMode: true, accessPasswordHash: true, accessVersion: true, accessTtlMinutes: true } } },
  });
  if (!session || !isActive(session.status)) return { ok: false, error: "ended" };
  const policy = policyFor(session.project);
  if (session.project.accessMode !== PreviewAccess.PASSWORD || !session.project.accessPasswordHash) return { ok: false, error: "not_protected", policy };

  for (const [key, max] of [
    [`preview-access:${sessionId}:${clientIp.slice(0, 64)}`, ATTEMPTS_PER_VISITOR],
    [`preview-access:${sessionId}`, ATTEMPTS_PER_PREVIEW],
  ] as const) {
    const limited = await rateLimit(key, max, ATTEMPT_WINDOW_MS);
    if (!limited.allowed) {
      log("warn", "preview password rate limited", { sessionId, scope: key.split(":").length > 2 ? "visitor" : "preview" });
      return { ok: false, error: "rate_limited", retryAfterS: limited.retryAfterS };
    }
  }
  const ok = typeof password === "string" && password.length <= 128 && (await verifyPassword(password, session.project.accessPasswordHash));
  if (!ok) {
    log("info", "preview password rejected", { sessionId });
    return { ok: false, error: "invalid_password" };
  }
  return { ok: true, policy };
}
