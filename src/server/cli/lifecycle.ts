import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TunnelEventType, TunnelStatus } from "@/generated/prisma/enums";
import { prisma } from "../db";

export const ACTIVE_STATES = [TunnelStatus.CONNECTING, TunnelStatus.CONNECTED, TunnelStatus.RECONNECTING];
export const isActive = (s: TunnelStatus) => (ACTIVE_STATES as TunnelStatus[]).includes(s);

/** Telemetry retention: hourly buckets and lifecycle events older than this are deleted. */
export const TELEMETRY_RETENTION_DAYS = 90;
/** Flapping connections can't grow a session's timeline without bound. */
const MAX_TRANSIENT_EVENTS_PER_SESSION = 300;
const TRANSIENT: TunnelEventType[] = [TunnelEventType.CONNECTED, TunnelEventType.RECONNECTED, TunnelEventType.CONNECTION_LOST];

type Tx = Prisma.TransactionClient;

/** Appends a lifecycle event. Details are short, fixed phrases — never request data. */
export async function recordEvent(tx: Tx, session: { id: string; workspaceId: string }, type: TunnelEventType, detail?: string | null) {
  if (TRANSIENT.includes(type)) {
    const count = await tx.tunnelEvent.count({ where: { sessionId: session.id, type: { in: TRANSIENT } } });
    if (count >= MAX_TRANSIENT_EVENTS_PER_SESSION) return;
  }
  await tx.tunnelEvent.create({
    data: { sessionId: session.id, workspaceId: session.workspaceId, type, detail: detail ? detail.slice(0, 160) : null },
  });
}

const ENDING: Record<"DISCONNECTED" | "EXPIRED" | "REVOKED", TunnelStatus> = {
  DISCONNECTED: TunnelStatus.DISCONNECTED,
  EXPIRED: TunnelStatus.EXPIRED,
  REVOKED: TunnelStatus.REVOKED,
};

/**
 * Ends one session if (and only if) it is still active. The status check is part of the
 * update, so concurrent stops, sweeps and gateway reports end it exactly once.
 * Returns true when this call ended it.
 */
export async function endSession(
  tx: Tx,
  session: { id: string; workspaceId: string },
  end: { status: keyof typeof ENDING; reason: string; event: TunnelEventType; now?: Date },
) {
  const now = end.now ?? new Date();
  const { count } = await tx.tunnelSession.updateMany({
    where: { id: session.id, status: { in: ACTIVE_STATES } },
    data: { status: ENDING[end.status], disconnectedAt: now, endReason: end.reason, lastActivityAt: now, currentConnectionId: null },
  });
  if (count === 0) return false;
  await tx.tunnelConnection.updateMany({ where: { sessionId: session.id, disconnectedAt: null }, data: { disconnectedAt: now } });
  await recordEvent(tx, session, end.event, end.reason);
  return true;
}

/** Ends every active session matching `where` (sweeps, credential revocation). Returns the ended sessions. */
export async function endSessions(
  where: Prisma.TunnelSessionWhereInput,
  end: { status: keyof typeof ENDING; reason: string | ((s: { connectedAt: Date | null }) => string); event: TunnelEventType },
) {
  const candidates = await prisma.tunnelSession.findMany({
    where: { ...where, status: { in: ACTIVE_STATES } },
    select: { id: true, connectedAt: true, gatewayId: true, project: { select: { workspaceId: true } } },
    take: 500,
  });
  const ended: { id: string; gatewayId: string | null }[] = [];
  for (const s of candidates) {
    const reason = typeof end.reason === "function" ? end.reason(s) : end.reason;
    const done = await prisma.$transaction((tx) => endSession(tx, { id: s.id, workspaceId: s.project.workspaceId }, { ...end, reason }));
    if (done) ended.push({ id: s.id, gatewayId: s.gatewayId });
  }
  return ended;
}

let lastPrune = 0;

/** Bounded storage: drops telemetry past retention. Runs at most hourly per process. */
export async function pruneTelemetry(force = false) {
  if (!force && Date.now() - lastPrune < 60 * 60 * 1000) return;
  lastPrune = Date.now();
  const cutoff = new Date(Date.now() - TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.tunnelMetric.deleteMany({ where: { bucketStart: { lt: cutoff } } }),
    prisma.tunnelEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.tunnelConnection.deleteMany({ where: { disconnectedAt: { lt: cutoff } } }),
  ]);
}

/** Start of the UTC hour containing `date` — the analytics bucket key. */
export const hourBucket = (date: Date) => new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000);
