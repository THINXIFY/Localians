import { auth } from "@/server/auth";
import { apiError, json } from "@/server/cli/http";
import { collectChanges, newTracker } from "@/server/live-events";
import { rateLimit } from "@/server/rate-limit";

/**
 * Dashboard live updates (preview status + traffic counters) as Server-Sent Events.
 *
 * Each stream lives at most ~50 s and then ends; EventSource reconnects automatically and
 * resumes from `Last-Event-ID`, so this also works on hosts that cap request duration
 * (serverless). `?mode=poll` returns one batch of changes as JSON for clients that can't
 * hold a stream open. Changes come from PostgreSQL + the gateway's routing table, so every
 * web instance sees the same truth without a shared message bus.
 */
export const maxDuration = 60;

const STREAM_MS = 50_000;
const AUTH_RECHECK_MS = 15_000;
const pollMs = () => Math.max(250, Number(process.env.DASHBOARD_EVENTS_POLL_MS) || 2000);

function parseSince(value: string | null) {
  const ms = Number(value);
  // Clamp to a sane window: never further back than 10 minutes, never in the future.
  if (!Number.isFinite(ms) || ms <= 0) return new Date();
  return new Date(Math.min(Date.now(), Math.max(ms, Date.now() - 10 * 60_000)));
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return apiError(401, "unauthorized", "Sign in to receive live updates.");
  const userId = session.user.id;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project") ?? undefined;
  const sessionId = url.searchParams.get("session") ?? undefined;
  if ((projectId && !ID.test(projectId)) || (sessionId && !ID.test(sessionId))) return apiError(400, "invalid_request", "Invalid filter.");
  const filter = { projectId, sessionId };
  const tracker = newTracker(parseSince(request.headers.get("last-event-id") ?? url.searchParams.get("since")));

  if (url.searchParams.get("mode") === "poll") {
    if (!(await rateLimit(`live-poll:${userId}`, 120, 60_000)).allowed) return apiError(429, "rate_limited", "Too many requests.", { "retry-after": "30" });
    const { changes, cursor } = await collectChanges(userId, tracker, filter);
    return json({ cursor: cursor.getTime(), changes });
  }

  // Each stream reconnects about once a minute; this bounds runaway reconnect loops per user.
  const limited = await rateLimit(`live-stream:${userId}`, 30, 60_000);
  if (!limited.allowed) return apiError(429, "rate_limited", "Too many live connections.", { "retry-after": String(limited.retryAfterS) });

  const encoder = new TextEncoder();
  // Disconnects are detected through the stream itself (`cancel`, or a failed enqueue), not
  // `request.signal`: under `next start` that signal fires as soon as the request body ends.
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const started = Date.now();
      let lastAuth = started;
      send("retry: 3000\n\n");

      while (!closed && Date.now() - started < STREAM_MS) {
        try {
          if (Date.now() - lastAuth > AUTH_RECHECK_MS) {
            lastAuth = Date.now();
            // Signed out or session revoked mid-stream: stop sending immediately.
            if (!(await auth.api.getSession({ headers: request.headers }))) {
              send("event: unauthorized\ndata: {}\n\n");
              break;
            }
          }
          const { changes, cursor } = await collectChanges(userId, tracker, filter);
          // `id` is the resume cursor; an id-only frame updates Last-Event-ID without dispatching an event.
          send(changes.length ? `id: ${cursor.getTime()}\nevent: previews\ndata: ${JSON.stringify({ changes })}\n\n` : `id: ${cursor.getTime()}\n\n`);
        } catch {
          send("event: unavailable\ndata: {}\n\n");
        }
        await sleep(pollMs());
      }
      closed = true;
      try {
        controller.close();
      } catch {
        // already closed by the client
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
