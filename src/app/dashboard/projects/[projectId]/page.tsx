import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { LiveUpdates } from "@/components/app/previews/LiveUpdates";
import { ProjectPreviews } from "@/components/app/previews/ProjectPreviews";
import { Card, PageHeader, StatusBadge } from "@/components/app/Primitives";
import { DeleteProjectSection, ProjectActions } from "@/components/app/ProjectActions";
import { formatDateTime } from "@/lib/format";
import { frameworkLabel } from "@/lib/validation/project";
import { NotFoundError } from "@/server/errors";
import { getProjectPreviews } from "@/server/previews";
import { getProjectAccess } from "@/server/access";
import { ProjectAccessPanel } from "@/components/app/previews/ProjectAccessPanel";
import { CustomUrlPanel } from "@/components/app/names/CustomUrlPanel";
import { getProjectName } from "@/server/preview-names";
import { PlanCards } from "@/components/app/plans/PlanCards";
import { planSummary } from "@/server/plan-summaries";
import { paymentInfo } from "@/server/upgrades";
import { getTunnelConfig } from "@/server/cli/config";
import { cliInfo } from "@/server/cli/config";
import { getProjectForUser } from "@/server/projects";
import { requireUser } from "@/server/session";
import { renderTime } from "@/server/time";
import { getCurrentWorkspace } from "@/server/workspaces";

async function loadProject(userId: string, projectId: string) {
  try {
    return await getProjectForUser(userId, projectId);
  } catch (error) {
    // Same 404 whether the project doesn't exist or belongs to someone else.
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const session = await requireUser();
  const { projectId } = await params;
  const project = await loadProject(session.user.id, projectId);
  return { title: project.name };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requireUser();
  const { projectId } = await params;
  const [project, workspace] = await Promise.all([loadProject(session.user.id, projectId), getCurrentWorkspace(session.user.id)]);
  const [previews, access, customUrl, plan] = await Promise.all([
    getProjectPreviews(session.user.id, project.id),
    getProjectAccess(session.user.id, project.id),
    getProjectName(session.user.id, project.id),
    planSummary(project, session.user.id),
  ]);
  const renderedAt = renderTime();

  const details = [
    { label: "Framework", value: frameworkLabel(project.framework) ?? "Not specified" },
    { label: "Default local port", value: project.defaultPort ? String(project.defaultPort) : "Not specified", mono: !!project.defaultPort },
    { label: "Status", value: <StatusBadge status={project.status} /> },
    { label: "Created", value: <time dateTime={project.createdAt.toISOString()}>{formatDateTime(project.createdAt)}</time> },
    { label: "Last updated", value: <time dateTime={project.updatedAt.toISOString()}>{formatDateTime(project.updatedAt)}</time> },
    ...(project.archivedAt
      ? [{ label: "Archived", value: <time dateTime={project.archivedAt.toISOString()}>{formatDateTime(project.archivedAt)}</time> }]
      : []),
    { label: "Project slug", value: project.slug, mono: true },
    { label: "Project ID", value: project.id, mono: true },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Projects", href: "/dashboard/projects" }, { label: project.name }]} />}
        title={project.name}
        description={project.description || "No description yet."}
        actions={
          <>
            <LiveUpdates since={renderedAt} projectId={project.id} className="mr-1 self-center" />
            <ProjectActions
              project={{ id: project.id, name: project.name, status: project.status }}
              formValues={{
                name: project.name,
                description: project.description ?? "",
                framework: project.framework ?? "",
                defaultPort: project.defaultPort ? String(project.defaultPort) : "",
              }}
            />
          </>
        }
      />

      {project.status === "ARCHIVED" ? (
        <p role="status" className="rounded-xl border border-line-strong bg-tint/[0.03] px-4 py-3 text-[13.5px] text-fg-2">
          This project is archived. Its details are kept, but it won&apos;t appear in your active list. Restore it to work on it again.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-fg sm:px-6">Project details</h2>
        <dl className="-mb-px grid grid-cols-1 md:grid-cols-2 md:[&>div:nth-child(odd)]:border-r md:[&>div]:border-line">
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5 sm:px-6">
              <dt className="text-[13.5px] text-fg-3">{d.label}</dt>
              <dd className={`min-w-0 truncate text-right text-[13.5px] text-fg ${d.mono ? "font-mono" : ""}`}>{d.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ProjectAccessPanel
        projectId={project.id}
        initial={{ mode: access.mode, ttlMinutes: access.ttlMinutes, hasPassword: access.hasPassword }}
        livePreviews={previews.active.length}
      />

      {project.status === "ACTIVE" ? (
        <section id="plan" aria-labelledby="plan-title" className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-card">
          <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
            <h2 id="plan-title" className="text-[15px] font-semibold text-fg">
              Plan
            </h2>
            <p className="text-[13px] leading-relaxed text-fg-2">One free 24-hour preview per project, then the 7-Day Pass for $5. Your computer and app must stay running while you share.</p>
          </div>
          <div className="px-5 py-5 sm:px-6">
            <PlanCards
              plan={plan}
              project={{ id: project.id, name: project.name }}
              payment={paymentInfo()}
              previewDomain={getTunnelConfig()?.previewDomain ?? "preview.localians.com"}
              hasCustomName={Boolean(customUrl.name)}
            />
          </div>
        </section>
      ) : null}

      {project.status === "ACTIVE" ? <CustomUrlPanel projectId={project.id} projectName={project.name} state={customUrl} upgradeHref="#plan" /> : null}

      <ProjectPreviews
        project={{ id: project.id, defaultPort: project.defaultPort, archived: project.status === "ARCHIVED" }}
        active={previews.active}
        history={previews.history}
        total={previews.total}
        now={renderedAt}
        run={cliInfo().run}
      />

      {workspace.role === "OWNER" ? <DeleteProjectSection project={{ id: project.id, name: project.name, status: project.status }} /> : null}
    </div>
  );
}
