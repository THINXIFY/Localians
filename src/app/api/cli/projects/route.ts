import { apiError, json, readJson, withCliAuth } from "@/server/cli/http";
import { projectInputSchema } from "@/lib/validation/project";
import { createProject } from "@/server/projects";

/** Lets `localians share` create a project for an app it hasn't seen before. */
export const POST = withCliAuth(async (request, auth) => {
  const body = await readJson(request);
  const parsed = projectInputSchema.safeParse({
    name: typeof body?.name === "string" ? body.name : "",
    description: "",
    framework: typeof body?.framework === "string" ? body.framework : "",
    defaultPort: body?.defaultPort === undefined || body.defaultPort === null ? "" : String(body.defaultPort),
  });
  if (!parsed.success) return apiError(400, "invalid_project", parsed.error.issues[0]?.message ?? "Invalid project.");
  const project = await createProject(auth.userId, parsed.data);
  return json({ project: { id: project.id, name: project.name, slug: project.slug, framework: project.framework, defaultPort: project.defaultPort } }, 201);
});
