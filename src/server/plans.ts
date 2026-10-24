import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { durationLabel, FREE_MAX_MINUTES, isDurationOption, PASS_MAX_MINUTES } from "@tunnel/shared/durations";
import { prisma } from "./db";

/**
 * Preview plans, decided on the server only (dashboard, CLI and VS Code are all checked here):
 *
 * - Free preview: each project gets ONE free 24-hour window, starting with its first share. Shares inside the window
 *   are fine (restarts, reconnects, another port, a new setup code) but never outlive it. When it has ended, the
 *   project can't start another free preview. Abuse limit: QUOTA_FREE_PREVIEWS_PER_30_DAYS (default 3) new free
 *   windows per workspace and per user per rolling 30 days; windows of deleted projects still count.
 * - 7-Day Pass ($5, non-recurring): 7 more days of preview access for one project plus its custom URL. A renewal
 *   starts when the current pass ends (passes chain). Created only by a verified payment or an operator.
 *
 * Existing projects aren't charged retroactively: a project's free window starts at its first share after this
 * release, whatever previews it had before.
 */
export const FREE_WINDOW_MS = FREE_MAX_MINUTES * 60_000;
export const PASS_MS = PASS_MAX_MINUTES * 60_000;
/** After a pass ends, its custom URL stays reserved this long so it can be renewed; then it's released. */
export const NAME_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

const envInt = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};
export const freePreviewsPer30Days = () => envInt("QUOTA_FREE_PREVIEWS_PER_30_DAYS", 3);

type Db = Prisma.TransactionClient | typeof prisma;

export type FreeState =
  | { state: "available" }
  | { state: "active"; startedAt: Date; endsAt: Date }
  | { state: "used"; startedAt: Date; endsAt: Date }
  | { state: "limit_reached"; resetsAt: Date };

export type PassInfo = { id: string; startsAt: Date; endsAt: Date };

export type ProjectPlan = {
  /** The pass covering now, if any. */
  pass: PassInfo | null;
  /** When paid access ends, counting renewals that start later (null without an active pass). */
  passEndsAt: Date | null;
  /** The most recent pass end within the custom-URL grace period, if any (renew before it to keep the URL). */
  lastPassEndedAt: Date | null;
  free: FreeState;
  /** What a share started now would get, or why it can't start. */
  share: { tier: "PASS" | "FREE"; endsAt: Date } | { tier: null; reason: "free_used" | "free_limit" };
};

/** Active passes of a project from `now` on, merged into one continuous period (renewals chain back to back). */
export async function passWindow(db: Db, projectId: string, now: Date) {
  const passes = await db.previewPass.findMany({
    where: { projectId, status: "ACTIVE", endsAt: { gt: new Date(now.getTime() - NAME_GRACE_MS) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true },
  });
  const current = passes.find((p) => p.startsAt <= now && p.endsAt > now) ?? null;
  let end = current?.endsAt ?? null;
  if (end) for (const p of passes) if (p.startsAt <= end && p.endsAt > end) end = p.endsAt;
  const lastEnded = passes.filter((p) => p.endsAt <= now).at(-1)?.endsAt ?? null;
  return { current, end, lastEnded };
}

async function freeCaps(db: Db, workspaceId: string, userId: string, now: Date) {
  const since = new Date(now.getTime() - DAYS_30);
  const limit = freePreviewsPer30Days();
  const [byWorkspace, byUser] = await Promise.all([
    db.freePreviewGrant.findMany({ where: { workspaceId, startedAt: { gte: since } }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
    db.freePreviewGrant.findMany({ where: { userId, startedAt: { gte: since } }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
  ]);
  const full = [byWorkspace, byUser].filter((list) => list.length >= limit);
  if (!full.length) return null;
  // The allowance frees up when enough windows have left the 30-day range.
  const resetsAt = new Date(Math.max(...full.map((list) => list[list.length - limit].startedAt.getTime())) + DAYS_30);
  return { resetsAt };
}

/** The project's plan right now, for the dashboard and for authorizing a share. */
export async function getProjectPlan(project: { id: string; workspaceId: string }, userId: string, now = new Date(), db: Db = prisma): Promise<ProjectPlan> {
  const [passes, grant] = await Promise.all([passWindow(db, project.id, now), db.freePreviewGrant.findUnique({ where: { projectId: project.id } })]);
  let free: FreeState;
  if (grant) free = grant.endsAt > now ? { state: "active", startedAt: grant.startedAt, endsAt: grant.endsAt } : { state: "used", startedAt: grant.startedAt, endsAt: grant.endsAt };
  else {
    const caps = await freeCaps(db, project.workspaceId, userId, now);
    free = caps ? { state: "limit_reached", resetsAt: caps.resetsAt } : { state: "available" };
  }
  const pass = passes.current ? { id: passes.current.id, startsAt: passes.current.startsAt, endsAt: passes.current.endsAt } : null;
  const share: ProjectPlan["share"] = passes.end
    ? { tier: "PASS", endsAt: passes.end }
    : free.state === "active"
      ? { tier: "FREE", endsAt: free.endsAt }
      : free.state === "available"
        ? { tier: "FREE", endsAt: new Date(now.getTime() + FREE_WINDOW_MS) }
        : { tier: null, reason: free.state === "used" ? "free_used" : "free_limit" };
  return { pass, passEndsAt: passes.end, lastPassEndedAt: passes.lastEnded, free, share };
}

/**
 * What a client may offer for each project right now (CLI/VS Code `/me`): the same answer as getProjectPlan, for many
 * projects in three queries. `share` null: nothing can be shared until a Preview Pass (free_used) or the free allowance
 * resets (free_limit).
 */
export async function getProjectPlanSummaries(projects: { id: string; workspaceId: string }[], userId: string, now = new Date(), db: Db = prisma) {
  const ids = projects.map((p) => p.id);
  if (!ids.length) return new Map<string, PlanSummary>();
  const [passes, grants] = await Promise.all([
    db.previewPass.findMany({
      where: { projectId: { in: ids }, status: "ACTIVE", endsAt: { gt: new Date(now.getTime() - NAME_GRACE_MS) } },
      orderBy: { startsAt: "asc" },
      select: { projectId: true, startsAt: true, endsAt: true },
    }),
    db.freePreviewGrant.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, endsAt: true } }),
  ]);
  const needsCaps = projects.find((p) => !grants.some((g) => g.projectId === p.id));
  const caps = needsCaps ? await freeCaps(db, needsCaps.workspaceId, userId, now) : null;
  const out = new Map<string, PlanSummary>();
  for (const p of projects) {
    const mine = passes.filter((x) => x.projectId === p.id);
    const current = mine.find((x) => x.startsAt <= now && x.endsAt > now);
    let passEnd = current?.endsAt ?? null;
    if (passEnd) for (const x of mine) if (x.startsAt <= passEnd && x.endsAt > passEnd) passEnd = x.endsAt;
    const grant = grants.find((g) => g.projectId === p.id);
    const free: PlanSummary["free"] = grant ? (grant.endsAt > now ? "active" : "used") : caps ? "limit_reached" : "available";
    out.set(p.id, {
      pass: Boolean(passEnd),
      passEndsAt: passEnd?.toISOString() ?? null,
      free,
      freeEndsAt: grant && grant.endsAt > now ? grant.endsAt.toISOString() : null,
      canShare: Boolean(passEnd) || free === "active" || free === "available",
    });
  }
  return out;
}
export type PlanSummary = {
  /** A Preview Pass covers this project now (until passEndsAt, renewals included). */
  pass: boolean;
  passEndsAt: string | null;
  free: "available" | "active" | "used" | "limit_reached";
  freeEndsAt: string | null;
  /** Whether a new share is allowed right now. */
  canShare: boolean;
};

export class PlanError extends Error {
  constructor(
    readonly code: "free_used" | "free_limit" | "invalid_duration" | "plan_required",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type ShareGrant = { tier: "FREE" | "PASS"; expiresAt: Date; durationMinutes: number | null; untilPlanEnd: boolean };

/**
 * Authorizes a new share inside the caller's transaction (which must hold the project's row lock, see lockProject):
 * returns how long it may run, starting the project's free window if this is its first share. `durationMinutes` is an
 * optional shorter auto-stop; without it the share runs until the free window / pass ends.
 */
export async function authorizeShare(tx: Prisma.TransactionClient, project: { id: string; workspaceId: string }, userId: string, durationMinutes: unknown, now = new Date()): Promise<ShareGrant> {
  if (durationMinutes !== undefined && durationMinutes !== null && !isDurationOption(durationMinutes)) {
    throw new PlanError("invalid_duration", "Choose a duration of 5m, 15m, 30m, 1h, 12h or 24h (3d or 7d with a Preview Pass).", 400);
  }
  const minutes = (durationMinutes ?? null) as number | null;
  // Free windows are capped per workspace and per user: serialise those checks across the workspace's projects.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free-previews:${project.workspaceId}`}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free-previews-user:${userId}`}))`;
  const plan = await getProjectPlan(project, userId, now, tx);

  if (plan.share.tier === null) {
    throw plan.share.reason === "free_used"
      ? new PlanError("free_used", "This project's free 24-hour preview has ended. Get a Preview Pass to keep sharing it, with a custom URL.", 402)
      : new PlanError(
          "free_limit",
          `You've started ${freePreviewsPer30Days()} free previews in the last 30 days. Share a project that's still in its free window, get a Preview Pass, or try again later.`,
          429,
        );
  }
  if (plan.share.tier === "FREE" && minutes !== null && minutes > FREE_MAX_MINUTES) {
    throw new PlanError("plan_required", `Free previews last up to ${durationLabel(FREE_MAX_MINUTES)}. Get a Preview Pass for longer sessions.`, 403);
  }
  if (plan.share.tier === "FREE" && plan.free.state === "available") {
    await tx.freePreviewGrant.create({ data: { projectId: project.id, workspaceId: project.workspaceId, userId, startedAt: now, endsAt: new Date(now.getTime() + FREE_WINDOW_MS) } });
  }
  const end = plan.share.endsAt;
  const wanted = minutes !== null ? new Date(now.getTime() + minutes * 60_000) : end;
  return { tier: plan.share.tier, expiresAt: wanted < end ? wanted : end, durationMinutes: minutes, untilPlanEnd: wanted >= end };
}

/** Serialises plan changes and share authorization for one project (row lock until the transaction ends). */
export async function lockProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
}
