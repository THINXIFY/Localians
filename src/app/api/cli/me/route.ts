import { ProjectStatus } from "@/generated/prisma/enums";
import { json, withCliAuth } from "@/server/cli/http";
import { prisma } from "@/server/db";

/** Who the CLI is signed in as, plus the workspace's active projects (for `share` to pick from). */
export const GET = withCliAuth(async (_request, auth) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: auth.workspaceId },
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: ProjectStatus.ACTIVE },
        select: { id: true, name: true, slug: true, framework: true, defaultPort: true, accessMode: true, accessPasswordHash: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      },
    },
  });
  // Access is reported as public/password (+ whether a password exists); the hash itself never leaves the server.
  const projects = workspace.projects.map(({ accessMode, accessPasswordHash, ...p }) => ({
    ...p,
    access: accessMode === "PASSWORD" ? ("password" as const) : ("public" as const),
    hasPassword: accessPasswordHash !== null,
  }));
  return json({ user: auth.user, workspace: { id: workspace.id, name: workspace.name }, projects });
});
