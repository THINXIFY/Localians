import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { AnalyticsFilters } from "@/components/app/analytics/AnalyticsFilters";
import { ColumnChart } from "@/components/app/analytics/ColumnChart";
import { LiveUpdates } from "@/components/app/previews/LiveUpdates";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/app/Primitives";
import { buttonClasses } from "@/components/ui/Button";
import { formatBytes, formatCount, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { METERING_NOTE } from "@/lib/previews";
import { getAnalytics, resolveRange } from "@/server/analytics";
import { TELEMETRY_RETENTION_DAYS } from "@/server/cli/lifecycle";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";

export const metadata: Metadata = { title: "Analytics" };

type Search = { range?: string; from?: string; to?: string; project?: string };

const RANGE_TEXT: Record<string, string> = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireUser("/dashboard/analytics");
  const sp = await searchParams;
  const now = new Date(renderTime());
  const range = resolveRange({ range: sp.range, from: sp.from, to: sp.to }, now);
  const data = await getAnalytics(session.user.id, range, typeof sp.project === "string" ? sp.project : undefined);
  const scopeText = range.key === "custom" ? `${range.from} to ${range.to} (UTC)` : RANGE_TEXT[range.key];
  const projectText = data.project ? ` · ${data.project.name}` : "";
  const minDate = new Date(now.getTime() - TELEMETRY_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const maxDate = now.toISOString().slice(0, 10);

  const top = data.breakdown.filter((r) => r.requests > 0).slice(0, 8);
  const topMax = Math.max(1, ...top.map((r) => r.requests));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Analytics"
        description="Understand how your development previews are being used."
        actions={<LiveUpdates since={now.getTime()} minRefreshMs={15_000} />}
      />

      <AnalyticsFilters
        range={range.key}
        from={range.from}
        to={range.to}
        minDate={minDate}
        maxDate={maxDate}
        projects={data.projects}
        projectId={data.project?.id ?? null}
        error={range.error}
      />

      <section aria-label="Summary">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Preview Sessions" value={formatCount(data.totals.sessions)} hint={`Started in the ${range.key === "custom" ? "range" : scopeText}`} />
          <StatCard label="Total Requests" value={formatCount(data.totals.requests)} hint={scopeText} />
          <StatCard label="Total Bandwidth" value={formatBytes(data.totals.bytes)} hint={scopeText} />
          <StatCard label="Active Previews" value={data.totals.active} hint="Connected right now" />
        </dl>
      </section>

      {!data.hasAnyActivity ? (
        <EmptyState
          icon={<BarChart3 className="size-5" aria-hidden="true" />}
          title="No activity yet."
          description="Your preview activity will appear here once you start sharing a local application."
          action={
            <Link href="/dashboard/previews" className={buttonClasses({ size: "sm" })}>
              How to share
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold text-fg">Requests over time</h2>
              <p className="mt-0.5 text-[12.5px] text-fg-3">
                {scopeText}
                {projectText} · per {range.binMs >= 86_400_000 ? "day" : range.binMs > 3_600_000 ? "6 hours" : "hour"} (UTC)
              </p>
              <div className="mt-4">
                <ColumnChart title="Requests over time" unit="count" binMs={range.binMs} points={data.series.map((p) => ({ start: p.start.toISOString(), value: p.requests }))} />
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold text-fg">Bandwidth over time</h2>
              <p className="mt-0.5 text-[12.5px] text-fg-3">
                Incoming + outgoing · {scopeText}
                {projectText}
              </p>
              <div className="mt-4">
                <ColumnChart title="Bandwidth over time" unit="bytes" binMs={range.binMs} points={data.series.map((p) => ({ start: p.start.toISOString(), value: p.bytes }))} />
              </div>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-[15px] font-semibold text-fg">Activity by project</h2>
            <p className="mt-0.5 text-[12.5px] text-fg-3">Requests · {scopeText}</p>
            {top.length ? (
              <ul className="mt-4 flex flex-col gap-3" aria-label="Requests by project">
                {top.map((r) => (
                  <li key={r.projectId} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                    <span className="truncate text-[13px] text-fg-2" title={r.name}>
                      {r.name}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="h-3 rounded-r-[4px] bg-accent-ink" style={{ width: `calc(${(r.requests / topMax) * 100}% - 4rem)`, minWidth: 2 }} />
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg">{formatNumber(r.requests)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-[13.5px] text-fg-2">No requests in this range.</p>
            )}
          </Card>

          <section aria-labelledby="breakdown-title" className="flex flex-col gap-3">
            <h2 id="breakdown-title" className="text-[18px] font-semibold tracking-[-0.02em] text-fg">
              Project breakdown
            </h2>
            {data.breakdown.length ? (
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
                <table className="hidden w-full text-left md:table" data-testid="breakdown-table">
                  <caption className="sr-only">Per-project usage, {scopeText}</caption>
                  <thead className="border-b border-line font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-normal">
                        Project
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-normal">
                        Sessions
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-normal">
                        Requests
                      </th>
                      <th scope="col" className="px-3 py-3 text-right font-normal">
                        Bandwidth
                      </th>
                      <th scope="col" className="px-5 py-3 text-right font-normal">
                        Last activity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-[13.5px]">
                    {data.breakdown.map((r) => (
                      <tr key={r.projectId}>
                        <td className="px-5 py-3">
                          <Link href={`/dashboard/projects/${r.projectId}`} className="font-medium text-fg hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-fg-2">{formatNumber(r.sessions)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-fg-2">{formatNumber(r.requests)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-fg-2">{formatBytes(r.bytes)}</td>
                        <td className="px-5 py-3 text-right text-fg-2">
                          {r.lastActivity ? (
                            <time dateTime={r.lastActivity.toISOString()} title={formatDateTime(r.lastActivity)}>
                              {timeAgo(r.lastActivity)}
                            </time>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-line md:hidden" aria-label="Per-project usage">
                  {data.breakdown.map((r) => (
                    <li key={r.projectId} className="flex flex-col gap-2 px-4 py-3.5">
                      <Link href={`/dashboard/projects/${r.projectId}`} className="truncate text-[14px] font-medium text-fg">
                        {r.name}
                      </Link>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                        <div>
                          <dt className="text-fg-3">Sessions</dt>
                          <dd className="text-fg-2">{formatNumber(r.sessions)}</dd>
                        </div>
                        <div>
                          <dt className="text-fg-3">Requests</dt>
                          <dd className="text-fg-2">{formatNumber(r.requests)}</dd>
                        </div>
                        <div>
                          <dt className="text-fg-3">Bandwidth</dt>
                          <dd className="text-fg-2">{formatBytes(r.bytes)}</dd>
                        </div>
                        <div>
                          <dt className="text-fg-3">Last activity</dt>
                          <dd className="text-fg-2">{r.lastActivity ? timeAgo(r.lastActivity) : "—"}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-line px-4 py-3 text-[13.5px] text-fg-2">No project activity in this range.</p>
            )}
          </section>
        </>
      )}

      <p className="text-[12px] leading-relaxed text-fg-3">
        {METERING_NOTE} Traffic is recorded in hourly buckets (UTC) as the gateway reports it, about every 20 seconds, and kept for {TELEMETRY_RETENTION_DAYS} days. Ranges start
        on a whole hour. Traffic from before analytics were recorded isn&apos;t included.
      </p>
    </div>
  );
}
