import "server-only";
import { makeOffer } from "@/lib/offer";
import { AdminInputError, targetUser, type AdminUser } from "./admin";
import { audit } from "./audit";
import { customNamesRouting, siteUrl } from "./cli/config";
import { prisma } from "./db";
import { sendEmail } from "./email/send";
import { passGrantedMessage, passRevokedMessage } from "./email/templates";
import { log } from "./log";
import { grantPassInTx, notifyGateways, revokePass } from "./passes";
import { getPassOffer } from "./payment-settings";
import { approveRequest, UpgradeError } from "./upgrades";

/**
 * Manage Plan (/admin/users/[publicId]): an administrator upgrades, renews or revokes the Preview Pass of ONE project
 * of a customer. Every path goes through the shared entitlement service (passes.ts), so the dashboard, CLI, VS Code,
 * API and gateways see the same plan, and live previews are extended or cut back right away.
 *
 *   Verified payment       — activates an existing order that passed the server-side BSC check (approveRequest)
 *   Complimentary access   — a pass with no order and no payment record, labelled as such
 *   Support adjustment     — the same, with a mandatory explanation
 *
 * Grants are idempotent per click (a key generated when the dialog opens), renewals start when the current pass ends,
 * and every action is audited with the acting admin and the reason.
 */
export type GrantReason = "VERIFIED_PAYMENT" | "COMPLIMENTARY" | "SUPPORT_ADJUSTMENT";
export const GRANT_REASONS: GrantReason[] = ["VERIFIED_PAYMENT", "COMPLIMENTARY", "SUPPORT_ADJUSTMENT"];
export const SUPPORT_NOTE_MIN = 10;

const GRANT_KEY = /^[A-Za-z0-9-]{16,64}$/;
/** Same freshness rule as approveRequest: older checks must be re-run on the order page first. */
const VERIFICATION_FRESH_MS = 24 * 3600_000;
const OPEN = ["PENDING", "UNDER_REVIEW"] as const;
const dashboardUrl = (projectId: string) => `${siteUrl()}/dashboard/projects/${projectId}#plan`;

/** The customer's projects with their current and upcoming passes, payment history and the orders that can activate. */
export async function getPlanManagement(userId: string) {
  const now = new Date();
  const [projects, orders, offer] = await Promise.all([
    prisma.project.findMany({
      where: { workspace: { members: { some: { userId } } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        status: true,
        freeGrant: { select: { endsAt: true } },
        previewName: { select: { name: true, status: true } },
        passes: {
          where: { status: "ACTIVE", endsAt: { gt: now } },
          orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, endsAt: true, source: true, grantReason: true, grantNote: true, createdAt: true, request: { select: { orderId: true } } },
        },
      },
    }),
    prisma.upgradeRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { orderId: true, projectId: true, projectName: true, status: true, amountMicros: true, passDays: true, txHash: true, verifiedOk: true, verifiedAt: true, createdAt: true, reviewedAt: true },
    }),
    getPassOffer(),
  ]);
  return {
    offer: { name: offer.name, days: offer.days },
    customNames: customNamesRouting(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      archived: p.status !== "ACTIVE",
      customUrl: p.previewName?.status === "ACTIVE" ? p.previewName.name : null,
      freeState: p.freeGrant ? (p.freeGrant.endsAt > now ? "active" : "used") : "available",
      paid: p.passes.some((x) => x.startsAt <= now),
      paidUntil: p.passes.length ? p.passes[p.passes.length - 1].endsAt : null,
      passes: p.passes.map((x) => ({
        id: x.id,
        startsAt: x.startsAt,
        endsAt: x.endsAt,
        current: x.startsAt <= now,
        reason: x.source === "PAYMENT" ? ("VERIFIED_PAYMENT" as const) : x.grantReason,
        orderId: x.request?.orderId ?? null,
        note: x.grantNote,
      })),
    })),
    orders: orders.map((o) => ({
      orderId: o.orderId,
      projectId: o.projectId,
      projectName: o.projectName,
      status: o.status,
      amount: makeOffer(o.amountMicros, o.passDays).usdtLabel,
      passName: makeOffer(o.amountMicros, o.passDays).name,
      days: o.passDays,
      txHash: o.txHash,
      createdAt: o.createdAt,
      reviewedAt: o.reviewedAt,
      /** Can be activated from Manage Plan: still open, and a passing on-chain check from the last 24 hours. */
      activatable: !!o.projectId && !!o.txHash && o.verifiedOk && !!o.verifiedAt && now.getTime() - o.verifiedAt.getTime() <= VERIFICATION_FRESH_MS && OPEN.includes(o.status as (typeof OPEN)[number]),
    })),
  };
}
export type PlanManagement = Awaited<ReturnType<typeof getPlanManagement>>;

/** The customer (an active, non-admin account) and one of their own, non-archived projects. */
async function customerProject(admin: AdminUser, userId: string, projectId: string) {
  const user = await targetUser(userId, admin);
  if (user.status !== "ACTIVE") throw new AdminInputError("Reactivate this account before changing its plan.");
  const project = await prisma.project.findFirst({ where: { id: projectId, workspace: { members: { some: { userId: user.id } } } }, select: { id: true, name: true, status: true, workspaceId: true } });
  if (!project) throw new AdminInputError("That project doesn't belong to this user.");
  if (project.status !== "ACTIVE") throw new AdminInputError("This project is archived. The customer must restore it first.");
  return { user, project };
}

export type GrantResult = { passId: string; startsAt: Date; endsAt: Date; renewal: boolean; duplicate: boolean };

/** Upgrade or renew one project. Renewing while a pass runs adds the new period after it (no time is lost). */
export async function adminGrantPass(admin: AdminUser, input: { userId: string; projectId: string; reason: string; orderId?: string | null; note?: string | null; key: string }): Promise<GrantResult> {
  const reason = input.reason as GrantReason;
  if (!GRANT_REASONS.includes(reason)) throw new AdminInputError("Choose a reason.");
  const key = String(input.key ?? "");
  if (!GRANT_KEY.test(key)) throw new AdminInputError("Reload the page and try again.");
  const note = String(input.note ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
  const { user, project } = await customerProject(admin, input.userId, input.projectId);
  const actor = { type: "ADMIN" as const, id: admin.id };

  if (reason === "VERIFIED_PAYMENT") {
    const orderId = String(input.orderId ?? "").trim().toUpperCase();
    const order = orderId ? await prisma.upgradeRequest.findUnique({ where: { orderId }, include: { pass: true } }) : null;
    if (!order || order.userId !== user.id || order.projectId !== project.id) throw new AdminInputError("Choose a verified order for this project.");
    // A repeated click after the first one approved it: report the same pass, don't grant again.
    if (order.status === "APPROVED" && order.pass) return { passId: order.pass.id, startsAt: order.pass.startsAt, endsAt: order.pass.endsAt, renewal: false, duplicate: true };
    if (!order.txHash || !order.verifiedOk) throw new AdminInputError("This order hasn't passed the on-chain check. Open the order and run “Verify on BSC” first.");
    try {
      const before = Date.now();
      const pass = await approveRequest(admin, orderId);
      await audit(prisma, { workspaceId: project.workspaceId, actor, action: "plan.upgraded", subject: { type: "preview_pass", id: pass.id }, detail: { userId: user.id, projectId: project.id, reason, orderId } });
      return { passId: pass.id, startsAt: pass.startsAt, endsAt: pass.endsAt, renewal: pass.startsAt.getTime() > before + 1000, duplicate: false };
    } catch (error) {
      if (error instanceof UpgradeError && error.code === "state") {
        // A concurrent click approved it first.
        const done = await prisma.previewPass.findUnique({ where: { requestId: order.id } });
        if (done) return { passId: done.id, startsAt: done.startsAt, endsAt: done.endsAt, renewal: false, duplicate: true };
      }
      if (error instanceof UpgradeError) throw new AdminInputError(error.message);
      throw error;
    }
  }

  if (reason === "SUPPORT_ADJUSTMENT" && note.length < SUPPORT_NOTE_MIN) throw new AdminInputError(`Explain the support adjustment (at least ${SUPPORT_NOTE_MIN} characters).`);
  const offer = await getPassOffer();
  const now = new Date();
  const outcome = await prisma.$transaction(async (tx) => {
    const result = await grantPassInTx(tx, { projectId: project.id, source: "ADMIN", days: offer.days, actor, now, grant: { reason, note: note || null, key } });
    if (!result.existing) {
      await audit(tx, {
        workspaceId: project.workspaceId,
        actor,
        action: "plan.upgraded",
        subject: { type: "preview_pass", id: result.pass.id },
        detail: { userId: user.id, projectId: project.id, reason, note: note || null, days: offer.days, startsAt: result.pass.startsAt.toISOString(), endsAt: result.pass.endsAt.toISOString() },
      });
    }
    return result;
  });
  if (outcome.existing) return { passId: outcome.pass.id, startsAt: outcome.pass.startsAt, endsAt: outcome.pass.endsAt, renewal: outcome.pass.startsAt > outcome.pass.createdAt, duplicate: true };
  await notifyGateways(project.id, outcome.work);
  const customer = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, name: true } });
  await sendEmail(
    passGrantedMessage({
      to: customer.email,
      name: customer.name,
      projectName: project.name,
      passName: offer.name,
      startsAt: outcome.pass.startsAt,
      endsAt: outcome.pass.endsAt,
      complimentary: reason === "COMPLIMENTARY",
      url: dashboardUrl(project.id),
    }),
  ).catch((error) => log("error", "pass granted email failed", { error: error instanceof Error ? error.message : "unknown" }));
  log("info", "admin granted preview pass", { projectId: project.id, passId: outcome.pass.id, reason });
  return { passId: outcome.pass.id, startsAt: outcome.pass.startsAt, endsAt: outcome.pass.endsAt, renewal: outcome.pass.startsAt > now, duplicate: false };
}

/** Revoke one pass of one of the customer's projects. Later passes move up; live previews are cut back or ended. */
export async function adminRevokePass(admin: AdminUser, input: { userId: string; passId: string; reason: string }) {
  const reason = String(input.reason ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (reason.length < 3) throw new AdminInputError("Give a short reason (the customer sees it).");
  const user = await targetUser(input.userId, admin);
  const pass = await prisma.previewPass.findFirst({
    where: { id: String(input.passId), project: { workspace: { members: { some: { userId: user.id } } } } },
    select: { id: true, status: true, projectId: true, workspaceId: true, project: { select: { name: true } } },
  });
  if (!pass) throw new AdminInputError("That pass doesn't belong to this user.");
  const { revoked } = await revokePass(pass.id, { reason, actor: { type: "ADMIN", id: admin.id } });
  if (!revoked) return { revoked: false };
  await audit(prisma, { workspaceId: pass.workspaceId, actor: { type: "ADMIN", id: admin.id }, action: "plan.revoked", subject: { type: "preview_pass", id: pass.id }, detail: { userId: user.id, projectId: pass.projectId, reason } });
  const customer = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, name: true } });
  await sendEmail(passRevokedMessage({ to: customer.email, name: customer.name, projectName: pass.project.name, reason, url: dashboardUrl(pass.projectId) })).catch(() => undefined);
  return { revoked: true };
}
