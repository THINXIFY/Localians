import { apiError, json, readJson, withCliAuth } from "@/server/cli/http";
import { createTunnelSession, listActiveTunnelsForCli } from "@/server/cli/tunnels";

export const POST = withCliAuth(async (request, auth) => {
  const body = await readJson(request);
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const localPort = typeof body?.localPort === "number" ? body.localPort : Number.NaN;
  if (!projectId) return apiError(400, "invalid_request", "projectId is required.");
  // durationMinutes is optional (older CLIs omit it); the server checks it against the plan.
  return json(await createTunnelSession(auth, { projectId, localPort, durationMinutes: body?.durationMinutes }), 201);
});

export const GET = withCliAuth(async (_request, auth) => json({ tunnels: await listActiveTunnelsForCli(auth) }));
