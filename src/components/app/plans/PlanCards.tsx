"use client";

import { Check, Clock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { isOpenRequest, ORDER_STATUS_LABEL, type PaymentInfo, type PlanSummary } from "@/lib/plans";
import { formatRemaining } from "@tunnel/shared/durations";
import { UpgradeDialog } from "./UpgradeDialog";

/** Ticks once a minute (and once after hydration, so server and client render the same first). */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const left = (iso: string, now: number | null) => (now === null ? "" : formatRemaining(new Date(iso).getTime() - now));

/**
 * The two ways to share a project: its one free 24-hour preview, and the $5 7-Day Pass. Shows where the project
 * stands on each (time left, used, order status, active until) and the Upgrade / Renew action.
 */
export function PlanCards({
  plan,
  project,
  payment,
  previewDomain,
  hasCustomName,
  className,
}: {
  plan: PlanSummary;
  /** null while creating a new project (the pass can be bought once it exists). */
  project: { id: string; name: string } | null;
  payment: PaymentInfo;
  previewDomain: string;
  hasCustomName: boolean;
  className?: string;
}) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const free = plan.free;
  const passActive = Boolean(plan.pass);
  const request = isOpenRequest(plan.request) ? plan.request : null;
  const freeOver = free.state === "used" || free.state === "limit_reached";

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)} data-testid="plan-cards">
      {/* ------------------------------------------------------------------ Free */}
      <section
        aria-labelledby="plan-free"
        data-testid="plan-free"
        className={cn("flex flex-col gap-2 rounded-xl border p-4", !passActive && !freeOver ? "border-accent/40 bg-accent/[0.04]" : "border-line-strong", freeOver && "opacity-80")}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 id="plan-free" className="text-[14px] font-semibold text-fg">
            Free
          </h3>
          <span className="text-[12px] text-fg-3">Up to 24 hours</span>
        </div>
        <p className="text-[13px] leading-snug text-fg-2" data-testid="plan-free-state">
          {free.state === "available" ? (
            "One free preview per project. The 24 hours start when you share."
          ) : free.state === "active" ? (
            <span className="inline-flex items-center gap-1.5 text-fg">
              <Clock className="size-3.5 text-accent-ink" aria-hidden="true" />
              <span>
                {left(free.endsAt, now)} left <span className="text-fg-3">· ends {formatDateTime(new Date(free.endsAt))}</span>
              </span>
            </span>
          ) : free.state === "used" ? (
            `This project's free preview ended ${formatDateTime(new Date(free.endedAt))}.`
          ) : (
            `You've used ${plan.freeLimit} free previews in 30 days. More from ${formatDateTime(new Date(free.resetsAt))}.`
          )}
        </p>
      </section>

      {/* ------------------------------------------------------------------ 7-Day Pass */}
      <section
        aria-labelledby="plan-pass"
        data-testid="plan-pass"
        className={cn(
          "relative flex flex-col gap-2 overflow-hidden rounded-xl border p-4",
          passActive || freeOver ? "border-accent/45 bg-[linear-gradient(160deg,rgba(184,255,59,0.09),rgba(184,255,59,0.02)_60%)]" : "border-line-strong bg-[linear-gradient(160deg,rgba(184,255,59,0.05),transparent_60%)]",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 id="plan-pass" className="flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold text-fg">
            <Sparkles className="size-3.5 text-accent-ink" aria-hidden="true" />
            7-Day Preview Pass
          </h3>
          <span className="whitespace-nowrap text-[12px] text-fg-2">
            <span className="text-[15px] font-semibold text-fg">$5</span> one-time · 7 days
          </span>
        </div>
        {passActive ? (
          <p className="inline-flex items-center gap-1.5 text-[13px] text-fg" data-testid="plan-pass-state">
            <Check className="size-3.5 text-accent-ink" aria-hidden="true" />
            Active · {left(plan.pass!.endsAt, now)} left <span className="text-fg-3">· until {formatDateTime(new Date(plan.pass!.endsAt))}</span>
          </p>
        ) : request ? (
          <p className="text-[13px] text-fg-2" data-testid="plan-pass-state">
            Order <span className="font-mono text-fg">{request.orderId}</span> · {ORDER_STATUS_LABEL[request.status]}. It activates after payment verification.
          </p>
        ) : (
          <p className="text-[13px] leading-snug text-fg-2" data-testid="plan-pass-state">
            {plan.graceUntil ? `Ended. Your custom URL is kept until ${formatDateTime(new Date(plan.graceUntil))} — renew to keep it.` : "7 more days of sharing, a custom URL, password protection."}
          </p>
        )}
        <div className="mt-auto pt-1">
          {project ? (
            <Button size="sm" variant={passActive ? "secondary" : "primary"} className="h-9" onClick={() => setOpen(true)}>
              {request ? "View payment details" : passActive || plan.graceUntil ? "Renew Pass" : payment.enabled ? "Upgrade for $5" : "7-Day Pass · Coming soon"}
            </Button>
          ) : (
            <p className="text-[12px] text-fg-3">Available once the project exists — share it once, or pick an existing project.</p>
          )}
        </div>
      </section>

      {project ? (
        <UpgradeDialog open={open} onClose={() => setOpen(false)} project={project} plan={plan} payment={payment} previewDomain={previewDomain} hasCustomName={hasCustomName} />
      ) : null}
    </div>
  );
}
