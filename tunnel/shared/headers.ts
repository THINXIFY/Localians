import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";

/** Hop-by-hop headers (RFC 9110 §7.6.1) plus HTTP/2-forbidden connection headers. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "http2-settings",
  "host",
]);

/** Forwarding headers clients must never be able to spoof. */
const SPOOFABLE_FORWARDING = new Set([
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-forwarded-prefix",
  "x-real-ip",
  "x-client-ip",
  "true-client-ip",
  "cf-connecting-ip",
]);

/** Localians control headers: only the gateway may set these. */
const INTERNAL_PREFIX = "x-localians-";

/** Cookie names that belong to the Localians dashboard and must never reach a preview. */
const LOCALIANS_COOKIE = /^\s*(?:__Secure-|__Host-)?localians\./i;

function connectionTokens(headers: IncomingHttpHeaders | OutgoingHttpHeaders) {
  const value = headers["connection"];
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Removes Localians cookies from a Cookie header value; returns undefined if nothing remains. */
export function stripLocaliansCookies(cookie: string | undefined) {
  if (!cookie) return undefined;
  const kept = cookie
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !LOCALIANS_COOKIE.test(c));
  return kept.length ? kept.join("; ") : undefined;
}

/**
 * Headers to forward from a public client to the tunnel. Strips hop-by-hop and
 * spoofable forwarding headers, anything named in `Connection`, and Localians
 * internal headers; then sets trustworthy forwarding information.
 */
export function sanitizeRequestHeaders(
  incoming: IncomingHttpHeaders,
  forwarding: { clientIp: string; host: string; proto: "http" | "https" },
): Record<string, string | string[]> {
  const drop = connectionTokens(incoming);
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(incoming)) {
    const key = name.toLowerCase();
    if (value === undefined) continue;
    if (key.startsWith(":") || HOP_BY_HOP.has(key) || drop.has(key) || SPOOFABLE_FORWARDING.has(key) || key.startsWith(INTERNAL_PREFIX)) continue;
    if (key === "cookie") {
      const cookie = stripLocaliansCookies(Array.isArray(value) ? value.join("; ") : value);
      if (cookie) out.cookie = cookie;
      continue;
    }
    out[key] = value;
  }
  out["x-forwarded-for"] = forwarding.clientIp;
  out["x-forwarded-host"] = forwarding.host;
  out["x-forwarded-proto"] = forwarding.proto;
  out["forwarded"] = `for=${formatForwardedFor(forwarding.clientIp)};host=${forwarding.host};proto=${forwarding.proto}`;
  return out;
}

function formatForwardedFor(ip: string) {
  return ip.includes(":") ? `"[${ip}]"` : ip;
}

/** Response headers safe to send back over HTTP/2 / to a public client. */
export function sanitizeResponseHeaders(incoming: IncomingHttpHeaders | OutgoingHttpHeaders): Record<string, string | string[]> {
  const drop = connectionTokens(incoming);
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(incoming)) {
    const key = name.toLowerCase();
    if (value === undefined || key.startsWith(":") || HOP_BY_HOP.has(key) || drop.has(key) || key.startsWith(INTERNAL_PREFIX)) continue;
    out[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return out;
}

const SENSITIVE_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key"]);

/** For logs: header names only for sensitive values. Never log request/response bodies. */
export function redactHeaders(headers: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? "[redacted]" : v;
  return out;
}

/** Strips query strings from logged paths (they often carry tokens). */
export function redactPath(path: string) {
  const i = path.indexOf("?");
  return i === -1 ? path : `${path.slice(0, i)}?[redacted]`;
}
