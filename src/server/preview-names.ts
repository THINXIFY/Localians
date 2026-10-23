import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { PreviewNameStatus, TunnelEventType } from "@/generated/prisma/enums";
import { checkNameFormat } from "@/lib/preview-names";
import { TIME_UP_REASON } from "@tunnel/shared/durations";
import { audit, type AuditActor } from "./audit";
import { getTunnelConfig, previewUrl } from "./cli/config";
import { terminateOnGateway } from "./cli/gateway-control";
import { ACTIVE_STATES, endSession } from "./cli/lifecycle";
import { prisma } from "./db";
import { log } from "./log";
import { getProjectPlan, NAME_GRACE_MS } from "./plans";
import { getProjectForUser } from "./projects";
import { requireMembership } from "./workspaces";

/**
 * Custom preview URLs (`<name>.<preview domain>`), part of the 7-Day Pass: one per project, reserved independently of
 * tunnel sessions. Lifecycle of a name (one row per name, forever):
 *
 *   (none) ──hold (checkout, 15 min)──▶ HELD ──pass activates──▶ ACTIVE ──released, or pass ended + 3-day grace──▶ RELEASED
 *              expired hold: RELEASED, claimable by anyone now                       quarantine (30 days): only the
 *                                                                                    previous workspace may reclaim it
 *
 * The quarantine stops a link that was just in use from immediately serving someone else's app. Every transition is
 * audited. Database guards: unique name, one name per project, one live session per name.
 */
export const HOLD_MS = 15 * 60 * 1000;
export const QUARANTINE_MS = 30 * 24 * 60 * 60 * 1000;
/** Changes of a project's custom URL (release + new name) per 30 days, so links don't churn. */
export const CHANGES_PER_30_DAYS = 3;

export class NameError extends Error {
  constructor(
    readonly code: "invalid" | "taken" | "plan_required" | "too_many_changes" | "not_found" | "confirm_mismatch",
    message: string,
  ) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;

export type Availability =
  | { status: "invalid"; reason: string }
  | { status: "available"; name: string }
  | { status: "yours"; name: string; projectId: string | null }
  | { status: "taken"; name: string; reason: string };

/** Whether `name` can be claimed by `workspaceId` right now. Never says who holds a taken name. */
export async function nameAvailability(workspaceId: string, input: string, now = new Date(), db: Tx | typeof prisma = prisma): Promise<Availability> {
  const format = checkNameFormat(input);
  if (!format.ok) return { status: "invalid", reason: format.reason };
  const row = await db.previewName.findUnique({ where: { name: format.name } });
  if (!row) return { status: "available", name: format.name };
  const mine = row.workspaceId === workspaceId;
  if (row.status === PreviewNameStatus.ACTIVE) return mine ? { status: "yours", name: row.name, projectId: row.projectId } : { status: "taken", name: row.name, reason: "That name is taken. Try another." };
  if (row.status === PreviewNameStatus.HELD) {
    if (mine) return { status: "yours", name: row.name, projectId: row.projectId };
    if (row.heldUntil && row.heldUntil > now) return { status: "taken", name: row.name, reason: "Someone is checking out with that name right now. Try another, or check back in 15 minutes." };
    return { status: "available", name: row.name };
  }
  if (mine || !row.availableAt || row.availableAt <= now) return { status: "available", name: row.name };
  return { status: "taken", name: row.name, reason: "That name was used recently and isn't available yet. Try another." };
}

async function lockName(tx: Tx, name: string) {
  // Serialises every transition of one name (also when the row doesn't exist yet).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preview-name:${name}`}))`;
}

async function lockProjectNames(tx: Tx, projectId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preview-name-project:${projectId}`}))`;
}

/** Moves the name to this workspace/project (row created, or taken over from HELD / RELEASED), inside a transaction. */
async function take(tx: Tx, workspaceId: string, name: string, data: { status: PreviewNameStatus; projectId: string; heldUntil: Date | null; userId: string | null }, now: Date) {
  await lockName(tx, name);
  const availability = await nameAvailability(workspaceId, name, now, tx);
  if (availability.status === "invalid") throw new NameError("invalid", availability.reason);
  if (availability.status === "taken") throw new NameError("taken", availability.reason);
  if (availability.status === "yours" && availability.projectId && availability.projectId !== data.projectId) {
    throw new NameError("taken", "Another project in this workspace uses that name.");
  }
  const fields = {
    workspaceId,
    status: data.status,
    projectId: data.projectId,
    heldUntil: data.heldUntil,
    claimedAt: data.status === PreviewNameStatus.ACTIVE ? now : null,
    releasedAt: null,
    availableAt: null,
    releaseReason: null,
    createdById: data.userId,
  };
  try {
    return await tx.previewName.upsert({ where: { name }, create: { name, ...fields }, update: fields });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new NameError("taken", "This project already has a custom URL. Release it first, or change it.");
    throw error;
  }
}

/** The project's custom name (HELD or ACTIVE), if any. */
export function currentName(projectId: string, db: Tx | typeof prisma = prisma) {
  return db.previewName.findFirst({ where: { projectId, status: { in: [PreviewNameStatus.HELD, PreviewNameStatus.ACTIVE] } } });
}

/** Ends the live preview served on a name (it stops working right away). */
async function endNameSessions(tx: Tx, name: string, workspaceId: string, reason: string) {
  const live = await tx.tunnelSession.findMany({ where: { customName: name, status: { in: ACTIVE_STATES } }, select: { id: true, gatewayId: true } });
  for (const s of live) await endSession(tx, { id: s.id, workspaceId }, { status: "REVOKED", reason, event: TunnelEventType.REVOKED });
  return live;
}

async function release(tx: Tx, row: { id: string; name: string; workspaceId: string; projectId: string | null }, actor: AuditActor, reason: string, now: Date) {
  const ended = await endNameSessions(tx, row.name, row.workspaceId, "The custom URL was released");
  await tx.previewName.update({
    where: { id: row.id },
    data: { status: PreviewNameStatus.RELEASED, projectId: null, heldUntil: null, releasedAt: now, availableAt: new Date(now.getTime() + QUARANTINE_MS), releaseReason: reason },
  });
  await audit(tx, { workspaceId: row.workspaceId, actor, action: "preview_name.released", subject: { type: "preview_name", id: row.id }, detail: { name: row.name, reason, projectId: row.projectId } });
  return ended;
}

async function changesInWindow(tx: Tx, workspaceId: string, projectId: string, now: Date) {
  return tx.auditLog.count({
    where: { workspaceId, action: "preview_name.released", actorType: "USER", detail: { path: ["projectId"], equals: projectId }, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 3600_000) } },
  });
}

/**
 * Claims, or changes to, `name` as the project's custom URL. Needs an active 7-Day Pass on the project. Changing
 * releases the previous name into quarantine and stops its live preview; at most CHANGES_PER_30_DAYS per project.
 */
export async function claimName(userId: string, projectId: string, input: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  const plan = await getProjectPlan(project, userId);
  if (!plan.pass) throw new NameError("plan_required", "Custom URLs come with the 7-Day Pass ($5 for 7 days).");
  const format = checkNameFormat(input);
  if (!format.ok) throw new NameError("invalid", format.reason);
  const now = new Date();

  const ended: { id: string; gatewayId: string | null }[] = [];
  const claimed = await prisma.$transaction(async (tx) => {
    await lockProjectNames(tx, project.id);
    const existing = await currentName(project.id, tx);
    if (existing?.name === format.name) {
      if (existing.status === PreviewNameStatus.ACTIVE) return existing;
      const row = await tx.previewName.update({ where: { id: existing.id }, data: { status: PreviewNameStatus.ACTIVE, heldUntil: null, claimedAt: now } });
      await audit(tx, { workspaceId: project.workspaceId, actor: { type: "USER", id: userId }, action: "preview_name.claimed", subject: { type: "preview_name", id: row.id }, detail: { name: row.name, projectId: project.id } });
      return row;
    }
    if (existing?.status === PreviewNameStatus.ACTIVE) {
      if ((await changesInWindow(tx, project.workspaceId, project.id, now)) >= CHANGES_PER_30_DAYS) {
        throw new NameError("too_many_changes", `You can change a project's custom URL ${CHANGES_PER_30_DAYS} times in 30 days. Keep the current one for now.`);
      }
      ended.push(...(await release(tx, existing, { type: "USER", id: userId }, "Changed to another name", now)));
    } else if (existing) {
      // An earlier checkout hold for another name: let it go now.
      await tx.previewName.update({ where: { id: existing.id }, data: { status: PreviewNameStatus.RELEASED, projectId: null, heldUntil: null, releasedAt: now, availableAt: now, releaseReason: "Replaced by another name" } });
    }
    const row = await take(tx, project.workspaceId, format.name, { status: PreviewNameStatus.ACTIVE, projectId: project.id, heldUntil: null, userId }, now);
    await audit(tx, { workspaceId: project.workspaceId, actor: { type: "USER", id: userId }, action: "preview_name.claimed", subject: { type: "preview_name", id: row.id }, detail: { name: row.name, projectId: project.id } });
    return row;
  });
  await Promise.all(ended.map((s) => terminateOnGateway(s.id, s.gatewayId)));
  log("info", "custom preview name claimed", { workspaceId: project.workspaceId, projectId: project.id });
  return claimed;
}

/** Releases the project's custom URL. `confirm` must repeat the name (typed confirmation in the dashboard). */
export async function releaseName(userId: string, projectId: string, confirm: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  const row = await prisma.previewName.findFirst({ where: { projectId: project.id, status: PreviewNameStatus.ACTIVE } });
  if (!row) throw new NameError("not_found", "This project has no custom URL.");
  if (confirm.trim().toLowerCase() !== row.name) throw new NameError("confirm_mismatch", `Type ${row.name} to confirm.`);
  const ended = await prisma.$transaction(async (tx) => {
    await lockName(tx, row.name);
    return release(tx, row, { type: "USER", id: userId }, "Released by the workspace", new Date());
  });
  await Promise.all(ended.map((s) => terminateOnGateway(s.id, s.gatewayId)));
}

/**
 * Reserves a name for a project's checkout for HOLD_MS, so nobody takes it while the payment is made. A project that
 * already has a custom URL keeps it (renewals don't change the URL).
 */
export async function holdName(tx: Tx, input: { userId: string; workspaceId: string; projectId: string; name: string; now?: Date }) {
  const now = input.now ?? new Date();
  const format = checkNameFormat(input.name);
  if (!format.ok) throw new NameError("invalid", format.reason);
  await lockProjectNames(tx, input.projectId);
  const existing = await currentName(input.projectId, tx);
  if (existing?.status === PreviewNameStatus.ACTIVE) return existing;
  if (existing && existing.name !== format.name) {
    await tx.previewName.update({ where: { id: existing.id }, data: { status: PreviewNameStatus.RELEASED, projectId: null, heldUntil: null, releasedAt: now, availableAt: now, releaseReason: "Checkout hold replaced" } });
  }
  const heldUntil = new Date(now.getTime() + HOLD_MS);
  const row = await take(tx, input.workspaceId, format.name, { status: PreviewNameStatus.HELD, projectId: input.projectId, heldUntil, userId: input.userId }, now);
  await audit(tx, { workspaceId: input.workspaceId, actor: { type: "USER", id: input.userId }, action: "preview_name.held", subject: { type: "preview_name", id: row.id }, detail: { name: row.name, projectId: input.projectId, heldUntil: heldUntil.toISOString() } });
  return row;
}

/**
 * When a pass activates: the name held at checkout becomes the project's URL — if it's still this project's hold, or
 * free again. If someone else took it after the hold expired (a very late payment), the project simply has no custom
 * URL yet and the owner picks another. A project that already has one keeps it.
 */
export async function activateHeldName(tx: Tx, input: { projectId: string; workspaceId: string; name: string; actor: AuditActor; now: Date }) {
  await lockProjectNames(tx, input.projectId);
  const existing = await currentName(input.projectId, tx);
  if (existing?.status === PreviewNameStatus.ACTIVE) return existing.name;
  try {
    const row = await take(tx, input.workspaceId, input.name, { status: PreviewNameStatus.ACTIVE, projectId: input.projectId, heldUntil: null, userId: input.actor.id ?? null }, input.now);
    await audit(tx, { workspaceId: input.workspaceId, actor: input.actor, action: "preview_name.claimed", subject: { type: "preview_name", id: row.id }, detail: { name: row.name, projectId: input.projectId } });
    return row.name;
  } catch (error) {
    if (error instanceof NameError) {
      log("warn", "held name no longer available at activation", { projectId: input.projectId });
      return null;
    }
    throw error;
  }
}

/** Expired checkout holds become claimable again (sweep; idempotent). */
export async function expireHolds(now = new Date()) {
  const expired = await prisma.previewName.findMany({ where: { status: PreviewNameStatus.HELD, heldUntil: { lt: now } }, select: { id: true, name: true, workspaceId: true }, take: 500 });
  for (const row of expired) {
    await prisma.$transaction(async (tx) => {
      await lockName(tx, row.name);
      const { count } = await tx.previewName.updateMany({
        where: { id: row.id, status: PreviewNameStatus.HELD, heldUntil: { lt: now } },
        data: { status: PreviewNameStatus.RELEASED, projectId: null, heldUntil: null, releasedAt: now, availableAt: now, releaseReason: "Checkout hold expired" },
      });
      if (count) await audit(tx, { workspaceId: row.workspaceId, actor: { type: "SYSTEM" }, action: "preview_name.hold_expired", subject: { type: "preview_name", id: row.id }, detail: { name: row.name } });
    });
  }
  return expired.length;
}

/** Releases custom URLs whose project's pass ended more than the grace period ago (sweep; idempotent). */
export async function releaseLapsedNames(now = new Date()) {
  const cutoff = new Date(now.getTime() - NAME_GRACE_MS);
  const lapsed = await prisma.previewName.findMany({
    where: { status: PreviewNameStatus.ACTIVE, project: { passes: { none: { status: "ACTIVE", endsAt: { gt: cutoff } } } } },
    select: { id: true, name: true, workspaceId: true, projectId: true },
    take: 200,
  });
  for (const row of lapsed) {
    const ended = await prisma.$transaction(async (tx) => {
      await lockName(tx, row.name);
      const still = await tx.previewName.findFirst({ where: { id: row.id, status: PreviewNameStatus.ACTIVE } });
      return still ? release(tx, still, { type: "SYSTEM" }, "7-Day Pass ended", now) : [];
    });
    await Promise.all(ended.map((s) => terminateOnGateway(s.id, s.gatewayId)));
  }
  return lapsed.length;
}

/** The project's custom URL for the dashboard. */
export async function getProjectName(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  const [row, plan] = await Promise.all([prisma.previewName.findFirst({ where: { projectId: project.id, status: PreviewNameStatus.ACTIVE } }), getProjectPlan(project, userId)]);
  const config = getTunnelConfig();
  return {
    name: row?.name ?? null,
    url: row && config ? previewUrl(config, row.name) : null,
    claimedAt: row?.claimedAt ?? null,
    canUse: plan.pass !== null,
    /** While the pass is over but the name is still reserved: renew before this to keep it. */
    graceUntil: !plan.pass && row && plan.lastPassEndedAt ? new Date(plan.lastPassEndedAt.getTime() + NAME_GRACE_MS) : null,
    previewDomain: config?.previewDomain ?? null,
  };
}

/**
 * What a gateway should show for a custom name with no tunnel: "offline" (reserved, nothing connected), "expired"
 * (its last preview's time ran out) or "unknown" (not a reserved name: not found).
 */
export async function labelState(label: string): Promise<"offline" | "expired" | "unknown"> {
  const format = checkNameFormat(label);
  if (!format.ok) return "unknown";
  const row = await prisma.previewName.findUnique({ where: { name: format.name }, select: { status: true } });
  if (!row || row.status !== PreviewNameStatus.ACTIVE) return "unknown";
  const last = await prisma.tunnelSession.findFirst({ where: { customName: format.name }, orderBy: { createdAt: "desc" }, select: { status: true, endReason: true } });
  if (last && last.status === "EXPIRED" && last.endReason === TIME_UP_REASON) return "expired";
  return "offline";
}
