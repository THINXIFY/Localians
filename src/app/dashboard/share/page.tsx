import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Primitives";
import { ShareWizard } from "@/components/app/share/ShareWizard";
import { cliInfo } from "@/server/cli/config";
import { getShareStatus } from "@/server/previews";
import { getProjectOptions } from "@/server/projects";
import { createShareSetup } from "@/server/share-setup";
import { getCurrentWorkspace } from "@/server/workspaces";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";

export const metadata: Metadata = { title: "Share App" };

export default async function SharePage({ searchParams }: { searchParams: Promise<{ port?: string }> }) {
  const session = await requireUser("/dashboard/share");
  const openedAt = renderTime();
  const requested = Number((await searchParams).port);
  const initialPort = Number.isInteger(requested) && requested >= 1 && requested <= 65535 ? requested : 3000;
  const [projects, status, setup, workspace] = await Promise.all([
    getProjectOptions(session.user.id),
    getShareStatus(session.user.id, new Date(openedAt)),
    createShareSetup(session.user.id),
    getCurrentWorkspace(session.user.id),
  ]);
  const cli = cliInfo();

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8">
      <PageHeader
        title="Share a local app"
        description="Choose your port, run one command, share the link. No deployment needed."
      />
      <ShareWizard
        openedAt={openedAt}
        initialPort={initialPort}
        run={cli.run}
        published={cli.published}
        localGateway={cli.localGateway}
        projects={projects}
        workspaceName={workspace.name}
        setup={{ id: setup.id, code: setup.code }}
        initialStatus={status}
      />
    </div>
  );
}
