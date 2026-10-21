import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** Same substitution as `envsubst "$VARS"` in deploy/scripts/install.sh: only the listed variables. */
function render(template: string, vars: Record<string, string>) {
  return template.replace(/\$\{([A-Z_]+)\}/g, (match, name: string) => (name in vars ? vars[name] : match));
}

const PRODUCTION = {
  APP_DOMAIN: "localians.com",
  TUNNEL_HOST: "tunnel.localians.com",
  PREVIEW_DOMAIN: "preview.localians.com",
  REDIRECT_DOMAINS: "www.localians.com",
  APP_CERT_DIR: "/etc/letsencrypt/live/localians.com",
  PREVIEW_CERT_DIR: "/etc/letsencrypt/live/preview.localians.com",
  WEB_PORT: "4000",
  GATEWAY_PORT: "4100",
};

describe("Nginx site for localians.com", () => {
  // Directives only (comments explain the config and may mention what it avoids).
  const conf = render(read("deploy/nginx/localians.conf.template"), PRODUCTION).replace(/^\s*#.*$/gm, "");
  const servers = conf.split(/\nserver \{/).slice(1);
  const block = (name: string) => servers.find((s) => new RegExp(`server_name ${name.replace(/[.*]/g, "\\$&")};`).test(s))!;

  it("substitutes every template variable and keeps Nginx's own variables", () => {
    expect(conf).not.toMatch(/\$\{[A-Z_]+\}/);
    expect(conf).toContain("$request_uri");
    expect(conf).toContain("$http_upgrade");
  });

  it("can't change other sites on the shared server: no http2, IPv6 listeners or default_server", () => {
    expect(conf).not.toMatch(/\bhttp2\b/);
    expect(conf).not.toMatch(/\[::\]/);
    expect(conf).not.toMatch(/default_server/);
    for (const listen of conf.match(/^\s*listen .*;$/gm) ?? []) expect(listen.trim()).toMatch(/^listen (80|443 ssl);$/);
  });

  it("routes the app to 127.0.0.1:4000 and the tunnel host + previews to the gateway on 127.0.0.1:4100", () => {
    expect(conf).toContain("server 127.0.0.1:4000;");
    expect(conf).toContain("server 127.0.0.1:4100;");
    expect(block("localians.com")).toContain("proxy_pass http://localians_web;");
    expect(block("localians.com")).toMatch(/location \^~ \/api\/internal\/ \{\s*return 404;/); // gateway-only APIs never public
    expect(block("tunnel.localians.com")).toContain("proxy_pass http://localians_gateway;");
    expect(block("tunnel.localians.com")).toContain("proxy_set_header Upgrade $http_upgrade;");
    expect(block("*.preview.localians.com")).toContain("proxy_pass http://localians_gateway;");
    expect(block("*.preview.localians.com")).toContain("ssl_certificate     /etc/letsencrypt/live/preview.localians.com/fullchain.pem;");
    expect(block("www.localians.com")).toContain("return 301 https://localians.com$request_uri;");
  });

  it("serves ACME challenges and redirects plain HTTP for every Localians host", () => {
    const http = servers.find((s) => /listen 80;/.test(s))!;
    expect(http).toContain("server_name localians.com tunnel.localians.com *.preview.localians.com www.localians.com;");
    expect(http).toContain("/.well-known/acme-challenge/");
  });
});

function checkEnv(role: "web" | "gateway", env: Record<string, string>) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/check-production-env.mjs"), role], {
    // Only the variables under test (plus what Node needs to start): nothing leaks in from the dev environment.
    env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  return { code: result.status, out: result.stdout };
}

const secret = (c: string) => c.repeat(44);
const WEB: Record<string, string> = {
  NODE_ENV: "production",
  LOCALIANS_DEPLOYMENT: "production",
  NEXT_PUBLIC_SITE_URL: "https://localians.com",
  BETTER_AUTH_URL: "https://localians.com",
  BETTER_AUTH_SECRET: secret("a"),
  DATABASE_URL: "postgresql://localians:pw@127.0.0.1:5432/localians",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Localians <auth@localians.com>",
  TUNNEL_PREVIEW_DOMAIN: "preview.localians.com",
  TUNNEL_PUBLIC_SCHEME: "https",
  TUNNEL_GATEWAY_URL: "https://tunnel.localians.com",
  TUNNEL_TOKEN_SECRET: secret("b"),
  GATEWAY_API_SECRET: secret("c"),
  GATEWAY_CONTROL_URL: "http://127.0.0.1:4101",
};
const GATEWAY: Record<string, string> = {
  NODE_ENV: "production",
  LOCALIANS_DEPLOYMENT: "production",
  GATEWAY_ID: "gw-vps-1",
  GATEWAY_HOST: "127.0.0.1",
  GATEWAY_PORT: "4100",
  GATEWAY_ADMIN_HOST: "127.0.0.1",
  GATEWAY_ADMIN_PORT: "4101",
  GATEWAY_BEHIND_TLS_PROXY: "1",
  GATEWAY_TRUSTED_PROXIES: "127.0.0.1",
  GATEWAY_TUNNEL_HOST: "tunnel.localians.com",
  TUNNEL_PREVIEW_DOMAIN: "preview.localians.com",
  TUNNEL_TOKEN_SECRET: secret("b"),
  GATEWAY_API_SECRET: secret("c"),
  CONTROL_PLANE_URL: "http://127.0.0.1:4000",
};

describe("production environment checker", () => {
  it("accepts the localians.com configuration and flags the shared preview domain as a known beta risk", () => {
    const web = checkEnv("web", WEB);
    expect(web.code).toBe(0);
    expect(web.out).toContain("Known beta risk");
    expect(checkEnv("gateway", GATEWAY).code).toBe(0);
  });

  it.each([
    ["web", { BETTER_AUTH_URL: "https://app.localians.com" }, "BETTER_AUTH_URL must be https://localians.com"],
    ["web", { TUNNEL_GATEWAY_URL: "https://gw.localians.com" }, "TUNNEL_GATEWAY_URL must be https://tunnel.localians.com"],
    ["web", { TUNNEL_PREVIEW_DOMAIN: "previews.localians.com" }, "TUNNEL_PREVIEW_DOMAIN must be preview.localians.com"],
    ["web", { BETTER_AUTH_URL: "http://localians.com" }, "must use https://"],
    ["web", { BETTER_AUTH_SECRET: "replace-with-32+-random-characters-A-xxxxxx" }, "placeholder"],
    ["web", { EMAIL_TRANSPORT: "console" }, "EMAIL_TRANSPORT must be resend"],
    ["web", { LOCALIANS_DEPLOYMENT: "" }, "LOCALIANS_DEPLOYMENT must be production"],
    ["web", { GATEWAY_API_SECRET: secret("b") }, "must be different"],
    ["gateway", { GATEWAY_TUNNEL_HOST: "localians.com" }, "GATEWAY_TUNNEL_HOST must be tunnel.localians.com"],
    ["gateway", { GATEWAY_HOST: "0.0.0.0" }, "GATEWAY_HOST must be 127.0.0.1"],
    ["gateway", { GATEWAY_PORT: "4000" }, "must not be 4000"],
    ["gateway", { GATEWAY_BEHIND_TLS_PROXY: "0" }, "GATEWAY_BEHIND_TLS_PROXY must be 1"],
  ] as const)("%s: rejects %j", (role, override, message) => {
    const result = checkEnv(role, { ...(role === "web" ? WEB : GATEWAY), ...override });
    expect(result.code).toBe(1);
    expect(result.out).toContain(message);
  });

  it("allows other hostnames only when explicitly asked (staging)", () => {
    const staging = { ...WEB, BETTER_AUTH_URL: "https://staging.localians.com", NEXT_PUBLIC_SITE_URL: "https://staging.localians.com", LOCALIANS_CUSTOM_HOSTS: "1" };
    expect(checkEnv("web", staging).code).toBe(0);
  });

  it("never prints secret values", () => {
    const out = checkEnv("web", { ...WEB, BETTER_AUTH_SECRET: "short-secret" }).out;
    expect(out).toContain("BETTER_AUTH_SECRET must be at least 32 characters");
    expect(out).not.toContain("short-secret");
    expect(out).not.toContain(secret("b"));
  });
});

describe("CLI release build", () => {
  it("refuses to bake a development server into a release build", () => {
    const result = spawnSync(process.execPath, [path.join(root, "scripts/build-tunnel.mjs"), "--release"], {
      cwd: root,
      env: { ...process.env, LOCALIANS_DEFAULT_API_URL: "http://localhost:3001" },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Release builds need a public https server URL");
  });
});
