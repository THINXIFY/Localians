import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Primitives";
import { DEFAULT_LOCAL_PORT } from "@/lib/previews";
import { ShareWizard } from "@/components/app/share/ShareWizard";
import { cliInfo, customNamesRouting, getTunnelConfig } from "@/server/cli/config";
import { getShareStatus } from "@/server/previews";
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
  const [projects, status, setup, workspace, plans] = await Promise.all([
    getProjectOptions(session.user.id),
    getShareStatus(session.user.id, new Date(openedAt)),
    createShareSetup(session.user.id),
    getCurrentWorkspace(session.user.id),
    getSharePlans(session.user.id),
  ]);
  const cli = cliInfo();

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8">
      <PageHeader
        title="Share a local app"
        description="Pick a project, choose Free or the 7-Day Pass, then run one command. No deployment needed."
      />
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
        payment={paymentInfo()}
        previewDomain={getTunnelConfig()?.previewDomain ?? "preview.localians.com"}
      />
    </div>
  );
}
