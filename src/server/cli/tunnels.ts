import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { Prisma } from "@/generated/prisma/client";
import { ProjectStatus, TunnelEventType, TunnelStatus } from "@/generated/prisma/enums";
import {
  CONNECT_TOKEN_AUDIENCE,
  CONNECT_TOKEN_ISSUER,
  type ConnectionCounters,
  type GatewayEvent,
  type GatewayEventsResponse,
} from "@tunnel/shared/protocol";
import { prisma } from "../db";
import { NotFoundError } from "../errors";
import { getProjectForUser } from "../projects";
import {
  CONNECT_TOKEN_TTL_S,
  getTunnelConfig,
  previewUrl,
  quotas,
  TUNNEL_STALE_AFTER_MS,
  type TunnelConfig,
} from "./config";
import type { CliAuth } from "./credentials";
import { policyFor } from "../access";
import { log } from "../log";
import { generatePreviewLabel } from "./crypto";
import { ACTIVE_STATES, endSession, endSessions, hourBucket, isActive, pruneTelemetry, recordEvent } from "./lifecycle";

export { ACTIVE_STATES } from "./lifecycle";

/** endReason written when a preview is stopped from the dashboard. */
export const STOPPED_FROM_DASHBOARD = "Stopped from the dashboard";

export class TunnelError extends Error {
  constructor(
    readonly code: "tunnels_unavailable" | "project_archived" | "too_many_tunnels" | "bandwidth_quota" | "session_ended" | "invalid_port",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function requireConfig(): TunnelConfig {
  const config = getTunnelConfig();
  if (!config) throw new TunnelError("tunnels_unavailable", "The tunnel service isn't configured on this server.", 503);
  return config;
}

async function signConnectToken(config: TunnelConfig, session: { id: string; userId: string; credentialId: string; hostname: string; localPort: number }) {
  return new SignJWT({ sid: session.id, cid: session.credentialId, label: session.hostname, port: session.localPort })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuer(CONNECT_TOKEN_ISSUER)
    .setAudience(CONNECT_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CONNECT_TOKEN_TTL_S}s`)
    .setJti(randomBytes(16).toString("base64url"))
    .sign(config.tokenSecret);
}

/** Expires sessions that outlived their lifetime or whose gateway heartbeat went stale. */
export async function sweepStaleTunnels(where: Prisma.TunnelSessionWhereInput = {}) {
  const now = Date.now();
  await endSessions(
    {
      ...where,
      OR: [
        { expiresAt: { lt: new Date(now) } },
        { lastHeartbeatAt: { lt: new Date(now - TUNNEL_STALE_AFTER_MS) } },
        { lastHeartbeatAt: null, createdAt: { lt: new Date(now - TUNNEL_STALE_AFTER_MS) } },
      ],
    },
    { status: "EXPIRED", event: TunnelEventType.EXPIRED, reason: (s) => (s.connectedAt ? "No connection from the CLI" : "The CLI never connected") },
  );
  void pruneTelemetry().catch(() => {});
}

/** Creates a tunnel session for a project the credential's user may access. */
export async function createTunnelSession(auth: CliAuth, input: { projectId: string; localPort: number }) {
  const config = requireConfig();
  if (!Number.isInteger(input.localPort) || input.localPort < 1 || input.localPort > 65535) {
    throw new TunnelError("invalid_port", "Ports range from 1 to 65535.", 400);
  }
  // Membership check (no IDOR) + credential scope: the project must be in the credential's workspace.
  const project = await getProjectForUser(auth.userId, input.projectId);
  if (project.workspaceId !== auth.workspaceId) throw new NotFoundError("Project not found.");
  if (project.status === ProjectStatus.ARCHIVED) {
    throw new TunnelError("project_archived", "This project is archived. Restore it in the dashboard to share it.", 409);
  }

  await sweepStaleTunnels({ userId: auth.userId });
  const limits = quotas();
  const active = await prisma.tunnelSession.count({ where: { userId: auth.userId, status: { in: ACTIVE_STATES } } });
  if (active >= limits.activePreviewsPerUser) {
    throw new TunnelError("too_many_tunnels", `You can share up to ${limits.activePreviewsPerUser} apps at once. Stop another share first.`, 429);
  }
  if ((await bandwidthToday(project.workspaceId)) >= limits.dailyBandwidthBytes) {
    throw new TunnelError("bandwidth_quota", "This workspace has used today's preview bandwidth. Sharing is available again after midnight UTC.", 429);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const session = await prisma.$transaction(async (tx) => {
        const created = await tx.tunnelSession.create({
          data: {
            projectId: project.id,
            userId: auth.userId,
            credentialId: auth.credentialId,
            hostname: generatePreviewLabel(),
            localPort: input.localPort,
            expiresAt: new Date(Date.now() + limits.maxShareMs),
          },
        });
        await recordEvent(tx, { id: created.id, workspaceId: project.workspaceId }, TunnelEventType.CREATED, `Sharing localhost:${input.localPort}`);
        return created;
      });
      return {
        sessionId: session.id,
        label: session.hostname,
        publicUrl: previewUrl(config, session.hostname),
        gatewayUrl: config.gatewayUrl,
        expiresAt: session.expiresAt.toISOString(),
        project: { id: project.id, name: project.name, slug: project.slug },
        workspace: { id: project.workspaceId },
        access: (await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { accessMode: true } })).accessMode === "PASSWORD" ? "password" : "public",
        connectToken: await signConnectToken(config, { ...session, credentialId: auth.credentialId }),
      };
    } catch (error) {
      // Label collision on the unique index: draw another.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a preview hostname.");
}

async function ownedSession(auth: CliAuth, sessionId: string) {
  const session = await prisma.tunnelSession.findFirst({
    where: { id: sessionId, userId: auth.userId, credentialId: auth.credentialId },
    include: { project: { select: { workspaceId: true } } },
  });
  if (!session) throw new NotFoundError("Tunnel session not found.");
  return session;
}

/** Fresh short-lived connect token so the CLI can reconnect to the same preview URL. */
export async function reissueConnectToken(auth: CliAuth, sessionId: string) {
  const config = requireConfig();
  await sweepStaleTunnels({ id: sessionId });
  const session = await ownedSession(auth, sessionId);
  if (!isActive(session.status) || session.expiresAt <= new Date()) {
    const message =
      session.endReason === STOPPED_FROM_DASHBOARD
        ? "This preview was stopped from the Localians dashboard. Run `localians share` again for a new link."
        : "This share has ended. Run `localians share` again for a new link.";
    throw new TunnelError("session_ended", message, 410);
  }
  return { connectToken: await signConnectToken(config, { ...session, credentialId: auth.credentialId }) };
}

/** The CLI stopped sharing on purpose. */
export async function closeTunnelSession(auth: CliAuth, sessionId: string) {
  const session = await ownedSession(auth, sessionId);
  await prisma.$transaction((tx) =>
    endSession(tx, { id: session.id, workspaceId: session.project.workspaceId }, { status: "DISCONNECTED", reason: "Stopped by the CLI", event: TunnelEventType.STOPPED_BY_CLI }),
  );
}

export async function listActiveTunnelsForCli(auth: CliAuth) {
  const config = getTunnelConfig();
  await sweepStaleTunnels({ userId: auth.userId });
  const sessions = await prisma.tunnelSession.findMany({
    where: { userId: auth.userId, status: { in: ACTIVE_STATES } },
    select: { id: true, hostname: true, localPort: true, status: true, connectedAt: true, createdAt: true, project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return sessions.map((s) => ({ ...s, publicUrl: config ? previewUrl(config, s.hostname) : null }));
}

// ----------------------------------------------------------------- gateway reports

const CONNECTION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_INT = 2_147_483_647;

function counters(event: Partial<ConnectionCounters>): ConnectionCounters {
  const clamp = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : 0);
  return { bytesIn: clamp(event.bytesIn, Number.MAX_SAFE_INTEGER), bytesOut: clamp(event.bytesOut, Number.MAX_SAFE_INTEGER), requests: clamp(event.requests, MAX_INT) };
}

type Verdict = GatewayEventsResponse["sessions"][string];

/**
 * Applies one gateway report inside a transaction that locks the session row, so reports
 * for the same session are serialised.
 *
 * Metering is idempotent: counters are cumulative per connection, and only the increase
 * over the last applied values is added (to the session totals and its UTC-hour bucket).
 * Redelivered, retried or out-of-order reports therefore can't double count.
 */
async function applyGatewayEvent(gatewayId: string, event: GatewayEvent, now: Date): Promise<Verdict> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM tunnel_sessions WHERE id = ${event.sessionId} FOR UPDATE`;
    if (!locked.length) return { action: "terminate", reason: "unknown session" };
    const session = await tx.tunnelSession.findUniqueOrThrow({
      where: { id: event.sessionId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        connectedAt: true,
        currentConnectionId: true,
        projectId: true,
        project: { select: { workspaceId: true, accessMode: true, accessVersion: true, accessTtlMinutes: true } },
        credential: { select: { revokedAt: true, expiresAt: true } },
      },
    });
    const ref = { id: session.id, workspaceId: session.project.workspaceId };
    const policy = policyFor(session.project);
    let overQuota = false;

    // ---- connection + metering
    let connection = await tx.tunnelConnection.findUnique({ where: { id: event.connectionId } });
    if (connection && connection.sessionId !== session.id) return { action: "terminate", reason: "connection mismatch" };
    const isNewConnection = !connection;
    connection ??= await tx.tunnelConnection.create({ data: { id: event.connectionId, sessionId: session.id, gatewayId, connectedAt: now } });

    if (event.type !== "connected") {
      const next = counters(event);
      const delta = {
        bytesIn: Math.max(0, next.bytesIn - Number(connection.bytesIn)),
        bytesOut: Math.max(0, next.bytesOut - Number(connection.bytesOut)),
        requests: Math.max(0, next.requests - connection.requests),
      };
      if (delta.bytesIn || delta.bytesOut || delta.requests) {
        await tx.tunnelConnection.update({
          where: { id: connection.id },
          data: {
            bytesIn: BigInt(Math.max(next.bytesIn, Number(connection.bytesIn))),
            bytesOut: BigInt(Math.max(next.bytesOut, Number(connection.bytesOut))),
            requests: Math.max(next.requests, connection.requests),
          },
        });
        await tx.tunnelSession.update({
          where: { id: session.id },
          data: {
            bytesIn: { increment: BigInt(delta.bytesIn) },
            bytesOut: { increment: BigInt(delta.bytesOut) },
            requestCount: { increment: delta.requests },
            lastActivityAt: now,
          },
        });
        const bucket = hourBucket(now);
        await tx.tunnelMetric.upsert({
          where: { sessionId_bucketStart: { sessionId: session.id, bucketStart: bucket } },
          create: { sessionId: session.id, projectId: session.projectId, workspaceId: ref.workspaceId, bucketStart: bucket, ...delta, bytesIn: BigInt(delta.bytesIn), bytesOut: BigInt(delta.bytesOut) },
          update: { requests: { increment: delta.requests }, bytesIn: { increment: BigInt(delta.bytesIn) }, bytesOut: { increment: BigInt(delta.bytesOut) } },
        });
        overQuota = (await bandwidthToday(ref.workspaceId, tx)) >= quotas().dailyBandwidthBytes;
      }
    }

    const closeConnection = () =>
      connection!.disconnectedAt ? null : tx.tunnelConnection.update({ where: { id: connection!.id }, data: { disconnectedAt: now } });

    // ---- authority: ended, revoked or expired sessions are terminated on the gateway
    const credentialInvalid = !session.credential || session.credential.revokedAt !== null || session.credential.expiresAt <= now;
    const expired = session.expiresAt <= now;
    if (!isActive(session.status) || credentialInvalid || expired || overQuota) {
      if (isActive(session.status)) {
        await endSession(
          tx,
          ref,
          credentialInvalid
            ? { status: "REVOKED", reason: "CLI login revoked or expired", event: TunnelEventType.REVOKED, now }
            : expired
              ? { status: "EXPIRED", reason: "Maximum share duration reached", event: TunnelEventType.EXPIRED, now }
              : { status: "EXPIRED", reason: "Daily bandwidth limit reached", event: TunnelEventType.QUOTA_EXCEEDED, now },
        );
        if (overQuota && !credentialInvalid && !expired) log("warn", "bandwidth quota reached", { workspaceId: ref.workspaceId, sessionId: session.id });
      }
      if (event.type === "disconnected") await closeConnection();
      const status = isActive(session.status) ? (credentialInvalid ? "revoked" : expired ? "expired" : "quota") : session.status.toLowerCase();
      return { action: "terminate", reason: status };
    }

    // ---- lifecycle
    if (event.type === "disconnected") {
      await closeConnection();
      if (session.currentConnectionId === connection.id) {
        // Unexpected drop: keep the URL reserved while the CLI reconnects (or the sweep expires it).
        await tx.tunnelSession.update({
          where: { id: session.id },
          data: { status: TunnelStatus.RECONNECTING, currentConnectionId: null, lastHeartbeatAt: now, lastActivityAt: now },
        });
        await recordEvent(tx, ref, TunnelEventType.CONNECTION_LOST, describeDrop(event.reason));
      }
      return { action: "continue", policy };
    }

    // A late report for a connection that already closed changes nothing.
    if (connection.disconnectedAt) return { action: "continue", policy };

    const adopt =
      session.currentConnectionId !== connection.id &&
      (event.type === "connected" || isNewConnection || session.currentConnectionId === null || session.status !== TunnelStatus.CONNECTED);
    if (adopt) {
      await tx.tunnelSession.update({
        where: { id: session.id },
        data: {
          status: TunnelStatus.CONNECTED,
          connectedAt: session.connectedAt ?? now,
          lastHeartbeatAt: now,
          lastActivityAt: now,
          gatewayId,
          currentConnectionId: connection.id,
        },
      });
      // Only one connection carries a session; older ones (e.g. from a restarted gateway) are over.
      await tx.tunnelConnection.updateMany({ where: { sessionId: session.id, disconnectedAt: null, NOT: { id: connection.id } }, data: { disconnectedAt: now } });
      await recordEvent(tx, ref, session.connectedAt ? TunnelEventType.RECONNECTED : TunnelEventType.CONNECTED);
    } else {
      await tx.tunnelSession.update({
        where: { id: session.id },
        data: { lastHeartbeatAt: now, ...(session.currentConnectionId === connection.id && session.status !== TunnelStatus.CONNECTED ? { status: TunnelStatus.CONNECTED } : {}) },
      });
    }
    return { action: "continue", policy };
  });
}

/** Maps the gateway's internal close reason to a fixed, user-facing phrase. */
function describeDrop(reason: unknown) {
  const r = typeof reason === "string" ? reason : "";
  if (r.includes("ping")) return "The CLI stopped responding";
  if (r.includes("shutting down")) return "The gateway restarted";
  if (r.includes("replaced")) return "Replaced by a newer connection";
  return "Connection to the CLI was lost";
}

/**
 * Applies gateway reports and tells the gateway which tunnels must be terminated
 * (stopped, revoked or expired sessions).
 */
let lastSweep = 0;

export async function handleGatewayEvents(gatewayId: string, events: GatewayEvent[]): Promise<GatewayEventsResponse> {
  const result: GatewayEventsResponse["sessions"] = {};
  const now = new Date();
  for (const event of events.slice(0, 1000)) {
    if (!event || typeof event.sessionId !== "string" || event.sessionId.length > 64) continue;
    if (typeof event.connectionId !== "string" || !CONNECTION_ID.test(event.connectionId)) continue;
    if (!["connected", "heartbeat", "disconnected"].includes(event.type)) continue;
    const verdict = await applyGatewayEvent(gatewayId, event, now);
    // Several events for one session may share a batch; a terminate verdict wins.
    if (result[event.sessionId]?.action !== "terminate") result[event.sessionId] = verdict;
  }
  // Gateways report every ~20 s, so this keeps stale-session cleanup running without a cron.
  if (Date.now() - lastSweep > 30_000) {
    lastSweep = Date.now();
    void sweepStaleTunnels().catch((error) => log("error", "stale sweep failed", { error: error instanceof Error ? error.message : "unknown" }));
  }
  void pruneTelemetry().catch(() => {});
  return { sessions: result };
}

/** Preview traffic (bytes in + out) a workspace has used since 00:00 UTC. */
export async function bandwidthToday(workspaceId: string, db: Pick<typeof prisma, "tunnelMetric"> = prisma) {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const sum = await db.tunnelMetric.aggregate({ where: { workspaceId, bucketStart: { gte: midnight } }, _sum: { bytesIn: true, bytesOut: true } });
  return Number(sum._sum.bytesIn ?? 0n) + Number(sum._sum.bytesOut ?? 0n);
}
