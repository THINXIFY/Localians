import { auth } from "@/server/auth";
import { apiError, json } from "@/server/cli/http";
import { getShareStatus } from "@/server/previews";
import { rateLimit } from "@/server/rate-limit";

/** Polled by the Share App wizard while it waits for the developer's CLI to connect. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!(await rateLimit(`share-status:${session.user.id}`, 120, 60_000)).allowed) return apiError(429, "rate_limited", "Too many requests.", { "retry-after": "30" });
  const since = Number(new URL(request.url).searchParams.get("since"));
  // Never look back further than an hour.
  const from = new Date(Number.isFinite(since) && since > 0 ? Math.max(since, Date.now() - 3600_000) : Date.now());
  return json(await getShareStatus(session.user.id, from));
}
