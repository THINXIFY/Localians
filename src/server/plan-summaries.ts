import "server-only";
import { orderPayTo } from "./upgrades";
import type { PlanSummary } from "@/lib/plans";
import { prisma } from "./db";
import { paymentsEnabled } from "./payment-settings";
import { freePreviewsPer30Days, getProjectPlan, NAME_GRACE_MS } from "./plans";
import { getCurrentWorkspace } from "./workspaces";

/** Plan state of one project for the dashboard (dates as ISO strings, safe to send to the browser). */
export async function planSummary(project: { id: string; workspaceId: string }, userId: string): Promise<PlanSummary> {
  const [plan, request, enabled] = await Promise.all([
    getProjectPlan(project, userId),
    prisma.upgradeRequest.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, select: { orderId: true, status: true, txHash: true, reviewNote: true, recipient: true, qrImageId: true } }),
    paymentsEnabled(),
  ]);
  const open = request?.status === "PENDING" || request?.status === "UNDER_REVIEW";
  const f = plan.free;
  return {
    free:
      f.state === "available"
        ? { state: "available" }
        : f.state === "active"
          ? { state: "active", endsAt: f.endsAt.toISOString() }
          : f.state === "used"
            ? { state: "used", endedAt: f.endsAt.toISOString() }
            : { state: "limit_reached", resetsAt: f.resetsAt.toISOString() },
    pass: plan.passEndsAt ? { endsAt: plan.passEndsAt.toISOString() } : null,
    graceUntil: !plan.pass && plan.lastPassEndedAt ? new Date(plan.lastPassEndedAt.getTime() + NAME_GRACE_MS).toISOString() : null,
    request: request ? { orderId: request.orderId, status: request.status, txHash: request.txHash, note: request.reviewNote, payTo: open ? orderPayTo(request, enabled) : null } : null,
    canShare: plan.share.tier !== null,
    freeLimit: freePreviewsPer30Days(),
  };
}

/** Plan state for every active project in the user's workspace, plus what a brand-new project would get. */
export async function getSharePlans(userId: string) {
  const workspace = await getCurrentWorkspace(userId);
  const projects = await prisma.project.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE" }, select: { id: true, workspaceId: true }, take: 200 });
  const entries = await Promise.all(projects.map(async (p) => [p.id, await planSummary(p, userId)] as const));
  // A new project starts with an unused free window — unless the workspace/user allowance is used up.
  const probe = await getProjectPlan({ id: "__new__", workspaceId: workspace.id }, userId);
  const newProject: PlanSummary = {
    free: probe.free.state === "limit_reached" ? { state: "limit_reached", resetsAt: probe.free.resetsAt.toISOString() } : { state: "available" },
    pass: null,
    graceUntil: null,
    request: null,
    canShare: probe.free.state !== "limit_reached",
    freeLimit: freePreviewsPer30Days(),
  };
  return { byProject: Object.fromEntries(entries) as Record<string, PlanSummary>, newProject };
}
