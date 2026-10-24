import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Primitives";
import { DEFAULT_LOCAL_PORT } from "@/lib/previews";
import { PreviewList } from "@/components/app/previews/PreviewList";
import { CliConnect } from "@/components/app/share/CliConnect";
import { ShareWizard } from "@/components/app/share/ShareWizard";
import { cliInfo, customNamesRouting, getTunnelConfig, quotas } from "@/server/cli/config";
import { cliConnectStatus, listCliCredentials } from "@/server/cli/credentials";
import { getPreviewSummary, getShareStatus } from "@/server/previews";
import { getUserProfile } from "@/server/session";
import { getSharePlans } from "@/server/plan-summaries";
import { getProjectOptions } from "@/server/projects";
import { paymentInfo } from "@/server/upgrades";
import { createShareSetup } from "@/server/share-setup";
import { getCurrentWorkspace } from "@/server/workspaces";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";

export const metadata: Metadata = { title: "Share App" };

export default async function SharePage({ searchParams }: { searchParams: Promise<{ port?: string }> }) {
  const session = await requireUser("/dashboard/share");
  const openedAt = renderTime();
  const portParam = (await searchParams).port;
  const requested = Number(portParam);
  const portFromUrl = Number.isInteger(requested) && requested >= 1 && requested <= 65535;
  const initialPort = portFromUrl ? requested : DEFAULT_LOCAL_PORT;
  const [projects, status, setup, workspace, plans, summary, credentials, profile] = await Promise.all([
    getProjectOptions(session.user.id),
    getShareStatus(session.user.id, new Date(openedAt)),
    createShareSetup(session.user.id),
    getCurrentWorkspace(session.user.id),
    getSharePlans(session.user.id),
    getPreviewSummary(session.user.id),
    listCliCredentials(session.user.id),
    getUserProfile(session.user.id),
  ]);
  const live = summary.active;
  const limit = quotas().activePreviewsPerUser;
  const cli = cliInfo();

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8">
      <PageHeader
        title="Share a local app"
        description="Pick a project, choose Free or the Preview Pass, then run one command. No deployment needed."
      />
      {live.length ? (
        <section aria-labelledby="live-now-title" className="flex flex-col gap-3" data-testid="share-live-now">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="live-now-title" className="text-[15px] font-semibold text-fg">
              Live now <span className="font-mono text-[13px] font-normal text-fg-3">({live.length})</span>
            </h2>
            <a href="#share-another" className="text-[13px] font-medium text-accent-ink underline-offset-4 hover:underline">
              Share another app ↓
            </a>
          </div>
          <PreviewList items={live} now={openedAt} run={cli.run} />
          <p className="text-[12px] leading-relaxed text-fg-3">
            Each preview runs on its own: its own port, link, timer and access. Stopping one leaves the others running. You can share up to {limit} apps at once.
          </p>
        </section>
      ) : null}
      <CliConnect compact run={cli.run} account={{ username: profile.username, email: profile.email }} status={cliConnectStatus(credentials)} />
      <div id="share-another" className="scroll-mt-24" />
      <ShareWizard
        openedAt={openedAt}
        initialPort={initialPort}
        portFromUrl={portFromUrl}
        run={cli.run}
        published={cli.published}
        localGateway={cli.localGateway}
        projects={projects}
        workspaceName={workspace.name}
        setup={{ id: setup.id, code: setup.code }}
        initialStatus={status}
        customUrlsRouting={customNamesRouting()}
        plans={plans}
        payment={await paymentInfo()}
        previewDomain={getTunnelConfig()?.previewDomain ?? "preview.localians.com"}
      />
    </div>
  );
}
