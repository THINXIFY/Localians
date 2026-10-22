/** The production Localians server. */
export const DEFAULT_SERVER_URL = "https://localians.com";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Validates the `localians.serverUrl` setting. Tokens are sent to this server, so it must be HTTPS — plain HTTP is only
 * accepted for a server on this machine (development). No credentials, query strings or fragments.
 */
export function parseServerUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { ok: true, url: DEFAULT_SERVER_URL };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: `"${raw}" isn't a valid URL.` };
  }
  if (url.username || url.password) return { ok: false, error: "The server URL must not contain a username or password." };
  if (url.search || url.hash) return { ok: false, error: "The server URL must not contain ? or #." };
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) return { ok: false, error: "Use https:// (plain http:// is only allowed for localhost)." };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Use an https:// URL." };
  return { ok: true, url: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}

/** Only http(s) links are ever opened or copied as preview links. */
export function isWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
