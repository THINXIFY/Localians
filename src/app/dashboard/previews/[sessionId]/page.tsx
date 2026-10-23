import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { Command } from "@/components/app/share/Command";
import { LiveUpdates } from "@/components/app/previews/LiveUpdates";
import { OpenPreviewLink, StopPreviewButton } from "@/components/app/previews/PreviewActions";
import { connectedFor } from "@/components/app/previews/PreviewList";
import { PreviewStatusBadge } from "@/components/app/previews/PreviewStatusBadge";
import { AccessBadge } from "@/components/app/previews/AccessBadge";
import { Card, PageHeader } from "@/components/app/Primitives";
import { CopyLabelButton } from "@/components/app/share/Command";
import { cliInfo } from "@/server/cli/config";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { EVENT_LABEL, EVENT_TONE, METERING_NOTE, shareCommand, STATUS_HELP } from "@/lib/previews";
import { NotFoundError } from "@/server/errors";
import { getPreviewDetail } from "@/server/previews";
import { requireUser } from "@/server/session";
import { Countdown } from "@/components/app/previews/Countdown";
import { durationLabel } from "@tunnel/shared/durations";
import { renderTime } from "@/server/time";

async function load(userId: string, sessionId: string) {
  try {
    return await getPreviewDetail(userId, sessionId);
  } catch (error) {
    // Same 404 whether the session doesn't exist or belongs to another workspace.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ sessionId: string }> }): Promise<Metadata> {
  const session = await requireUser();
  const { sessionId } = await params;
  const { preview } = await load(session.user.id, sessionId);
  return { title: `${preview.project.name} preview` };
}

function Stamp({ date }: { date: Date | null }) {
  if (!date) return <span className="text-fg-3">—</span>;
  return (
    <span>
      <time dateTime={date.toISOString()}>{formatDateTime(date)}</time>
      <span className="text-fg-3"> · {timeAgo(date)}</span>
    </span>
  );
}

export default async function PreviewDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await requireUser();
  const { sessionId } = await params;
  const detail = await load(session.user.id, sessionId);
  const { preview: p } = detail;
  const renderedAt = renderTime();
  const usable = p.active && p.publicUrl;
  const target = { id: p.id, publicUrl: p.publicUrl, active: p.active, canStop: p.canStop, projectName: p.project.name };
  const port = p.project.defaultPort ?? p.localPort;

  const connection = [
    { label: "Status", value: <PreviewStatusBadge status={p.status} /> },
    {
      label: "Access",
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-2">
          <AccessBadge access={p.project.access} />
          <Link href={`/dashboard/projects/${p.project.id}#access`} className="text-[12.5px] text-fg-2 underline underline-offset-2 hover:text-fg">
            {p.project.access === "PASSWORD" ? "Change password" : "Add a password"}
          </Link>
        </span>
      ),
    },
    { label: "Project", value: p.project.name },
    { label: "Sharing", value: <span className="font-mono">localhost:{p.localPort}</span> },
    { label: "Started", value: <Stamp date={p.createdAt} /> },
    { label: p.active ? "Connected for" : "Was connected for", value: connectedFor(p, renderedAt) ?? "Never connected" },
    ...(p.disconnectedAt ? [{ label: "Stopped", value: <Stamp date={p.disconnectedAt} /> }] : []),
    ...(p.durationMinutes ? [{ label: "Duration", value: durationLabel(p.durationMinutes) }] : []),
    ...(p.active ? [{ label: "Link expires", value: <Countdown expiresAt={p.expiresAt} /> }] : []),
  ];
  // Technical fields, collapsed by default.
  const advanced = [
    { label: "Session ID", value: <span className="font-mono">{p.id}</span> },
    { label: "Workspace", value: detail.workspace.name },
    { label: "Connected at", value: <Stamp date={p.connectedAt} /> },
    { label: "Last heartbeat", value: <Stamp date={p.lastHeartbeatAt} /> },
    { label: "Connections", value: `${formatNumber(detail.connections)} (each reconnect opens a new one)` },
    ...(detail.gatewayId ? [{ label: "Gateway", value: <span className="font-mono">{detail.gatewayId}</span> }] : []),
  ];

  const traffic = [
    { label: "Total requests", value: formatNumber(p.requestCount) },
    { label: "Incoming data", value: formatBytes(p.bytesIn), hint: "Visitor → your app" },
    { label: "Outgoing data", value: formatBytes(p.bytesOut), hint: "Your app → visitor" },
    { label: "Total transferred", value: formatBytes(p.bytesIn + p.bytesOut), hint: "Incoming + outgoing" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Live Previews", href: "/dashboard/previews" }, { label: p.project.name }]} />}
        title={p.project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PreviewStatusBadge status={p.status} />
            <AccessBadge access={p.project.access} />
            {p.publicUrl ? (
              <span className={cn("break-all font-mono text-[13.5px]", usable ? "text-fg" : "text-fg-3 line-through decoration-fg-3/50")} data-testid="preview-url">
                {p.publicUrl}
              </span>
            ) : (
              <span className="text-fg-3">Sharing isn&apos;t set up on this server.</span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveUpdates since={renderedAt} sessionId={p.id} className="mr-1" />
            {usable ? (
              <>
                <CopyLabelButton value={p.publicUrl!} label="Copy Link" size="sm" ariaLabel="Copy preview link" />
                <OpenPreviewLink url={p.publicUrl!} />
              </>
            ) : null}
            {p.canStop ? <StopPreviewButton preview={target} size="sm" /> : null}
          </div>
        }
      />

      {!p.active ? (
        <p role="status" className="rounded-xl border border-line-strong bg-tint/[0.03] px-4 py-3 text-[13.5px] leading-relaxed text-fg-2">
          Sharing ended{p.disconnectedAt ? ` ${timeAgo(p.disconnectedAt)}` : ""}
          {p.endReason ? ` (${p.endReason.toLowerCase()})` : ""}, so this link no longer works and can&apos;t be reused. To share again, run the command
          below in your project folder — you&apos;ll get a new link.
        </p>
      ) : p.status !== "CONNECTED" ? (
        <p role="status" className="rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13.5px] leading-relaxed text-fg-2">
          {STATUS_HELP[p.status]} Until it reconnects, visitors see a &ldquo;preview isn&apos;t active&rdquo; page. Check that the share command is still
          running in your terminal and your computer is online.
        </p>
      ) : null}
      {p.active && !detail.gatewayReachable ? (
        <p role="status" className="rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13.5px] text-fg-2">
          Localians can&apos;t confirm the live connection right now, so this status may be up to a minute out of date.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-fg sm:px-6">Details</h2>
          <dl className="divide-y divide-line">
            {connection.map((d) => (
              <div key={d.label} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
                <dt className="shrink-0 text-[13px] text-fg-3">{d.label}</dt>
                <dd className="min-w-0 break-words text-[13.5px] text-fg sm:text-right">{d.value}</dd>
              </div>
            ))}
          </dl>
          <details className="group border-t border-line">
            <summary className="cursor-pointer list-none px-5 py-3 text-[13px] text-fg-3 hover:text-fg sm:px-6 marker:hidden">
              <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> Advanced
            </summary>
            <dl className="divide-y divide-line border-t border-line">
              {advanced.map((d) => (
                <div key={d.label} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
                  <dt className="shrink-0 text-[13px] text-fg-3">{d.label}</dt>
                  <dd className="min-w-0 break-words text-[13.5px] text-fg sm:text-right">{d.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-fg sm:px-6">Traffic</h2>
            <dl className="grid grid-cols-2 gap-px bg-line">
              {traffic.map((t) => (
                <div key={t.label} className="bg-card px-5 py-4 sm:px-6">
                  <dt className="text-[12.5px] text-fg-3">{t.label}</dt>
                  <dd className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-fg" data-testid={`traffic-${t.label}`}>
                    {t.value}
                  </dd>
                  {t.hint ? <dd className="mt-0.5 text-[11.5px] text-fg-3">{t.hint}</dd> : null}
                </div>
              ))}
            </dl>
            <div className="border-t border-line px-5 py-3.5 text-[12px] leading-relaxed text-fg-3 sm:px-6">
              <p>
                Last activity: <Stamp date={p.lastActivityAt} />
              </p>
              <p className="mt-1.5">{METERING_NOTE} Totals update about every 20 seconds.</p>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-fg">Share this app again</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">
              Starts a <strong className="font-medium text-fg">new</strong> preview with a new link. A stopped or ended preview can&apos;t be resumed.
            </p>
            <div className="mt-3">
              <Command value={shareCommand(port, p.project.id, cliInfo().run)} label="Copy share command" />
            </div>
            <p className="mt-2 text-[12px] text-fg-3">
              {p.project.defaultPort ? "Uses the project's saved port." : `Uses this session's port (${p.localPort}); the project has no saved port.`}
            </p>
          </Card>
        </div>
      </div>

      <section aria-labelledby="timeline-title">
        <Card>
          <h2 id="timeline-title" className="border-b border-line px-5 py-4 text-[15px] font-semibold text-fg sm:px-6">
            History
          </h2>
          {detail.events.length ? (
            <ol className="flex flex-col px-5 py-4 sm:px-6" data-testid="timeline">
              {detail.events.map((e, i) => {
                const tone = EVENT_TONE[e.type];
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < detail.events.length - 1 ? <span aria-hidden="true" className="absolute left-[5px] top-4 h-full w-px bg-line" /> : null}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-card",
                        tone === "live" ? "bg-accent" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-danger" : "bg-fg-3/70",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-fg">{EVENT_LABEL[e.type]}</p>
                      <p className="text-[12.5px] text-fg-3">
                        <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time> · {timeAgo(e.createdAt)}
                        {e.detail ? ` · ${e.detail}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="px-5 py-4 text-[13.5px] text-fg-2 sm:px-6">
              No lifecycle events were recorded for this session. (Sessions from before connection history was added have none.)
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}
