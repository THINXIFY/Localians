"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import { isOpenRequest, ORDER_STATUS_LABEL, type PaymentInfo, type PlanSummary } from "@/lib/plans";
import { UpgradeDialog } from "./UpgradeDialog";

type Row = { id: string; name: string; port: number | null; hasCustomName: boolean; plan: PlanSummary };

/** One line per project: where it stands (free / pass / order) and the Upgrade / Renew action. */
export function BillingProjects({ projects, payment, previewDomain }: { projects: Row[]; payment: PaymentInfo; previewDomain: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!projects.length) return <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-[13.5px] text-fg-3">No projects yet. Share an app to create one.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-card" data-testid="billing-projects">
      {projects.map((p) => {
        const plan = p.plan;
        const request = isOpenRequest(plan.request) ? plan.request : null;
        const state = plan.pass
          ? `Preview Pass · until ${formatDateTime(new Date(plan.pass.endsAt))}`
          : request
            ? `Order ${request.orderId} · ${ORDER_STATUS_LABEL[request.status]}`
            : plan.free.state === "active"
              ? `Free preview · ends ${formatDateTime(new Date(plan.free.endsAt))}`
              : plan.free.state === "used"
                ? "Free preview used"
                : plan.free.state === "limit_reached"
                  ? "Free limit reached"
                  : "Free preview available";
        return (
          <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="billing-project">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-medium text-fg">{p.name}</p>
              <p className="text-[12.5px] text-fg-3">
                {p.port ? `localhost:${p.port} · ` : ""}
                <span className={plan.pass ? "text-accent-ink" : undefined}>{state}</span>
              </p>
            </div>
            <Button size="sm" variant={plan.pass ? "secondary" : "primary"} className="h-9 shrink-0" onClick={() => setOpenId(p.id)}>
              {!plan.pass && !request ? <Sparkles className="size-3.5" aria-hidden="true" /> : null}
              {request ? "View payment details" : plan.pass || plan.graceUntil ? "Renew Pass" : payment.enabled ? `Upgrade for ${payment.offer.priceLabel}` : `${payment.offer.shortName} · Coming soon`}
            </Button>
            <UpgradeDialog open={openId === p.id} onClose={() => setOpenId(null)} project={{ id: p.id, name: p.name }} plan={plan} payment={payment} previewDomain={previewDomain} hasCustomName={p.hasCustomName} />
          </li>
        );
      })}
    </ul>
  );
}
