import { ProjectStatus } from "@/generated/prisma/enums";
import { getTunnelConfig, previewUrl, quotas } from "@/server/cli/config";
import { json, withCliAuth } from "@/server/cli/http";
import { prisma } from "@/server/db";

/** Who the CLI is signed in as (with username), its login expiry and limits, plus the workspace's active projects (for `share` to pick from). */
export const GET = withCliAuth(async (_request, auth) => {
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: auth.workspaceId },
    select: {
      id: true,
      name: true,
      projects: {
        where: { status: ProjectStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          slug: true,
          framework: true,
          defaultPort: true,
          accessMode: true,
          accessPasswordHash: true,
          previewName: { select: { name: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      },
    },
  });
  // Access is reported as public/password (+ whether a password exists); the hash itself never leaves the server.
  const config = getTunnelConfig();
  const projects = workspace.projects.map(({ accessMode, accessPasswordHash, previewName, ...p }) => ({
    ...p,
    access: accessMode === "PASSWORD" ? ("password" as const) : ("public" as const),
    hasPassword: accessPasswordHash !== null,
    // The project's custom link (Preview Pass), if it has one.
    customUrl: previewName?.status === "ACTIVE" && config ? previewUrl(config, previewName.name) : null,
  }));
  return json({
    user: auth.user,
    workspace: { id: workspace.id, name: workspace.name },
    // The login renews while it is used; clients update their saved expiry from here.
    credential: { expiresAt: auth.expiresAt.toISOString() },
    limits: { activePreviews: quotas().activePreviewsPerUser },
    projects,
  });
});
