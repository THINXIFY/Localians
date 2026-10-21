export type Logger = (level: "info" | "warn" | "error", msg: string, fields?: Record<string, unknown>) => void;

/**
 * Structured JSON-lines logger. Callers pass metadata only — never request/response
 * bodies, cookies, Authorization headers or tokens.
 */
export function createLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Logger {
  return (level, msg, fields = {}) => {
    write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }));
  };
}
