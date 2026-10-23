import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ProjectStatus, WorkspaceRole } from "@/generated/prisma/enums";
import { uniqueSlug } from "@/lib/slug";
import type { ProjectInput } from "@/lib/validation/project";
import { prisma } from "./db";
import { NotFoundError } from "./errors";
import { getCurrentWorkspace, requireMembership } from "./workspaces";

export const PAGE_SIZE = 12;

const projectSelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  framework: true,
  defaultPort: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
} satisfies Prisma.ProjectSelect;

export type ProjectRecord = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

/** Only projects in workspaces the user belongs to. Every read/write goes through this. */
const visibleTo = (userId: string): Prisma.ProjectWhereInput => ({ workspace: { members: { some: { userId } } } });

/** Loads a project the user may access, or throws NotFound (same response whether it exists or not). */
export async function getProjectForUser(userId: string, projectId: string): Promise<ProjectRecord> {
  if (typeof projectId !== "string" || projectId.length > 64) throw new NotFoundError("Project not found.");
  const project = await prisma.project.findFirst({ where: { id: projectId, ...visibleTo(userId) }, select: projectSelect });
  if (!project) throw new NotFoundError("Project not found.");
  return project;
}

export async function listProjects(
  userId: string,
  { query = "", status = "all", page = 1 }: { query?: string; status?: "all" | "active" | "archived"; page?: number },
) {
  const workspace = await getCurrentWorkspace(userId);
  const where: Prisma.ProjectWhereInput = {
    workspaceId: workspace.id,
    ...visibleTo(userId),
    ...(status === "active" ? { status: ProjectStatus.ACTIVE } : status === "archived" ? { status: ProjectStatus.ARCHIVED } : {}),
    ...(query.trim() ? { name: { contains: query.trim().slice(0, 80), mode: "insensitive" } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      select: projectSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page: Math.max(1, page), pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getProjectCounts(userId: string) {
  const workspace = await getCurrentWorkspace(userId);
  const grouped = await prisma.project.groupBy({
    by: ["status"],
    where: { workspaceId: workspace.id, ...visibleTo(userId) },
    _count: { _all: true },
  });
  const count = (s: ProjectStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const active = count(ProjectStatus.ACTIVE);
  const archived = count(ProjectStatus.ARCHIVED);
  return { total: active + archived, active, archived };
}

export async function getRecentProjects(userId: string, take = 5) {
  const workspace = await getCurrentWorkspace(userId);
  return prisma.project.findMany({
    where: { workspaceId: workspace.id, ...visibleTo(userId) },
    select: projectSelect,
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function createProject(userId: string, input: ProjectInput): Promise<ProjectRecord> {
  const workspace = await getCurrentWorkspace(userId);
  await requireMembership(userId, workspace.id);

  // The unique (workspaceId, slug) constraint is the final arbiter; retry if a
  // concurrent create claimed the same slug between the check and the insert.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await uniqueSlug(
      input.name,
      async (s) => !!(await prisma.project.findUnique({ where: { workspaceId_slug: { workspaceId: workspace.id, slug: s } }, select: { id: true } })),
      "project",
    );
    try {
      return await prisma.project.create({
        data: { ...input, slug, workspaceId: workspace.id },
        select: projectSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique project slug.");
}

export async function updateProject(userId: string, projectId: string, input: ProjectInput) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  // Slug stays stable after creation so future links and CLI references don't break.
  return prisma.project.update({ where: { id: project.id }, data: input, select: projectSelect });
}

export async function archiveProject(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  if (project.status === ProjectStatus.ARCHIVED) return project;
  return prisma.project.update({
    where: { id: project.id },
    data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() },
    select: projectSelect,
  });
}

export async function restoreProject(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId);
  if (project.status === ProjectStatus.ACTIVE) return project;
  return prisma.project.update({
    where: { id: project.id },
    data: { status: ProjectStatus.ACTIVE, archivedAt: null },
    select: projectSelect,
  });
}

/** Permanent. Workspace owners only. */
export async function deleteProject(userId: string, projectId: string) {
  const project = await getProjectForUser(userId, projectId);
  await requireMembership(userId, project.workspaceId, WorkspaceRole.OWNER);
  await prisma.project.delete({ where: { id: project.id } });
  return project;
}

/** id/name pairs for filter dropdowns (current workspace, archived included). */
export async function getProjectOptions(userId: string) {
  const workspace = await getCurrentWorkspace(userId);
  const rows = await prisma.project.findMany({
    where: { workspaceId: workspace.id, ...visibleTo(userId) },
    select: { id: true, name: true, slug: true, defaultPort: true, status: true, accessMode: true, accessPasswordHash: true, previewName: { select: { name: true, status: true } } },
    orderBy: { name: "asc" },
  });
  // Only whether a password exists — the hash never leaves the server.
  return rows.map(({ accessPasswordHash, previewName, ...p }) => ({
    ...p,
    hasPassword: accessPasswordHash !== null,
    customName: previewName?.status === "ACTIVE" ? previewName.name : null,
  }));
}
