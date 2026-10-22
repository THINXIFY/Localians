import { ZodError } from "zod";
import { AccessError, getProjectAccess, previewPasswordSchema, updateProjectAccess } from "@/server/access";
import { apiError, json, readJson, withCliAuth } from "@/server/cli/http";
import { getProjectForUser } from "@/server/projects";

/**
 * Turns on password protection for a project, or sets a new password (VS Code extension, CLI).
 * Deliberately one-way: a CLI credential can make previews *more* private, never public again —
 * turning protection off stays a dashboard action, so a leaked token can't unprotect previews.
 */
export const POST = withCliAuth(async (request, auth, params) => {
  const project = await getProjectForUser(auth.userId, params.projectId ?? "");
  if (project.workspaceId !== auth.workspaceId) return apiError(404, "not_found", "Not found, or you don't have access to it.");
  const body = await readJson(request);
  const password = previewPasswordSchema.safeParse(typeof body?.password === "string" ? body.password : "");
  if (!password.success) return apiError(400, "invalid_password", password.error.issues[0]?.message ?? "Use at least 8 characters.");
  try {
    const current = await getProjectAccess(auth.userId, project.id);
    const applied = await updateProjectAccess(auth.userId, project.id, { mode: "PASSWORD", password: password.data, ttlMinutes: current.ttlMinutes });
    return json({ access: "password", livePreviews: applied.previews });
  } catch (error) {
    if (error instanceof AccessError || error instanceof ZodError) return apiError(400, "invalid_access", error instanceof AccessError ? error.message : "Invalid access settings.");
    throw error;
  }
});
