import type { Metadata } from "next";
import { SettingsPanel } from "@/components/app/Primitives";
import { WorkspaceAvatarForm, WorkspaceForm } from "@/components/app/settings/WorkspaceSettings";
import { formatDate } from "@/lib/format";
import { getProjectCounts } from "@/server/projects";
import { requireUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspaces";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const session = await requireUser();
  const [workspace, counts] = await Promise.all([getCurrentWorkspace(session.user.id), getProjectCounts(session.user.id)]);
  const info = [
    { label: "Your role", value: workspace.role === "OWNER" ? "Owner" : "Member" },
    { label: "Created", value: formatDate(workspace.createdAt) },
    { label: "Projects", value: String(counts.total) },
    { label: "Plan", value: "Free · Preview Pass per project" },
  ];

  return (
    <>
      <WorkspaceAvatarForm name={workspace.name} avatarUrl={workspace.avatarUrl} canEdit={workspace.role === "OWNER"} />
      <WorkspaceForm name={workspace.name} slug={workspace.slug} canEdit={workspace.role === "OWNER"} />
      <SettingsPanel title="Workspace information" description="Team members and invitations arrive in a later stage.">
        <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {info.map((i) => (
            <div key={i.label} className="bg-card px-4 py-3">
              <dt className="text-[12px] text-fg-3">{i.label}</dt>
              <dd className="mt-0.5 text-[14px] text-fg">{i.value}</dd>
            </div>
          ))}
        </dl>
      </SettingsPanel>
    </>
  );
}
