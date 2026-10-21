import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatusBadge({ status }: { status: "ACTIVE" | "ARCHIVED" }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]",
        active ? "border-accent/30 bg-accent/[0.08] text-accent-ink" : "border-line-strong bg-tint/[0.03] text-fg-3",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", active ? "bg-accent" : "bg-fg-3/60")} />
      {active ? "Active" : "Archived"}
    </span>
  );
}

export function SoonBadge({ children = "Coming soon" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line-strong bg-tint/[0.03] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-fg-3">
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-card", className)}>{children}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-xl border border-line-strong bg-tint/[0.03] text-fg-2">{icon}</span>
      ) : null}
      <h3 className="mt-4 text-[16px] font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-[42ch] text-[14px] leading-relaxed text-fg-2">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-shimmer rounded-md bg-[linear-gradient(90deg,color-mix(in_srgb,var(--tint)_4%,transparent),color-mix(in_srgb,var(--tint)_9%,transparent),color-mix(in_srgb,var(--tint)_4%,transparent))] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs}
        <h1 className="mt-1 truncate text-[26px] font-semibold tracking-[-0.03em] text-fg sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-[60ch] text-[14.5px] leading-relaxed text-fg-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function SettingsPanel({
  title,
  description,
  children,
  footer,
  tone = "default",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border bg-card", tone === "danger" ? "border-danger/30" : "border-line")}>
      <div className="p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {description ? <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{description}</p> : null}
        <div className="mt-5">{children}</div>
      </div>
      {footer ? (
        <div className="flex flex-col-reverse gap-3 rounded-b-[var(--radius-card)] border-t border-line bg-tint/[0.015] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** Label · value · optional qualifier (e.g. the time window). Use inside a <dl>. */
export function StatCard({ label, value, hint, testId }: { label: string; value: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <Card className="flex flex-col p-5">
      <dt className="text-[13px] text-fg-2">{label}</dt>
      <dd className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em] text-fg sm:text-[30px]" data-testid={testId ?? `stat-${label}`}>
        {value}
      </dd>
      {hint ? <dd className="mt-2 text-[12px] text-fg-3">{hint}</dd> : null}
    </Card>
  );
}
