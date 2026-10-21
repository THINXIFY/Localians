import "server-only";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

/** Field names that must never reach logs, whatever a caller passes. */
const SECRET_FIELD = /password|token|secret|cookie|authorization|hash|code/i;

/**
 * Structured JSON log line for the control plane (one object per line, ready for a log
 * pipeline or error monitor). Only metadata: secret-looking fields are dropped, values truncated.
 */
export function log(level: Level, msg: string, fields: Fields = {}) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  if (process.env.NODE_ENV === "test" && level !== "error" && process.env.LOG_IN_TESTS !== "1") return;
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_FIELD.test(k)) continue;
    safe[k] = typeof v === "string" ? v.slice(0, 300) : v;
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), level, svc: "web", msg, ...safe });
  if (level === "error" || level === "warn") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}
