import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-fg sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-[14px] text-fg-3">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-card", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[14.5px] font-semibold text-fg">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const TONES = {
  live: "border-accent/30 bg-accent/10 text-accent-ink",
  warn: "border-warn/30 bg-warn/10 text-warn",
  bad: "border-danger/30 bg-danger/10 text-danger",
  off: "border-line-strong bg-tint/[0.04] text-fg-2",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2 text-[11.5px] font-medium", TONES[tone])}>{children}</span>;
}

export const statusTone = (status: string): keyof typeof TONES =>
  status === "ACTIVE" || status === "APPROVED" ? "live" : status === "SUSPENDED" || status === "UNDER_REVIEW" || status === "PENDING" ? "warn" : status === "REJECTED" ? "bad" : "off";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-[13.5px] text-fg-3">{children}</p>;
}

export const fmtDate = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export const statusLabel = (s: string) => ({ PENDING: "Pending", UNDER_REVIEW: "Under review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" })[s] ?? s;
