import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit, type AuditActor } from "./audit";
import { policyFor } from "./access";
import { pushPolicyToGateway, terminateOnGateway } from "./cli/gateway-control";
import { ACTIVE_STATES, endSession } from "./cli/lifecycle";
import { TunnelEventType } from "@/generated/prisma/enums";
import { prisma } from "./db";
import { log } from "./log";
import { lockProject, PASS_MS, passWindow } from "./plans";
import { activateHeldName } from "./preview-names";

type Tx = Prisma.TransactionClient;
type GatewayWork = { push: { id: string; gatewayId: string | null; expiresAt: Date }[]; end: { id: string; gatewayId: string | null }[] };

/**
 * Brings the project's live previews in line with its paid period: previews that run "until the plan ends" follow it
 * (renewal → later), and nothing outlives the plan (revocation → earlier, or ended now). Gateways are told after commit.
 */
async function realignLiveSessions(tx: Tx, project: { id: string; workspaceId: string }, end: Date | null, now: Date): Promise<GatewayWork> {
  const live = await tx.tunnelSession.findMany({
    where: { projectId: project.id, status: { in: ACTIVE_STATES } },
    select: { id: true, gatewayId: true, expiresAt: true, untilPlanEnd: true, planTier: true, createdAt: true, durationMinutes: true },
  });
  const work: GatewayWork = { push: [], end: [] };
  for (const s of live) {
    let next = s.expiresAt;
    if (end && s.untilPlanEnd) next = end;
    else if (end && s.durationMinutes) next = new Date(Math.min(s.createdAt.getTime() + s.durationMinutes * 60_000, end.getTime()));
    if (s.planTier === "PASS" && (!end || s.expiresAt > end)) next = end && end > now ? end : now;
    if (next.getTime() === s.expiresAt.getTime()) continue;
    if (next <= now) {
      await endSession(tx, { id: s.id, workspaceId: project.workspaceId }, { status: "EXPIRED", reason: "The Preview Pass was cancelled", event: TunnelEventType.EXPIRED, now });
      work.end.push(s);
    } else {
      await tx.tunnelSession.update({ where: { id: s.id }, data: { expiresAt: next, ...(end ? { planTier: "PASS" } : {}) } });
      work.push.push({ id: s.id, gatewayId: s.gatewayId, expiresAt: next });
    }
  }
  return work;
}

export async function notifyGateways(projectId: string, work: GatewayWork) {
  if (!work.push.length && !work.end.length) return;
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { accessMode: true, accessVersion: true, accessTtlMinutes: true } });
  await Promise.all([...work.push.map((s) => pushPolicyToGateway(s.id, s.gatewayId, policyFor(project, s))), ...work.end.map((s) => terminateOnGateway(s.id, s.gatewayId))]);
}

/**
 * Adds a 7-Day Pass to a project inside the caller's transaction. Renewing while a pass is active starts the new one
 * when the current period ends, so no paid time is lost. Live previews that run until the plan ends are extended,
 * and a custom name held for the order becomes the project's URL. Idempotent per order (unique requestId).
 */
export async function grantPassInTx(
  tx: Tx,
  input: {
    projectId: string;
    source: "PAYMENT" | "ADMIN";
    requestId?: string | null;
    requestedName?: string | null;
    actor: AuditActor;
    now?: Date;
    /** Pass length (the order's snapshot); 7 when not given. */
    days?: number;
    /** An admin grant without payment (Manage Plan): idempotent per key, like requestId is per order. */
    grant?: { reason: "COMPLIMENTARY" | "SUPPORT_ADJUSTMENT"; note: string | null; key: string };
  },
) {
  const now = input.now ?? new Date();
  await lockProject(tx, input.projectId);
  const project = await tx.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { id: true, workspaceId: true } });
  const none = { push: [], end: [] } as GatewayWork;
  if (input.requestId) {
    const existing = await tx.previewPass.findUnique({ where: { requestId: input.requestId } });
    if (existing) return { pass: existing, work: none, name: null, existing: true };
  }
  if (input.grant) {
    // Checked under the project lock, so a repeated or concurrent click with the same key finds the first pass.
    const existing = await tx.previewPass.findUnique({ where: { grantKey: input.grant.key } });
    if (existing && existing.projectId !== project.id) throw new Error("Grant key reused for another project");
    if (existing) return { pass: existing, work: none, name: null, existing: true };
  }
  const window = await passWindow(tx, project.id, now);
  const startsAt = window.end && window.end > now ? window.end : now;
  const pass = await tx.previewPass.create({
    data: {
      projectId: project.id,
      workspaceId: project.workspaceId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + (input.days ? input.days * 86_400_000 : PASS_MS)),
      source: input.source,
      requestId: input.requestId ?? null,
      createdById: input.actor.id ?? null,
      ...(input.grant ? { grantReason: input.grant.reason, grantNote: input.grant.note, grantKey: input.grant.key } : {}),
    },
  });
  await audit(tx, {
    workspaceId: project.workspaceId,
    actor: input.actor,
    action: startsAt > now ? "pass.renewed" : "pass.activated",
    subject: { type: "preview_pass", id: pass.id },
    detail: { projectId: project.id, startsAt: pass.startsAt.toISOString(), endsAt: pass.endsAt.toISOString(), source: input.source, requestId: input.requestId ?? null, grantReason: input.grant?.reason ?? null },
  });
  const work = await realignLiveSessions(tx, project, pass.endsAt, now);
  const name = input.requestedName ? await activateHeldName(tx, { projectId: project.id, workspaceId: project.workspaceId, name: input.requestedName, actor: input.actor, now }) : null;
  return { pass, work, name, existing: false };
}

/** Operator grant (support, compensation). Also used by tests. */
export async function grantPass(input: { projectId: string; source: "PAYMENT" | "ADMIN"; requestId?: string | null; requestedName?: string | null; actor: AuditActor }) {
  const result = await prisma.$transaction((tx) => grantPassInTx(tx, input));
  await notifyGateways(input.projectId, result.work);
  log("info", "preview pass granted", { projectId: input.projectId, passId: result.pass.id, source: input.source });
  return result;
}

/**
 * Revokes a pass (refund, chargeback-like dispute, fraud). Later passes of the project move up so paid time stays
 * contiguous, and live previews are cut back to what remains (or end now).
 */
export async function revokePass(passId: string, input: { reason: string; actor: AuditActor }) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const pass = await tx.previewPass.findUniqueOrThrow({ where: { id: passId } });
    await lockProject(tx, pass.projectId);
    if (pass.status === "REVOKED") return { work: { push: [], end: [] } as GatewayWork, projectId: pass.projectId, revoked: false };
    await tx.previewPass.update({ where: { id: pass.id }, data: { status: "REVOKED", revokedAt: now, revokeReason: input.reason.slice(0, 200) } });
    // Close the gap: later passes shift earlier by the revoked pass's remaining time.
    const removed = Math.max(0, pass.endsAt.getTime() - Math.max(pass.startsAt.getTime(), now.getTime()));
    if (removed) {
      const later = await tx.previewPass.findMany({ where: { projectId: pass.projectId, status: "ACTIVE", startsAt: { gte: pass.endsAt } } });
      for (const p of later) {
        const startsAt = new Date(Math.max(now.getTime(), p.startsAt.getTime() - removed));
        await tx.previewPass.update({ where: { id: p.id }, data: { startsAt, endsAt: new Date(startsAt.getTime() + (p.endsAt.getTime() - p.startsAt.getTime())) } });
      }
    }
    await audit(tx, { workspaceId: pass.workspaceId, actor: input.actor, action: "pass.revoked", subject: { type: "preview_pass", id: pass.id }, detail: { reason: input.reason.slice(0, 200) } });
    const window = await passWindow(tx, pass.projectId, now);
    const project = { id: pass.projectId, workspaceId: pass.workspaceId };
    return { work: await realignLiveSessions(tx, project, window.end, now), projectId: pass.projectId, revoked: true };
  });
  await notifyGateways(result.projectId, result.work);
  /** False when the pass was already revoked (nothing changed). */
  return { revoked: result.revoked };
}
