import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getLiveTunnels } from "./cli/gateway-control";
import { ACTIVE_STATES } from "./cli/lifecycle";
import { prisma } from "./db";
import { effectiveStatus, type PreviewStatus } from "./previews";
import { getCurrentWorkspace } from "./workspaces";

/** One changed preview, as pushed to dashboard tabs. Status and counters only — never URLs' traffic content. */
export type PreviewChange = {
  id: string;
  projectId: string;
  projectName: string;
  status: PreviewStatus;
  previousStatus: PreviewStatus | null;
  requestCount: number;
  bytes: number;
};

export type ChangeTracker = {
  since: Date;
  signatures: Map<string, { status: PreviewStatus; sig: string }>;
};

export const newTracker = (since: Date): ChangeTracker => ({ since, signatures: new Map() });

/**
 * Finds previews whose effective status or counters changed since the last call.
 * Candidates are the workspace's active sessions plus anything updated since the cursor;
 * comparing signatures (status + counters) means heartbeat-only row updates don't
 * trigger refreshes, while gateway-observed changes do even if the row is unchanged.
 */
export async function collectChanges(userId: string, tracker: ChangeTracker, filter: { projectId?: string; sessionId?: string } = {}) {
  const workspace = await getCurrentWorkspace(userId);
  const tickStart = new Date();
  const where: Prisma.TunnelSessionWhereInput = {
    AND: [
      { project: { workspaceId: workspace.id, workspace: { members: { some: { userId } } } } },
      filter.projectId ? { projectId: filter.projectId } : {},
      filter.sessionId ? { id: filter.sessionId } : {},
      { OR: [{ status: { in: ACTIVE_STATES } }, { updatedAt: { gt: tracker.since } }] },
    ],
  };
  const [rows, live] = await Promise.all([
    prisma.tunnelSession.findMany({
      where,
      select: {
        id: true,
        status: true,
        connectedAt: true,
        lastHeartbeatAt: true,
        gatewayId: true,
        updatedAt: true,
        requestCount: true,
        bytesIn: true,
        bytesOut: true,
        project: { select: { id: true, name: true } },
      },
      take: 200,
    }),
    getLiveTunnels(),
  ]);

  const changes: PreviewChange[] = [];
  for (const row of rows) {
    const { status } = effectiveStatus(row, live, tickStart.getTime());
    const bytes = Number(row.bytesIn) + Number(row.bytesOut);
    const sig = `${status}|${row.requestCount}|${bytes}`;
    const previous = tracker.signatures.get(row.id);
    const changed = previous ? previous.sig !== sig : row.updatedAt > tracker.since;
    tracker.signatures.set(row.id, { status, sig });
    if (changed) {
      changes.push({ id: row.id, projectId: row.project.id, projectName: row.project.name, status, previousStatus: previous?.status ?? null, requestCount: row.requestCount, bytes });
    }
  }
  // Overlap the next window slightly: signatures de-duplicate anything seen twice.
  tracker.since = new Date(tickStart.getTime() - 2000);
  if (tracker.signatures.size > 2000) tracker.signatures.clear();
  return { changes, cursor: tickStart };
}
