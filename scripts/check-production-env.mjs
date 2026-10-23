#!/usr/bin/env node
// Validates a production environment before deploying. Prints problems, never values.
//
//   node --env-file=/etc/localians/web.env     scripts/check-production-env.mjs web
//   node --env-file=/etc/localians/gateway.env scripts/check-production-env.mjs gateway
//
// Exit code 1 if anything is wrong (deploy.sh refuses to continue), 0 otherwise.

const role = process.argv[2];
if (role !== "web" && role !== "gateway") {
  console.error("Usage: check-production-env.mjs <web|gateway>");
  process.exit(2);
}

const env = process.env;

// The official production hostnames. Set LOCALIANS_CUSTOM_HOSTS=1 to validate another setup (e.g. staging).
const PRODUCTION = { app: "https://localians.com", tunnel: "https://tunnel.localians.com", tunnelHost: "tunnel.localians.com", previewDomain: "preview.localians.com" };
const pinned = env.LOCALIANS_CUSTOM_HOSTS !== "1";
const errors = [];
const warnings = [];
const need = (name) => {
  const v = env[name]?.trim();
  if (!v) errors.push(`${name} is not set`);
  return v ?? "";
};
const secret = (name) => {
  const v = need(name);
  if (v && v.length < 32) errors.push(`${name} must be at least 32 characters`);
  if (/replace-with|changeme|example|secret-for-tests/i.test(v)) errors.push(`${name} still has a placeholder value`);
  return v;
};
const httpsUrl = (name) => {
  const v = need(name);
  if (!v) return null;
  try {
    const url = new URL(v);
    if (url.protocol !== "https:") errors.push(`${name} must use https://`);
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) || url.hostname.endsWith(".localhost")) errors.push(`${name} must be a public hostname, not ${url.hostname}`);
    return url;
  } catch {
    errors.push(`${name} is not a valid URL`);
    return null;
  }
};
const loopbackUrl = (name) => {
  const v = need(name);
  if (!v) return;
  try {
    const url = new URL(v);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) warnings.push(`${name} is not a loopback address — make sure it is only reachable on a private network`);
  } catch {
    errors.push(`${name} is not a valid URL`);
  }
};
const registrable = (host) => host.split(".").slice(-2).join(".");

if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
if (env.LOCALIANS_DEPLOYMENT !== "production") errors.push("LOCALIANS_DEPLOYMENT must be production (disables every dev/test fallback)");
const tokenSecret = secret("TUNNEL_TOKEN_SECRET");
const apiSecret = secret("GATEWAY_API_SECRET");
if (tokenSecret && tokenSecret === apiSecret) errors.push("TUNNEL_TOKEN_SECRET and GATEWAY_API_SECRET must be different");
const previewDomain = need("TUNNEL_PREVIEW_DOMAIN").toLowerCase();
if (pinned && previewDomain && previewDomain !== PRODUCTION.previewDomain) errors.push(`TUNNEL_PREVIEW_DOMAIN must be ${PRODUCTION.previewDomain}`);
if (previewDomain.endsWith("localhost")) errors.push("TUNNEL_PREVIEW_DOMAIN must be a public domain");

if (role === "web") {
  if (env.PORT && env.PORT !== "4000") warnings.push(`PORT is ${env.PORT}; the documented deployment uses 4000`);
  const authSecret = secret("BETTER_AUTH_SECRET");
  if (authSecret && (authSecret === tokenSecret || authSecret === apiSecret)) errors.push("BETTER_AUTH_SECRET must differ from the tunnel secrets");
  const app = httpsUrl("BETTER_AUTH_URL");
  const site = httpsUrl("NEXT_PUBLIC_SITE_URL");
  if (pinned) {
    for (const [name, url] of [["BETTER_AUTH_URL", app], ["NEXT_PUBLIC_SITE_URL", site]]) if (url && url.origin !== PRODUCTION.app) errors.push(`${name} must be ${PRODUCTION.app} (no path, no trailing slash)`);
  }
  if (app && site && app.origin !== site.origin) warnings.push("NEXT_PUBLIC_SITE_URL and BETTER_AUTH_URL differ — sign-in state won't be shared between them");
  const db = need("DATABASE_URL");
  if (db && !/^postgres(ql)?:\/\//.test(db)) errors.push("DATABASE_URL must be a postgresql:// URL");
  // Uploaded images must survive deploys: never inside a release directory (deploy.sh replaces those).
  const uploads = need("LOCALIANS_UPLOAD_DIR");
  if (uploads && !uploads.startsWith("/")) errors.push("LOCALIANS_UPLOAD_DIR must be an absolute path (e.g. /srv/localians/uploads)");
  else if (uploads && /^\/srv\/localians\/(releases|current)(\/|$)/.test(uploads)) errors.push("LOCALIANS_UPLOAD_DIR must be outside the release directories (use /srv/localians/uploads)");
  if (db && !/@(localhost|127\.0\.0\.1|\[::1\]|\/)/.test(db) && !/sslmode=require/.test(db)) warnings.push("DATABASE_URL points to a remote host without sslmode=require");

  // Email: production never falls back to console/outbox delivery.
  const transport = (env.EMAIL_TRANSPORT ?? "resend").toLowerCase();
  if (transport !== "resend") errors.push("EMAIL_TRANSPORT must be resend (or unset) in production");
  if (env.ALLOW_TEST_EMAIL_TRANSPORT) errors.push("ALLOW_TEST_EMAIL_TRANSPORT must not be set in production");
  if (env.AUTH_RATE_LIMIT === "off") errors.push("AUTH_RATE_LIMIT=off must not be set in production");
  const resend = need("RESEND_API_KEY");
  if (resend && !resend.startsWith("re_")) warnings.push("RESEND_API_KEY doesn't look like a Resend key (re_…)");
  const from = need("EMAIL_FROM");
  if (/your-verified-domain|example\.com/.test(from)) errors.push("EMAIL_FROM still uses a placeholder domain");

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) warnings.push("GitHub sign-in is disabled (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET not set)");

  const gateway = httpsUrl("TUNNEL_GATEWAY_URL");
  if (pinned && gateway && gateway.origin !== PRODUCTION.tunnel) errors.push(`TUNNEL_GATEWAY_URL must be ${PRODUCTION.tunnel}`);
  if ((env.TUNNEL_PUBLIC_SCHEME ?? "https") !== "https") errors.push("TUNNEL_PUBLIC_SCHEME must be https");
  if (env.TUNNEL_PUBLIC_PORT && env.TUNNEL_PUBLIC_PORT !== "443") warnings.push("TUNNEL_PUBLIC_PORT is set: preview links will include a port");
  if (!env.GATEWAY_CONTROL_URL && !env.GATEWAY_CONTROL_URLS) errors.push("GATEWAY_CONTROL_URL (or GATEWAY_CONTROL_URLS) is not set — dashboard Stop/status can't reach the gateway");
  if (env.GATEWAY_CONTROL_URL) loopbackUrl("GATEWAY_CONTROL_URL");

  // Cookie isolation: previews run untrusted code; on a subdomain of the app they could set
  // cookies for the shared parent domain ("cookie tossing").
  if (app && previewDomain) {
    if (previewDomain === app.hostname || app.hostname.endsWith(`.${previewDomain}`)) errors.push("The app must not be served from the preview domain");
    else if (registrable(previewDomain) === registrable(app.hostname)) {
      warnings.push(`Known beta risk: previews (*.${previewDomain}) share the registrable domain ${registrable(app.hostname)} with the app. Auth cookies are __Host- (host-only) and cross-origin requests are rejected, but previews are same-site with the dashboard. Move previews to a separate registrable domain before opening sharing to untrusted users (deploy/README.md §8).`);
    }
  }
  if (gateway && previewDomain && gateway.hostname.endsWith(`.${previewDomain}`)) errors.push("TUNNEL_GATEWAY_URL must not be under the preview domain");
}

if (role === "gateway") {
  if ((env.GATEWAY_HOST ?? "0.0.0.0") !== "127.0.0.1") errors.push("GATEWAY_HOST must be 127.0.0.1 (Nginx is the only public entry point)");
  if (!env.GATEWAY_PORT) errors.push("GATEWAY_PORT is not set");
  if (env.GATEWAY_PORT === "4000") errors.push("GATEWAY_PORT must not be 4000 (the web app's port)");
  if (env.GATEWAY_BEHIND_TLS_PROXY !== "1") errors.push("GATEWAY_BEHIND_TLS_PROXY must be 1 (Nginx terminates TLS)");
  if (env.GATEWAY_TLS_CERT_FILE || env.GATEWAY_TLS_KEY_FILE) warnings.push("GATEWAY_TLS_* are set: the gateway will serve TLS itself; behind Nginx it should not");
  if (!(env.GATEWAY_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).includes("127.0.0.1")) errors.push("GATEWAY_TRUSTED_PROXIES must include 127.0.0.1 (Nginx)");
  const tunnelHost = need("GATEWAY_TUNNEL_HOST").toLowerCase();
  if (pinned && tunnelHost && tunnelHost !== PRODUCTION.tunnelHost) errors.push(`GATEWAY_TUNNEL_HOST must be ${PRODUCTION.tunnelHost}`);
  need("CONTROL_PLANE_URL");
  if (!env.GATEWAY_ID) errors.push("GATEWAY_ID must be set (stable across restarts)");
  if (!env.GATEWAY_ADMIN_PORT) errors.push("GATEWAY_ADMIN_PORT must be set (health checks and the dashboard's control API)");
  if (env.GATEWAY_ADMIN_HOST && !["127.0.0.1", "::1"].includes(env.GATEWAY_ADMIN_HOST)) warnings.push("GATEWAY_ADMIN_HOST is not loopback — keep it on a private network only");
  const ports = [env.GATEWAY_PORT, env.GATEWAY_ADMIN_PORT, "4000"].filter(Boolean);
  if (new Set(ports).size !== ports.length) errors.push("GATEWAY_PORT, GATEWAY_ADMIN_PORT and the web port (4000) must all differ");
}

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error:   ${e}`);
console.log(errors.length ? `${role}: ${errors.length} problem(s) — fix before deploying.` : `${role}: environment OK${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
process.exit(errors.length ? 1 : 0);
