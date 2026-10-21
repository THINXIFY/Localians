import { createHmac, timingSafeEqual } from "node:crypto";
import { ACCESS_COOKIE, ACCESS_PATHS, type AccessPolicy } from "../shared/protocol";

/**
 * Visitor access to password-protected previews.
 *
 * After the control plane accepts a password, the gateway sets an HttpOnly cookie on that
 * preview host only: `<payload>.<HMAC-SHA256>` where payload = {label, policy version, expiry}.
 * The cookie is useless on any other preview (label), after the password changes or visitors are
 * signed out (version), and after `ttlS`. It never reaches the developer's app: `localians.*`
 * cookies are stripped before forwarding.
 */
export type AccessKey = Buffer;

export const deriveAccessKey = (apiSecret: string): AccessKey => createHmac("sha256", apiSecret).update("localians-preview-access-v1").digest();

type Claims = { l: string; v: number; e: number };

export function cookieName(secure: boolean) {
  // __Host- pins the cookie to this exact host and path, over HTTPS only.
  return secure ? `__Host-${ACCESS_COOKIE}` : ACCESS_COOKIE;
}

export function signAccess(key: AccessKey, label: string, policy: AccessPolicy, now = Date.now()) {
  const claims: Claims = { l: label, v: policy.version, e: Math.floor(now / 1000) + policy.ttlS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", key).update(payload).digest("base64url");
  return { value: `${payload}.${mac}`, maxAge: policy.ttlS };
}

export function readCookie(header: string | string[] | undefined, name: string) {
  const raw = Array.isArray(header) ? header.join("; ") : (header ?? "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/** True if the cookie was issued for this preview, under the current policy version, and hasn't expired. */
export function verifyAccess(key: AccessKey, value: string | undefined, label: string, policy: AccessPolicy, now = Date.now()) {
  if (!value || value.length > 512) return false;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return false;
  const expected = createHmac("sha256", key).update(payload).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Claims;
    return claims.l === label && claims.v === policy.version && claims.e * 1000 > now;
  } catch {
    return false;
  }
}

/** Where to send the visitor after signing in: a same-site path only (no open redirects). */
export function safeNext(next: unknown) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next) || next.length > 2048) return "/";
  if (next.startsWith("/__localians/")) return "/";
  return next;
}

export function setCookieHeader(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const clearCookieHeader = (name: string, secure: boolean) => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Headers for pages the gateway renders itself (not the developer's app). */
export const GATEWAY_PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
} as const;

export type LoginMessage = "none" | "invalid" | "rate-limited" | "unavailable";

const MESSAGES: Record<Exclude<LoginMessage, "none">, string> = {
  invalid: "That password isn't right. Try again.",
  "rate-limited": "Too many attempts. Wait a few minutes and try again.",
  unavailable: "Couldn't check the password right now. Try again in a moment.",
};

/** Branded password page. Only the (escaped) return path is reflected from the request. */
export function loginPage(next: string, message: LoginMessage = "none") {
  const error = message === "none" ? "" : `<p class="e" role="alert">${MESSAGES[message]}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Password required · Localians</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070907;color:#f7f8f5;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{width:100%;max-width:400px;padding:32px 24px}p.k{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#a7b0a4;margin:0}p.k span{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:2px;background:#b8ff3b}h1{margin:16px 0 6px;font-size:24px;line-height:1.25;letter-spacing:-.02em}p{color:#a7b0a4;margin:0}form{margin-top:24px;display:grid;gap:12px}label{font-size:14px;color:#f7f8f5}input{width:100%;height:46px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#111511;color:#f7f8f5;font:inherit}input:focus{outline:2px solid #b8ff3b;outline-offset:2px}button{height:46px;border:0;border-radius:999px;background:#b8ff3b;color:#070907;font:600 15px/1 system-ui,sans-serif;cursor:pointer}p.e{margin-top:16px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,107,94,.35);background:rgba(255,107,94,.08);color:#ffb3ab;font-size:14px}small{display:block;margin-top:20px;color:#858f84;font-size:12.5px}</style></head><body><main><p class="k"><span></span>LOCALIANS</p><h1>This preview is password protected</h1><p>Enter the password the developer gave you.</p>${error}<form method="post" action="${ACCESS_PATHS.login}"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required maxlength="128" autofocus><button type="submit">Open preview</button></form><small>You'll stay signed in to this preview on this browser until the developer changes the password or signs visitors out.</small></main></body></html>`;
}
