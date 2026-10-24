import "server-only";
import { TunnelEventType } from "@/generated/prisma/enums";
import { timeAgo } from "@/lib/format";
import { prisma } from "../db";
import { CLI_TOKEN_TTL_MS } from "./config";
import { CLI_TOKEN_PREFIX, sha256 } from "./crypto";
import { terminateOnGateway } from "./gateway-control";
import { endSessions } from "./lifecycle";

/** Who a CLI or VS Code login belongs to, as clients may show it (never the internal user id). */
export type CliUser = { id: string; email: string; name: string; username: string | null };
export const CLI_USER_SELECT = { publicId: true, email: true, name: true, username: true } as const;
export const cliUser = (u: { publicId: string; email: string; name: string; username: string | null }): CliUser => ({ id: u.publicId, email: u.email, name: u.name, username: u.username });

export type CliAuth = {
  credentialId: string;
  userId: string;
  workspaceId: string;
  user: CliUser;
  /** When this login stops working (moves forward while it's used, see authenticateCli). */
  expiresAt: Date;
};

/**
 * Logins in use don't run out: once less than half of CLI_TOKEN_TTL_MS is left, each use renews it to the full
 * period (at most once a minute, with the last-used write). Unused logins still expire; revoked ones never come back.
 */
const RENEW_BELOW_MS = CLI_TOKEN_TTL_MS / 2;

/**
 * Authenticates `Authorization: Bearer lcl_…`. Rejects unknown, revoked and expired
 * tokens, and tokens whose user is no longer a member of the credential's workspace.
 */
export async function authenticateCli(request: Request): Promise<CliAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1];
  if (!token || !token.startsWith(CLI_TOKEN_PREFIX) || token.length > 128) return null;

  const credential = await prisma.cliCredential.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      userId: true,
      workspaceId: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { ...CLI_USER_SELECT, status: true } },
    },
  });
  if (!credential || credential.revokedAt || credential.expiresAt <= new Date()) return null;
  if (credential.user.status !== "ACTIVE") return null; // suspended or deactivated account

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: credential.workspaceId, userId: credential.userId } },
    select: { id: true },
  });
  if (!member) return null;

  // Throttle last-used writes (and renewals) to once a minute.
  let expiresAt = credential.expiresAt;
  if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 60_000) {
    const renew = expiresAt.getTime() - Date.now() < RENEW_BELOW_MS;
    if (renew) expiresAt = new Date(Date.now() + CLI_TOKEN_TTL_MS);
    // revokedAt: null in the filter, so a renewal can never race a revocation back to life.
    await prisma.cliCredential.updateMany({ where: { id: credential.id, revokedAt: null }, data: { lastUsedAt: new Date(), ...(renew ? { expiresAt } : {}) } });
  }
  return { credentialId: credential.id, userId: credential.userId, workspaceId: credential.workspaceId, user: cliUser(credential.user), expiresAt };
}

export async function listCliCredentials(userId: string) {
  return prisma.cliCredential.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, expiresAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Revokes a credential the user owns and ends every tunnel it opened. */
export async function revokeCliCredential(userId: string, credentialId: string, reason = "CLI login revoked") {
  const { count } = await prisma.cliCredential.updateMany({ where: { id: credentialId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) return false;
  // Once revoked, every gateway report for these sessions is answered with "terminate";
  // the explicit terminate below just stops routing immediately instead of at the next heartbeat.
  const ended = await endSessions({ credentialId }, { status: "REVOKED", reason, event: TunnelEventType.REVOKED });
  await Promise.all(ended.map((s) => terminateOnGateway(s.id, s.gatewayId)));
  return true;
}

/** For the dashboard's "Connect Localians CLI": how many computers are signed in, and when one was last used. */
export function cliConnectStatus(credentials: { lastUsedAt: Date | null }[]) {
  const last = credentials.reduce<Date | null>((latest, c) => (c.lastUsedAt && (!latest || c.lastUsedAt > latest) ? c.lastUsedAt : latest), null);
  return { computers: credentials.length, lastUsed: last ? timeAgo(last) : null };
}
