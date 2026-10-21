import "server-only";
import { prisma } from "./db";

/** The user's active sessions, without tokens (tokens never leave the server). */
export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Revokes one of the user's own sessions. Returns false if it isn't theirs. */
export async function revokeUserSession(userId: string, sessionId: string) {
  const { count } = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  return count > 0;
}

export async function revokeOtherSessions(userId: string, currentSessionId: string) {
  const { count } = await prisma.session.deleteMany({ where: { userId, NOT: { id: currentSessionId } } });
  return count;
}

/** "Chrome on Windows"-style label from a user agent string. */
export function describeUserAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}
