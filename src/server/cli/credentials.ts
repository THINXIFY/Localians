import "server-only";
import { TunnelEventType } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { CLI_TOKEN_PREFIX, sha256 } from "./crypto";
import { terminateOnGateway } from "./gateway-control";
import { endSessions } from "./lifecycle";

export type CliAuth = {
  credentialId: string;
  userId: string;
  workspaceId: string;
  user: { email: string; name: string };
};

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
      user: { select: { email: true, name: true } },
    },
  });
  if (!credential || credential.revokedAt || credential.expiresAt <= new Date()) return null;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: credential.workspaceId, userId: credential.userId } },
    select: { id: true },
  });
  if (!member) return null;

  // Throttle last-used writes to once a minute.
  if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 60_000) {
    await prisma.cliCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
  }
  return { credentialId: credential.id, userId: credential.userId, workspaceId: credential.workspaceId, user: credential.user };
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
