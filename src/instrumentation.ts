import type { Instrumentation } from "next";

/**
 * Server errors as structured JSON lines (stderr), ready for any log pipeline or error monitor.
 * Only the path is recorded — never headers, cookies or bodies. Set ERROR_WEBHOOK_URL to also
 * forward each error to an external monitor.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  const entry = {
    ts: new Date().toISOString(),
    level: "error",
    svc: "web",
    msg: "request error",
    error: message.slice(0, 500),
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  };
  console.error(JSON.stringify(entry)); // works in both the Node.js and Edge runtimes
  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry), signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
};
