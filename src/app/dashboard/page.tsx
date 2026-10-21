import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, FolderPlus, Plus, Share2 } from "lucide-react";
import { LiveUpdates } from "@/components/app/previews/LiveUpdates";
import { PreviewList } from "@/components/app/previews/PreviewList";
import { Card, EmptyState, StatCard } from "@/components/app/Primitives";
import { ProjectTable } from "@/components/app/ProjectTable";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatBytes, formatCount, formatDateTime, timeAgo } from "@/lib/format";
import { DEFAULT_LOCAL_PORT, EVENT_LABEL, EVENT_TONE, shareCommand } from "@/lib/previews";
import { cliInfo } from "@/server/cli/config";
import { getPreviewSummary, getRecentActivity, SUMMARY_WINDOW_DAYS } from "@/server/previews";
import { getProjectCounts, getRecentProjects } from "@/server/projects";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await requireUser();
  const renderedAt = renderTime();
  const [counts, recent, summary, activity] = await Promise.all([
    getProjectCounts(session.user.id),
    getRecentProjects(session.user.id, 5),
    getPreviewSummary(session.user.id),
    getRecentActivity(session.user.id, 6),
  ]);
  const cli = cliInfo();
  const trafficWindow = `Last ${SUMMARY_WINDOW_DAYS} days`;

  const explainers = [
    { title: "What it does", body: "Gives the app running on your computer a temporary HTTPS link — nothing is deployed." },
    { title: "Connect your app", body: <>Run <code className="font-mono text-[12px] text-fg">{shareCommand(DEFAULT_LOCAL_PORT, undefined, cli.run)}</code> in a terminal next to your app.</> },
    { title: "Get a link", body: "Copy the preview link and send it — add a password if it shouldn't be public. It works while your app and that command run." },
    { title: "Stop sharing", body: "Press Ctrl+C in that terminal, or use Stop Sharing here. The link stops working right away." },
  ];

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-[22px] border border-line bg-card">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)]" />
        <div className="relative flex flex-col gap-7 p-6 sm:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-[46ch]">
              <h1 id="hero-title" className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-fg sm:text-[36px]">
                Your localhost. Ready to share.
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-2 sm:text-[16px]">
                Turn your local web app into a link you can send to anyone. No deployments needed.
              </p>
            </div>
            <LiveUpdates since={renderedAt} className="mt-2 hidden sm:inline-flex" />
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/dashboard/share" size="lg">
              <Share2 className="size-4" aria-hidden="true" />
              Share a Local App
            </ButtonLink>
            <ButtonLink href="/dashboard/previews" size="lg" variant="secondary">
              View My Previews
            </ButtonLink>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="How Localians works">
            {explainers.map((e, i) => (
              <li key={e.title} className="flex gap-3 rounded-xl border border-line bg-bg-2/60 p-4">
                <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] text-fg-2">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[13.5px] font-semibold text-fg">{e.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{e.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="active-title" className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 id="active-title" className="text-[18px] font-semibold tracking-[-0.02em] text-fg">
            Sharing now
          </h2>
          <Link href="/dashboard/previews" className="inline-flex items-center gap-1 text-[13.5px] text-fg-2 transition-colors hover:text-fg">
            All previews
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        {summary.active.length ? (
          <div data-testid="overview-active">
            <PreviewList items={summary.active} now={renderedAt} run={cli.run} />
          </div>
        ) : (
          <EmptyState
            className="py-10"
            icon={<Share2 className="size-5" aria-hidden="true" />}
            title="Nothing is being shared right now."
            description="When you share a local app, its preview link shows up here with Copy Link and Stop Sharing."
            action={
              <ButtonLink href="/dashboard/share" size="sm">
                Share a Local App
              </ButtonLink>
            }
          />
        )}
      </section>

      <section aria-label="Workspace summary">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Projects" value={counts.total} hint={`${counts.active} active · ${counts.archived} archived`} />
          <StatCard label="Active Previews" value={summary.connectedCount} hint="Connected right now" />
          <StatCard label="Total Requests" value={formatCount(summary.requests)} hint={trafficWindow} />
          <StatCard label="Bandwidth Usage" value={formatBytes(summary.bytes)} hint={trafficWindow} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="recent-title" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <h2 id="recent-title" className="text-[18px] font-semibold tracking-[-0.02em] text-fg">
              My Projects
            </h2>
            {recent.length ? (
              <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-[13.5px] text-fg-2 transition-colors hover:text-fg">
                View all
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {recent.length ? (
            <ProjectTable projects={recent} compact />
          ) : (
            <EmptyState
              className="py-10"
              icon={<FolderPlus className="size-5" aria-hidden="true" />}
              title="No projects yet"
              description="A project is created for you the first time you share an app. You can also add one yourself."
              action={
                <ButtonLink href="/dashboard/projects/new" size="sm" variant="secondary">
                  <Plus className="size-4" aria-hidden="true" />
                  Create Project
                </ButtonLink>
              }
            />
          )}
        </section>

        <section aria-labelledby="activity-title" className="flex flex-col gap-4">
          <h2 id="activity-title" className="text-[18px] font-semibold tracking-[-0.02em] text-fg">
            Recent Activity
          </h2>
          {activity.length ? (
            <Card>
              <ol className="divide-y divide-line" data-testid="recent-activity">
                {activity.map((e) => {
                  const tone = EVENT_TONE[e.type];
                  return (
                    <li key={e.id}>
                      <Link href={`/dashboard/previews/${e.sessionId}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-tint/[0.025] sm:px-5">
                        <span
                          aria-hidden="true"
                          className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone === "live" ? "bg-accent" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-danger" : "bg-fg-3/60")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-fg">
                            {EVENT_LABEL[e.type]} · <span className="text-fg-2">{e.projectName}</span>
                          </span>
                          <span className="block truncate text-[12px] text-fg-3">{e.detail ?? e.publicUrl?.replace(/^https?:\/\//, "")}</span>
                        </span>
                        <time dateTime={e.createdAt.toISOString()} title={formatDateTime(e.createdAt)} className="shrink-0 text-[12px] text-fg-3">
                          {timeAgo(e.createdAt)}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : (
            <EmptyState className="py-10" icon={<Activity className="size-5" aria-hidden="true" />} title="No activity yet." description="Connections and stops show up here once you share an app." />
          )}
        </section>
      </div>
    </div>
  );
}
