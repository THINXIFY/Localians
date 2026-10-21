import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FolderPlus, Plus, SearchX } from "lucide-react";
import { Suspense } from "react";
import { EmptyState, PageHeader } from "@/components/app/Primitives";
import { ProjectFilters } from "@/components/app/ProjectFilters";
import { ProjectTable } from "@/components/app/ProjectTable";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { projectStatusFilter } from "@/lib/validation/project";
import { listProjects } from "@/server/projects";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 80);
  const status = projectStatusFilter.parse(params.status ?? "all");
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const result = await listProjects(session.user.id, { query, status, page });
  const filtered = Boolean(query) || status !== "all";

  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (status !== "all") sp.set("status", status);
    if (n > 1) sp.set("page", String(n));
    return `/dashboard/projects${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Projects"
        description="Each project represents an app you develop locally and want to share."
        actions={
          <ButtonLink href="/dashboard/projects/new">
            <Plus className="size-4" aria-hidden="true" />
            Create Project
          </ButtonLink>
        }
      />

      <Suspense>
        <ProjectFilters />
      </Suspense>

      {result.items.length ? (
        <>
          <p className="sr-only" role="status">
            {result.total} project{result.total === 1 ? "" : "s"} found
          </p>
          <ProjectTable projects={result.items} />
          {result.pageCount > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
              <p className="text-[13px] text-fg-3">
                Page {result.page} of {result.pageCount} · {result.total} projects
              </p>
              <div className="flex gap-2">
                {result.page > 1 ? (
                  <Link href={pageHref(result.page - 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Previous
                  </Link>
                ) : null}
                {result.page < result.pageCount ? (
                  <Link href={pageHref(result.page + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Next
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      ) : filtered ? (
        <EmptyState
          icon={<SearchX className="size-5" aria-hidden="true" />}
          title="No matching projects"
          description="Try a different search term or status filter."
          action={
            <Link href="/dashboard/projects" className={buttonClasses({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={<FolderPlus className="size-5" aria-hidden="true" />}
          title="Create your first project"
          description="Add the app you're building so it's ready to share when the Localians CLI arrives."
          action={
            <ButtonLink href="/dashboard/projects/new">
              <Plus className="size-4" aria-hidden="true" />
              Create Project
            </ButtonLink>
          }
        />
      )}
    </div>
  );
}
