import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TunnelEventType, TunnelStatus, WorkspaceRole } from "@/generated/prisma/enums";
import { getTunnelConfig, previewUrl } from "./cli/config";
import { getLiveTunnels, type LiveTunnels, terminateOnGateway } from "./cli/gateway-control";
import { ACTIVE_STATES, endSession, hourBucket, isActive } from "./cli/lifecycle";
import { STOPPED_FROM_DASHBOARD, sweepStaleTunnels } from "./cli/tunnels";
import { prisma } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";
import { getCurrentWorkspace, type WorkspaceContext } from "./workspaces";
import { TIME_UP_REASON } from "@tunnel/shared/durations";

/**
 * What the dashboard shows. EXPIRED = its time ran out; OFFLINE = it ended because the CLI or computer went away;
 * FAILED = it ended without the CLI ever connecting.
 */
export type PreviewStatus = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "EXPIRED" | "OFFLINE" | "REVOKED" | "FAILED";
/** How the status was established: asked the gateway, inferred from heartbeats, or a final DB state. */
export type StatusSource = "gateway" | "heartbeat" | "final";

export type PreviewFilter = "all" | "connected" | "offline" | "historical";
export type PreviewSort = "activity" | "newest";

/** A connected session must have heartbeated within this window when the gateway can't be asked. */
const HEARTBEAT_FRESH_MS = 45_000;
const PAGE_SIZE = 20;

const previewSelect = {
  id: true,
  userId: true,
  hostname: true,
  localPort: true,
  status: true,
  createdAt: true,
  connectedAt: true,
  lastHeartbeatAt: true,
  disconnectedAt: true,
  lastActivityAt: true,
  expiresAt: true,
  durationMinutes: true,
  endReason: true,
  gatewayId: true,
  bytesIn: true,
  bytesOut: true,
  requestCount: true,
  project: { select: { id: true, name: true, slug: true, defaultPort: true, status: true, accessMode: true } },
} satisfies Prisma.TunnelSessionSelect;

type PreviewRow = Prisma.TunnelSessionGetPayload<{ select: typeof previewSelect }>;

export type Preview = {
  id: string;
  label: string;
  publicUrl: string | null;
  localPort: number;
  status: PreviewStatus;
  statusSource: StatusSource;
  /** True while the gateway routes (or may route) traffic for it. */
  active: boolean;
  createdAt: Date;
  connectedAt: Date | null;
  lastHeartbeatAt: Date | null;
  disconnectedAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
  /** Length chosen when it started (null for sessions from before timers). */
  durationMinutes: number | null;
  endReason: string | null;
  bytesIn: number;
  bytesOut: number;
  requestCount: number;
  canStop: boolean;
  project: { id: string; name: string; slug: string; defaultPort: number | null; archived: boolean; access: "PUBLIC" | "PASSWORD" };
};

/** Every preview query is restricted to the user's current workspace *and* their membership of it. */
async function scope(userId: string) {
  const workspace = await getCurrentWorkspace(userId);
  const where: Prisma.TunnelSessionWhereInput = { project: { workspaceId: workspace.id, workspace: { members: { some: { userId } } } } };
  return { workspace, where };
}

export function effectiveStatus(
  row: Pick<PreviewRow, "id" | "status" | "connectedAt" | "lastHeartbeatAt" | "gatewayId"> & { endReason?: string | null },
  live: LiveTunnels | null,
  now = Date.now(),
): { status: PreviewStatus; source: StatusSource } {
  if (!isActive(row.status)) {
    if (row.status !== TunnelStatus.EXPIRED) return { status: row.status, source: "final" };
    return { status: row.endReason === TIME_UP_REASON ? "EXPIRED" : row.connectedAt ? "OFFLINE" : "FAILED", source: "final" };
  }
  const sinceHeartbeat = row.lastHeartbeatAt ? now - row.lastHeartbeatAt.getTime() : Infinity;
  // The gateway's own routing table is the authority — not a possibly stale database row.
  const table = live ? (row.gatewayId ? live.gateways.get(row.gatewayId) : live.gateways.size === 1 ? [...live.gateways.values()][0] : undefined) : undefined;
  if (table) {
    if (table.has(row.id)) return { status: "CONNECTED", source: "gateway" };
    if (row.status === TunnelStatus.CONNECTED) {
      // Accepted a moment ago and not yet in the (2 s cached) routing table.
      return { status: sinceHeartbeat < 5000 ? "CONNECTING" : "RECONNECTING", source: "gateway" };
    }
    return { status: row.status, source: "gateway" };
  }
  if (row.status === TunnelStatus.CONNECTED) return { status: sinceHeartbeat < HEARTBEAT_FRESH_MS ? "CONNECTED" : "RECONNECTING", source: "heartbeat" };
  return { status: row.status, source: "heartbeat" };
}

const canStopSession = (row: { userId: string }, userId: string, workspace: WorkspaceContext) =>
  row.userId === userId || workspace.role === WorkspaceRole.OWNER;

function toPreview(row: PreviewRow, live: LiveTunnels | null, userId: string, workspace: WorkspaceContext): Preview {
  const config = getTunnelConfig();
  const { status, source } = effectiveStatus(row, live);
  return {
    id: row.id,
    label: row.hostname,
    publicUrl: config ? previewUrl(config, row.hostname) : null,
    localPort: row.localPort,
    status,
    statusSource: source,
    active: isActive(row.status),
    createdAt: row.createdAt,
    connectedAt: row.connectedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    disconnectedAt: row.disconnectedAt,
    lastActivityAt: row.lastActivityAt,
    expiresAt: row.expiresAt,
    durationMinutes: row.durationMinutes,
    endReason: row.endReason,
    bytesIn: Number(row.bytesIn),
    bytesOut: Number(row.bytesOut),
    requestCount: row.requestCount,
    canStop: isActive(row.status) && canStopSession(row, userId, workspace),
    project: { id: row.project.id, name: row.project.name, slug: row.project.slug, defaultPort: row.project.defaultPort, archived: row.project.status === "ARCHIVED", access: row.project.accessMode },
  };
}

/** Matches project names, and preview URLs/labels (pasting the full link works). */
function searchWhere(q: string): Prisma.TunnelSessionWhereInput | null {
  const query = q.trim().slice(0, 100);
  if (!query) return null;
  const label = query.toLowerCase().replace(/^https?:\/\//, "").split(/[.:/?#]/)[0];
  return {
    OR: [
      { project: { name: { contains: query, mode: "insensitive" } } },
      ...(/^[a-z2-7]{3,12}$/.test(label) ? [{ hostname: { contains: label } }] : []),
    ],
  };
}

const GROUPS: Record<"connected" | "offline", PreviewStatus[]> = {
  connected: ["CONNECTED"],
  offline: ["CONNECTING", "RECONNECTING"],
};

export async function listPreviews(
  userId: string,
  options: { filter?: PreviewFilter; projectId?: string; q?: string; sort?: PreviewSort; cursor?: string } = {},
) {
  const { workspace, where } = await scope(userId);
  await sweepStaleTunnels(where);
  const filter = options.filter ?? "all";
  const and: Prisma.TunnelSessionWhereInput[] = [where];
  if (options.projectId) and.push({ projectId: options.projectId });
  const search = searchWhere(options.q ?? "");
  if (search) and.push(search);
  const orderBy: Prisma.TunnelSessionOrderByWithRelationInput[] =
    options.sort === "newest" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ lastActivityAt: "desc" }, { id: "desc" }];
  const live = await getLiveTunnels();

  if (filter === "connected" || filter === "offline") {
    // Active sessions are few (capped per user), and their group depends on live gateway state.
    const rows = await prisma.tunnelSession.findMany({ where: { AND: [...and, { status: { in: ACTIVE_STATES } }] }, select: previewSelect, orderBy, take: 200 });
    const items = rows.map((r) => toPreview(r, live, userId, workspace)).filter((p) => GROUPS[filter].includes(p.status));
    return { items, nextCursor: null as string | null, gatewayReachable: live !== null };
  }

  if (filter === "historical") and.push({ status: { notIn: ACTIVE_STATES } });
  const rows = await prisma.tunnelSession.findMany({
    where: { AND: and },
    select: previewSelect,
    orderBy,
    take: PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, PAGE_SIZE);
  return {
    items: page.map((r) => toPreview(r, live, userId, workspace)),
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    gatewayReachable: live !== null,
  };
}

/** Rolling window for the request/bandwidth figures outside the Analytics page. */
export const SUMMARY_WINDOW_DAYS = 7;

export async function getPreviewSummary(userId: string) {
  const { workspace, where } = await scope(userId);
  await sweepStaleTunnels(where);
  const since = hourBucket(new Date(Date.now() - SUMMARY_WINDOW_DAYS * 24 * 3600_000));
  const live = await getLiveTunnels();
  const [activeRows, totalSessions, traffic] = await Promise.all([
    prisma.tunnelSession.findMany({ where: { AND: [where, { status: { in: ACTIVE_STATES } }] }, select: previewSelect, orderBy: { lastActivityAt: "desc" }, take: 200 }),
    prisma.tunnelSession.count({ where }),
    prisma.tunnelMetric.aggregate({ where: { workspaceId: workspace.id, bucketStart: { gte: since } }, _sum: { requests: true, bytesIn: true, bytesOut: true } }),
  ]);
  const active = activeRows.map((r) => toPreview(r, live, userId, workspace));
  return {
    active,
    connectedCount: active.filter((p) => p.status === "CONNECTED").length,
    totalSessions,
    requests: traffic._sum.requests ?? 0,
    bytes: Number(traffic._sum.bytesIn ?? 0n) + Number(traffic._sum.bytesOut ?? 0n),
    gatewayReachable: live !== null,
  };
}

export async function getPreviewDetail(userId: string, sessionId: string) {
  if (typeof sessionId !== "string" || sessionId.length > 64) throw new NotFoundError("Preview not found.");
  const { workspace, where } = await scope(userId);
  await sweepStaleTunnels({ AND: [where, { id: sessionId }] });
  const row = await prisma.tunnelSession.findFirst({ where: { AND: [where, { id: sessionId }] }, select: previewSelect });
  if (!row) throw new NotFoundError("Preview not found.");
  const [events, connections, live] = await Promise.all([
    prisma.tunnelEvent.findMany({ where: { sessionId: row.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, type: true, detail: true, createdAt: true } }),
    prisma.tunnelConnection.count({ where: { sessionId: row.id } }),
    getLiveTunnels(),
  ]);
  return {
    preview: toPreview(row, live, userId, workspace),
    workspace: { name: workspace.name },
    events,
    connections,
    gatewayId: row.gatewayId,
    gatewayReachable: live !== null,
  };
}

export async function getProjectPreviews(userId: string, projectId: string) {
  const { workspace, where } = await scope(userId);
  const projectWhere: Prisma.TunnelSessionWhereInput = { AND: [where, { projectId }] };
  await sweepStaleTunnels(projectWhere);
  const live = await getLiveTunnels();
  const [rows, total] = await Promise.all([
    prisma.tunnelSession.findMany({ where: projectWhere, select: previewSelect, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], take: 8 }),
    prisma.tunnelSession.count({ where: projectWhere }),
  ]);
  const items = rows.map((r) => toPreview(r, live, userId, workspace));
  return { active: items.filter((p) => p.active), history: items.filter((p) => !p.active), total };
}

export async function getRecentActivity(userId: string, take = 8) {
  const { workspace } = await scope(userId);
  const config = getTunnelConfig();
  const events = await prisma.tunnelEvent.findMany({
    where: { workspaceId: workspace.id, session: { project: { workspace: { members: { some: { userId } } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, type: true, detail: true, createdAt: true, session: { select: { id: true, hostname: true, project: { select: { name: true } } } } },
  });
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    detail: e.detail,
    createdAt: e.createdAt,
    sessionId: e.session.id,
    projectName: e.session.project.name,
    publicUrl: config ? previewUrl(config, e.session.hostname) : null,
  }));
}

export type StopOutcome = {
  outcome: "stopped" | "already_ended";
  /** confirmed: the gateway closed the tunnel and no longer routes it. pending: it will at its next check-in. */
  gateway: "confirmed" | "pending" | "not_needed";
};

/**
 * Dashboard "Stop preview": ends the session (routing authority revoked), then tells the
 * gateway to close the live tunnel and refuse reconnects. Safe to repeat.
 */
export async function stopPreview(userId: string, sessionId: string): Promise<StopOutcome> {
  if (typeof sessionId !== "string" || sessionId.length > 64) throw new NotFoundError("Preview not found.");
  const { workspace, where } = await scope(userId);
  const row = await prisma.tunnelSession.findFirst({ where: { AND: [where, { id: sessionId }] }, select: { id: true, userId: true, status: true, endReason: true, gatewayId: true } });
  if (!row) throw new NotFoundError("Preview not found.");
  if (!canStopSession(row, userId, workspace)) throw new ForbiddenError("Only the person who started this preview, or the workspace owner, can stop it.");

  const endedNow = await prisma.$transaction((tx) =>
    endSession(tx, { id: row.id, workspaceId: workspace.id }, { status: "REVOKED", reason: STOPPED_FROM_DASHBOARD, event: TunnelEventType.STOPPED_FROM_DASHBOARD }),
  );
  // A duplicate click after a dashboard stop still re-confirms with the gateway; an old, naturally ended session doesn't need it.
  const stoppedFromDashboard = endedNow || row.endReason === STOPPED_FROM_DASHBOARD;
  if (!stoppedFromDashboard) return { outcome: "already_ended", gateway: "not_needed" };

  const result = await terminateOnGateway(row.id, row.gatewayId);
  return {
    outcome: endedNow ? "stopped" : "already_ended",
    gateway: result.delivered && !result.routing ? "confirmed" : "pending",
  };
}

/**
 * What the Share App wizard shows in step 3. Only this user's own sessions in their current
 * workspace are considered (never matched on port alone): the newest one started since the
 * wizard opened, else their newest still-active one.
 */
export async function getShareStatus(userId: string, since: Date) {
  const { workspace, where } = await scope(userId);
  const mine: Prisma.TunnelSessionWhereInput = { AND: [where, { userId }] };
  await sweepStaleTunnels(mine);
  const [recent, active, cliLogins] = await Promise.all([
    prisma.tunnelSession.findFirst({ where: { AND: [mine, { createdAt: { gte: since } }] }, select: previewSelect, orderBy: { createdAt: "desc" } }),
    prisma.tunnelSession.findFirst({ where: { AND: [mine, { status: { in: ACTIVE_STATES } }] }, select: previewSelect, orderBy: { createdAt: "desc" } }),
    prisma.cliCredential.count({ where: { userId, workspaceId: workspace.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const row = recent ?? active;
  const live = row ? await getLiveTunnels() : null;
  return {
    cliLoggedIn: cliLogins > 0,
    preview: row ? { ...toPreview(row, live, userId, workspace), startedBeforeWizard: !recent } : null,
  };
}
