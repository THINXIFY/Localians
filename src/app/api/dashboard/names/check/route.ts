import { auth } from "@/server/auth";
import { apiError, json } from "@/server/cli/http";
import { nameAvailability } from "@/server/preview-names";
import { rateLimit } from "@/server/rate-limit";
import { getCurrentWorkspace } from "@/server/workspaces";

/**
 * Live availability for the custom-URL field. Rate limited per user (it would otherwise enumerate names), and it
 * never says who holds a taken name.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!(await rateLimit(`name-check:${session.user.id}`, 40, 60_000)).allowed) return apiError(429, "rate_limited", "Too many checks. Wait a moment.", { "retry-after": "30" });
  const name = (new URL(request.url).searchParams.get("name") ?? "").slice(0, 64);
  const workspace = await getCurrentWorkspace(session.user.id);
  return json(await nameAvailability(workspace.id, name));
}
