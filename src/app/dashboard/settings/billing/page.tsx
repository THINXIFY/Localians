import type { Metadata } from "next";
import { BillingProjects } from "@/components/app/plans/BillingProjects";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/plans";
import { getTunnelConfig } from "@/server/cli/config";
import { prisma } from "@/server/db";
import { getSharePlans } from "@/server/plan-summaries";
import { requireUser } from "@/server/session";
import { paymentInfo } from "@/server/upgrades";
import { getCurrentWorkspace } from "@/server/workspaces";

export const metadata: Metadata = { title: "Billing" };

/** Plans per project (Free / 7-Day Pass) and the workspace's 7-Day Pass orders. */
export default async function BillingPage() {
  const session = await requireUser();
  const workspace = await getCurrentWorkspace(session.user.id);
  const [projects, plans, orders] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, defaultPort: true, previewName: { select: { name: true, status: true } } },
    }),
    getSharePlans(session.user.id),
    prisma.upgradeRequest.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { orderId: true, projectName: true, amountMicros: true, currency: true, status: true, createdAt: true, txHash: true },
    }),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="billing-plans" className="flex flex-col gap-3">
        <div>
          <h2 id="billing-plans" className="text-[17px] font-semibold text-fg">
            Plans
          </h2>
          <p className="mt-1 text-[13.5px] text-fg-2">Every project gets one free 24-hour preview. The 7-Day Pass ($5 one-time) adds 7 days and a custom URL.</p>
        </div>
        <BillingProjects
          projects={projects.map((p) => ({ id: p.id, name: p.name, port: p.defaultPort, hasCustomName: p.previewName?.status === "ACTIVE", plan: plans.byProject[p.id] ?? plans.newProject }))}
          payment={await paymentInfo()}
          previewDomain={getTunnelConfig()?.previewDomain ?? "preview.localians.com"}
        />
      </section>

      <section aria-labelledby="billing-orders" className="flex flex-col gap-3">
        <h2 id="billing-orders" className="text-[17px] font-semibold text-fg">
          Orders
        </h2>
        {orders.length ? (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-card">
            <table className="w-full min-w-[560px] text-left text-[13px]" data-testid="orders-table">
              <thead className="border-b border-line text-[12px] text-fg-3">
                <tr>
                  {["Order ID", "Project", "Amount", "Status", "Date"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.orderId}>
                    <td className="px-4 py-3 font-mono text-fg">{o.orderId}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-fg-2">{o.projectName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-2">
                      {Number(o.amountMicros) / 1_000_000} {o.currency}
                    </td>
                    <td className="px-4 py-3 text-fg">{ORDER_STATUS_LABEL[o.status]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-3">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-[13.5px] text-fg-3">No orders yet.</p>
        )}
      </section>
    </div>
  );
}
