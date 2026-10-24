import type { Metadata } from "next";
import Link from "next/link";
import { Radio, SearchX, Share2 } from "lucide-react";
import { LiveUpdates } from "@/components/app/previews/LiveUpdates";
import { PreviewFilters } from "@/components/app/previews/PreviewFilters";
import { PreviewList } from "@/components/app/previews/PreviewList";
import { EmptyState, PageHeader, StatCard } from "@/components/app/Primitives";
import { ButtonLink } from "@/components/ui/Button";
import { formatBytes, formatCount } from "@/lib/format";
import { METERING_NOTE, shareCommand } from "@/lib/previews";
import { Command } from "@/components/app/share/Command";
import { cliInfo } from "@/server/cli/config";
import { listPreviews, getPreviewSummary, type PreviewFilter, SUMMARY_WINDOW_DAYS } from "@/server/previews";
import { getProjectOptions } from "@/server/projects";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";

export const metadata: Metadata = { title: "Live Previews" };

type Search = { filter?: string; project?: string; q?: string; sort?: string; cursor?: string };
const FILTERS: PreviewFilter[] = ["all", "connected", "offline", "historical"];

export default async function LivePreviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireUser("/dashboard/previews");
  const sp = await searchParams;
  const filter = FILTERS.includes(sp.filter as PreviewFilter) ? (sp.filter as PreviewFilter) : "all";
  const projects = await getProjectOptions(session.user.id);
  const projectId = projects.some((p) => p.id === sp.project) ? sp.project : undefined;
  const renderedAt = renderTime();

  const [summary, list] = await Promise.all([
    getPreviewSummary(session.user.id),
    listPreviews(session.user.id, {
      filter,
      projectId,
      q: typeof sp.q === "string" ? sp.q : "",
      sort: sp.sort === "newest" ? "newest" : "activity",
      cursor: typeof sp.cursor === "string" && sp.cursor.length <= 64 ? sp.cursor : undefined,
    }),
  ]);
  const cli = cliInfo();
  const filtered = filter !== "all" || !!projectId || !!sp.q;
  const trafficWindow = `Last ${SUMMARY_WINDOW_DAYS} days`;

  const nextHref = (() => {
    if (!list.nextCursor) return null;
    const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    params.set("cursor", list.nextCursor);
    return `/dashboard/previews?${params}`;
  })();
  const firstHref = (() => {
    const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "cursor" && typeof v === "string") as [string, string][]);
    return `/dashboard/previews${params.size ? `?${params}` : ""}`;
  })();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Live Previews"
        description="Monitor and manage the applications you're sharing."
        actions={
          <div className="flex items-center gap-3">
            <LiveUpdates since={renderedAt} />
            {summary.active.length ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 text-[12.5px] font-medium text-accent-ink" data-testid="live-count">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                {summary.active.length} live
              </span>
            ) : null}
            <ButtonLink href={summary.active.length ? "/dashboard/share#share-another" : "/dashboard/share"} size="sm">
              <Share2 className="size-3.5" aria-hidden="true" />
              {summary.active.length ? "Share Another App" : "Share a Local App"}
            </ButtonLink>
          </div>
        }
      />

      {!summary.gatewayReachable && summary.active.length ? (
        <p role="status" className="rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-[13.5px] text-fg-2">
          Localians can&apos;t confirm live connections right now, so statuses may be up to a minute out of date.
        </p>
      ) : null}

      {summary.totalSessions === 0 ? (
        <EmptyState
          icon={<Radio className="size-5" aria-hidden="true" />}
          title="Nothing shared yet."
          description="Start your app, then run one command in its folder. Each app you share gets its own link; run the command again in another terminal to share more."
          action={
            <div className="flex w-full max-w-[420px] flex-col items-center gap-3">
              <Command value={shareCommand(3000, undefined, cli.run)} label="Copy share command" className="w-full" />
              <ButtonLink href="/dashboard/share">
                <Share2 className="size-4" aria-hidden="true" />
                Share a Local App
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <section aria-labelledby="sessions-title" className="flex flex-col gap-4">
          <h2 id="sessions-title" className="sr-only">
            Your previews
          </h2>
          <PreviewFilters projects={projects} />
          {list.items.length ? (
            <PreviewList items={list.items} now={renderedAt} run={cli.run} />
          ) : (
            <EmptyState
              icon={<SearchX className="size-5" aria-hidden="true" />}
              title={filter === "connected" ? "Nothing is connected right now." : filter === "offline" ? "No previews are reconnecting." : "No previews match."}
              description={filtered ? "Try another filter or search." : "Share a local app to create a preview."}
            />
          )}
          {nextHref || sp.cursor ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-[13.5px]">
              {sp.cursor ? (
                <Link href={firstHref} className="text-fg-2 underline underline-offset-4 hover:text-fg">
                  Back to latest
                </Link>
              ) : (
                <span />
              )}
              {nextHref ? (
                <Link href={nextHref} className="font-medium text-accent-ink underline underline-offset-4">
                  Older previews
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      )}

      <section aria-labelledby="usage-title" className="flex flex-col gap-3">
        <h2 id="usage-title" className="text-[15px] font-semibold text-fg">
          Usage
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active Previews" value={summary.connectedCount} hint="Connected right now" />
          <StatCard label="Total Sessions" value={formatCount(summary.totalSessions)} hint="All time" />
          <StatCard label="Requests Served" value={formatCount(summary.requests)} hint={trafficWindow} />
          <StatCard label="Bandwidth Transferred" value={formatBytes(summary.bytes)} hint={trafficWindow} />
        </dl>
        <p className="text-[12px] leading-relaxed text-fg-3">{METERING_NOTE}</p>
      </section>
    </div>
  );
}
