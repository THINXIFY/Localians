import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getLiveTunnels } from "./cli/gateway-control";
import { ACTIVE_STATES, hourBucket, TELEMETRY_RETENTION_DAYS } from "./cli/lifecycle";
import { prisma } from "./db";
import { effectiveStatus } from "./previews";
import { getCurrentWorkspace } from "./workspaces";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RangeKey = "24h" | "7d" | "30d" | "custom";

export type ResolvedRange = {
  key: RangeKey;
  start: Date;
  end: Date;
  binMs: number;
  /** Inputs echoed back for the custom range form (YYYY-MM-DD, UTC). */
  from: string;
  to: string;
  error: string | null;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Turns the URL's range into UTC bounds. Data is stored in UTC-hour buckets, so ranges
 * snap to whole hours; custom ranges are whole UTC days within the retention window.
 */
export function resolveRange(input: { range?: string; from?: string; to?: string }, now = new Date()): ResolvedRange {
  const end = now;
  const preset = (key: "24h" | "7d" | "30d", error: string | null = null): ResolvedRange => {
    const span = key === "24h" ? DAY : key === "7d" ? 7 * DAY : 30 * DAY;
    const start = hourBucket(new Date(end.getTime() - span + HOUR));
    return { key, start, end, binMs: key === "24h" ? HOUR : key === "7d" ? 6 * HOUR : DAY, from: isoDay(start), to: isoDay(end), error };
  };
  if (input.range !== "custom") return preset(input.range === "24h" || input.range === "30d" ? input.range : "7d");

  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!input.from || !input.to || !day.test(input.from) || !day.test(input.to)) return preset("7d", "Choose both a start and an end date.");
  const start = new Date(`${input.from}T00:00:00Z`);
  const last = new Date(`${input.to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(last.getTime())) return preset("7d", "Those dates aren't valid.");
  if (start > last) return preset("7d", "The start date must be on or before the end date.");
  const earliest = new Date(now.getTime() - TELEMETRY_RETENTION_DAYS * DAY);
  if (start < hourBucket(earliest)) return preset("7d", `Activity is kept for ${TELEMETRY_RETENTION_DAYS} days. Choose a later start date.`);
  if (start > now) return preset("7d", "The start date is in the future.");
  const rangeEnd = new Date(Math.min(last.getTime() + DAY, now.getTime()));
  const span = rangeEnd.getTime() - start.getTime();
  return { key: "custom", start, end: rangeEnd, binMs: span <= 2 * DAY ? HOUR : span <= 14 * DAY ? 6 * HOUR : DAY, from: input.from, to: input.to, error: null };
}

export type SeriesPoint = { start: Date; requests: number; bytes: number };

export async function getAnalytics(userId: string, range: ResolvedRange, projectId?: string) {
  const workspace = await getCurrentWorkspace(userId);
  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id, workspace: { members: { some: { userId } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  // A project id from the URL only counts if it belongs to this workspace.
  const project = projectId ? projects.find((p) => p.id === projectId) ?? null : null;
  const projectFilter = project ? { projectId: project.id } : {};

  const metricWhere: Prisma.TunnelMetricWhereInput = { workspaceId: workspace.id, ...projectFilter, bucketStart: { gte: range.start, lt: range.end } };
  const sessionScope: Prisma.TunnelSessionWhereInput = { project: { workspaceId: workspace.id, workspace: { members: { some: { userId } } } }, ...projectFilter };

  const live = await getLiveTunnels();
  const [byHour, byProject, sessionsByProject, lastByProject, activeRows, everShared] = await Promise.all([
    prisma.tunnelMetric.groupBy({ by: ["bucketStart"], where: metricWhere, _sum: { requests: true, bytesIn: true, bytesOut: true }, orderBy: { bucketStart: "asc" } }),
    prisma.tunnelMetric.groupBy({ by: ["projectId"], where: metricWhere, _sum: { requests: true, bytesIn: true, bytesOut: true } }),
    prisma.tunnelSession.groupBy({ by: ["projectId"], where: { ...sessionScope, createdAt: { gte: range.start, lt: range.end } }, _count: { _all: true } }),
    prisma.tunnelSession.groupBy({ by: ["projectId"], where: { ...sessionScope, lastActivityAt: { gte: range.start, lt: range.end } }, _max: { lastActivityAt: true } }),
    prisma.tunnelSession.findMany({
      where: { ...sessionScope, status: { in: ACTIVE_STATES } },
      select: { id: true, status: true, connectedAt: true, lastHeartbeatAt: true, gatewayId: true },
    }),
    prisma.tunnelSession.count({ where: { project: { workspaceId: workspace.id, workspace: { members: { some: { userId } } } } } }),
  ]);

  // Fold hourly buckets into display bins (zero-filled, so gaps are real gaps in activity).
  const firstBin = Math.floor(range.start.getTime() / range.binMs) * range.binMs;
  const series: SeriesPoint[] = [];
  for (let t = firstBin; t < range.end.getTime(); t += range.binMs) series.push({ start: new Date(t), requests: 0, bytes: 0 });
  for (const row of byHour) {
    const index = Math.floor((row.bucketStart.getTime() - firstBin) / range.binMs);
    const point = series[index];
    if (!point) continue;
    point.requests += row._sum.requests ?? 0;
    point.bytes += Number(row._sum.bytesIn ?? 0n) + Number(row._sum.bytesOut ?? 0n);
  }

  const names = new Map(projects.map((p) => [p.id, p.name]));
  const breakdown = new Map<string, { projectId: string; name: string; sessions: number; requests: number; bytes: number; lastActivity: Date | null }>();
  const entry = (id: string) => {
    let e = breakdown.get(id);
    if (!e) {
      e = { projectId: id, name: names.get(id) ?? "Deleted project", sessions: 0, requests: 0, bytes: 0, lastActivity: null };
      breakdown.set(id, e);
    }
    return e;
  };
  for (const r of byProject) {
    const e = entry(r.projectId);
    e.requests = r._sum.requests ?? 0;
    e.bytes = Number(r._sum.bytesIn ?? 0n) + Number(r._sum.bytesOut ?? 0n);
  }
  for (const r of sessionsByProject) entry(r.projectId).sessions = r._count._all;
  for (const r of lastByProject) entry(r.projectId).lastActivity = r._max.lastActivityAt;
  const rows = [...breakdown.values()].filter((r) => names.has(r.projectId)).sort((a, b) => b.requests - a.requests || b.bytes - a.bytes || a.name.localeCompare(b.name));

  const totals = {
    sessions: sessionsByProject.reduce((n, r) => n + r._count._all, 0),
    requests: series.reduce((n, p) => n + p.requests, 0),
    bytes: series.reduce((n, p) => n + p.bytes, 0),
    active: activeRows.filter((r) => effectiveStatus(r, live).status === "CONNECTED").length,
  };

  return { projects, project, series, breakdown: rows, totals, hasAnyActivity: everShared > 0 };
}
