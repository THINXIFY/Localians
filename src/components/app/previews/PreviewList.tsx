import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime, formatDuration, formatNumber, timeAgo } from "@/lib/format";
import { type PreviewStatusValue, shareCommand } from "@/lib/previews";
import { Command } from "../share/Command";
import { AccessBadge, PlanBadge } from "./AccessBadge";
import { Countdown } from "./Countdown";
import { PreviewActions } from "./PreviewActions";
import { PreviewStatusBadge } from "./PreviewStatusBadge";

export type PreviewListItem = {
  id: string;
  label: string;
  publicUrl: string | null;
  localPort: number;
  status: PreviewStatusValue;
  active: boolean;
  canStop: boolean;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
  endReason: string | null;
  requestCount: number;
  /** Free preview or Preview Pass (absent for sessions from before plans). */
  plan?: "FREE" | "PASS" | null;
  bytesIn: number;
  bytesOut: number;
  project: { id: string; name: string; access: "PUBLIC" | "PASSWORD" };
};

/** How long the preview has been (or was) connected. */
export function connectedFor(p: Pick<PreviewListItem, "connectedAt" | "disconnectedAt" | "lastActivityAt" | "active">, now: number) {
  if (!p.connectedAt) return null;
  const end = p.active ? now : (p.disconnectedAt ?? p.lastActivityAt).getTime();
  return formatDuration(end - p.connectedAt.getTime());
}

function When({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)}>
      {timeAgo(date)}
    </time>
  );
}

/** Why an ended preview's link stopped working, in plain words. */
function endedExplanation(p: PreviewListItem) {
  if (p.status === "FAILED") return "The command never finished connecting, so this link never worked.";
  if (p.status === "EXPIRED") return `Its time ran out${p.disconnectedAt ? ` ${timeAgo(p.disconnectedAt)}` : ""}, so this link no longer works.`;
  if (p.status === "OFFLINE") return `The share command or this computer went offline${p.disconnectedAt ? ` ${timeAgo(p.disconnectedAt)}` : ""}, so this link no longer works.`;
  const reason = p.endReason ? ` (${p.endReason.toLowerCase()})` : "";
  return `Sharing ended${p.disconnectedAt ? ` ${timeAgo(p.disconnectedAt)}` : ""}${reason}, so this link no longer works.`;
}

/**
 * Previews as cards: what it is, the link, and what you can do with it. Technical numbers
 * stay in the collapsed "More details".
 */
export function PreviewList({ items, now, showProject = true, run = "localians" }: { items: PreviewListItem[]; now: number; showProject?: boolean; run?: string }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Previews" data-testid="preview-list">
      {items.map((p) => (
        <li
          key={p.id}
          data-testid="preview-card"
          data-session-id={p.id}
          className={cn("flex flex-col gap-3 rounded-[var(--radius-card)] border bg-card p-4 sm:p-5", p.status === "CONNECTED" ? "border-accent/25" : "border-line")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {showProject ? (
                <Link href={`/dashboard/projects/${p.project.id}`} className="block truncate text-[15px] font-semibold text-fg hover:underline">
                  {p.project.name}
                </Link>
              ) : null}
              <p className="mt-0.5 text-[12.5px] text-fg-3">
                Sharing <span className="font-mono text-fg-2">localhost:{p.localPort}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
              {p.plan ? <PlanBadge plan={p.plan} /> : null}
              <AccessBadge access={p.project.access} />
              <PreviewStatusBadge status={p.status} />
            </div>
          </div>

          {p.publicUrl ? (
            <p className={cn("break-all font-mono text-[14px]", p.active ? "text-fg" : "text-fg-3 line-through decoration-fg-3/40")} data-testid="preview-url">
              {p.publicUrl}
            </p>
          ) : null}

          {p.active ? (
            <>
              {p.status !== "CONNECTED" ? (
                <p className="text-[12.5px] leading-relaxed text-warn">
                  {p.status === "CONNECTING"
                    ? "Connecting to your computer…"
                    : "Your computer lost its connection. Localians is reconnecting — make sure the share command is still running."}
                </p>
              ) : null}
              <PreviewActions preview={{ ...p, projectName: p.project.name }} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
                <Countdown expiresAt={p.expiresAt} />
                <Link href={`/dashboard/projects/${p.project.id}#access`} className="underline underline-offset-2 hover:text-fg">
                  {p.project.access === "PASSWORD" ? "Change password" : "Add a password"}
                </Link>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-2 text-[12.5px] leading-relaxed text-fg-2">
              <p>{endedExplanation(p)} To share again, run:</p>
              <Command value={shareCommand(p.localPort, undefined, run)} label="Copy share command" />
            </div>
          )}

          <details className="group text-[12.5px]">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-fg-3 hover:text-fg marker:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
              More details
            </summary>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              <Meta label="Connected for" value={connectedFor(p, now) ?? "—"} />
              <Meta label="Last activity" value={<When date={p.lastActivityAt} />} />
              <Meta label="Requests" value={formatNumber(p.requestCount)} />
              <Meta label="Data transferred" value={formatBytes(p.bytesIn + p.bytesOut)} />
            </dl>
            <Link
              href={`/dashboard/previews/${p.id}`}
              aria-label={`View details of the ${p.project.name} preview`}
              className="mt-2 inline-flex items-center gap-1 text-fg-2 underline underline-offset-4 hover:text-fg"
            >
              Full details and history
            </Link>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-fg-3">{label}</dt>
      <dd className="truncate text-fg-2">{value}</dd>
    </div>
  );
}
