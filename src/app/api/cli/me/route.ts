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
        select: { id: true, name: true, slug: true, framework: true, defaultPort: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      },
    },
  });
  return json({ user: auth.user, workspace: { id: workspace.id, name: workspace.name }, projects: workspace.projects });
});
