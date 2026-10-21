import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

describe("provision.sh on the shared VPS", () => {
  const script = read("deploy/scripts/provision.sh");
  const sh = (cmd: string[]) => spawnSync("bash", cmd, { encoding: "utf8" });

  it("has valid bash syntax", () => {
    const res = sh(["-n", path.join(root, "deploy/scripts/provision.sh")]);
    expect(res.stderr).toBe("");
    expect(res.status).toBe(0);
  });

  it("is plan-only by default and rejects unknown options", () => {
    expect(script).toMatch(/APPLY=0; WITH_SWAP=0; WITH_JOURNALD=0; WITH_FIREWALL=0; WITH_FAIL2BAN=0/);
    expect(script).toContain('*) echo "Unknown option');
  });

  it("makes server-wide changes opt-in only", () => {
    for (const flag of ["--with-swap", "--with-journald", "--with-firewall", "--with-fail2ban"]) expect(script).toContain(flag + ")");
    expect(script).toContain("if [[ $WITH_SWAP == 1 ]]");
    expect(script).toContain("if [[ $WITH_JOURNALD == 1 ]]");
    expect(script).toContain("if [[ $WITH_FIREWALL == 1 ]]");
    expect(script).toContain("if [[ $WITH_FAIL2BAN == 1 ]]");
    expect(script).not.toMatch(/apt-get install[^\n]*unattended-upgrades/);
    expect(script).not.toMatch(/apt-get (upgrade|dist-upgrade)/);
    expect(script).not.toMatch(/ufw (enable|--force)/);
  });

  it("installs a supported Node 24 into an isolated, versioned directory and never deletes an existing one", () => {
    expect(script).toMatch(/NODE_VERSION="\$\{NODE_VERSION:-24\.\d+\.\d+\}"/);
    expect(script).toContain("sha256sum -c");
    expect(script).toContain('NODE_DIR="$NODE_ROOT/node-v$NODE_VERSION"');
    expect(script).toContain("ln -sfn $NODE_DIR $NODE_ROOT/node");
    expect(script).toMatch(/It will NOT be deleted or replaced/);
    expect(script).not.toContain("rm -rf /opt/localians");
    expect(script).not.toContain("rm -rf $NODE_ROOT");
    expect(script).not.toMatch(/rm -rf[^\n]*\/opt\/localians\/node/);
  });

  it("fails safely in preflight, before any change, on conflicts", () => {
    expect(script.indexOf("Preflight (read-only")).toBeLessThan(script.indexOf("Packages (only what is missing"));
    expect(script).toMatch(/\(\(FAILS > 0\)\)[\s\S]*exit 2/);
    for (const what of ["port $p is already used", "nginx -t fails", "service $svc is not running", "refusing to take it over", "only one of role/database"]) expect(script).toContain(what);
  });

  it("keeps the systemd units pointed at the symlinked Node", () => {
    for (const unit of ["localians-web", "localians-gateway"]) expect(read("deploy/systemd/" + unit + ".service")).toContain("/opt/localians/node/bin/node");
  });
});

describe("production install and Prisma config (regression: Cannot find module 'dotenv/config')", () => {
  // web.env exports NODE_ENV=production; npm then omits devDependencies, so build-time packages vanished.
  const deploy = read("deploy/scripts/deploy.sh");
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

  it("deploy.sh installs devDependencies whatever npm production settings are inherited", () => {
    const install = deploy.match(/\(\n\s*unset ([^\n]+)\n\s*npm ci ([^\n]+)\n\)/);
    expect(install, "npm ci must run in a subshell that unsets the inherited npm settings").not.toBeNull();
    for (const name of ["NODE_ENV", "NPM_CONFIG_PRODUCTION", "NPM_CONFIG_OMIT", "npm_config_production", "npm_config_omit"]) expect(install![1]).toContain(name);
    expect(install![2]).toContain("--include=dev");
    expect(deploy.indexOf("npm ci")).toBeGreaterThan(deploy.indexOf('. "$ENV_DIR/web.env"')); // i.e. the problem case: NODE_ENV is already exported
    expect(deploy.indexOf("npm ci")).toBeLessThan(deploy.indexOf("npm run build"));
    expect(deploy.match(/^npm ci /gm)).toBeNull(); // no unprotected install
  });

  it("deploy.sh stops early if a build tool is missing after the install", () => {
    for (const tool of ["node_modules/.bin/prisma", "node_modules/.bin/next", "node_modules/tailwindcss/package.json"]) expect(deploy).toContain(tool);
    expect(deploy).toContain("Install is incomplete");
  });

  it("the build tools the deploy relies on are devDependencies (so --include=dev is required)", () => {
    for (const name of ["prisma", "tailwindcss", "@tailwindcss/postcss", "typescript", "esbuild"]) expect(pkg.devDependencies[name], name).toBeDefined();
  });

  it("prisma.config.ts needs no package other than prisma (no dotenv)", () => {
    const imports = [...read("prisma.config.ts").matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["prisma/config"]);
    expect(pkg.dependencies.dotenv ?? pkg.devDependencies.dotenv).toBeUndefined();
  });

  it("prisma.config.ts loads under NODE_ENV=production with no .env file and keeps DATABASE_URL from the environment", () => {
    // A scratch directory inside the repo (so `prisma/config` resolves) but outside node_modules (Node won't strip types there).
    const dir = fs.mkdtempSync(path.join(root, ".tmp-prisma-config-"));
    try {
      fs.copyFileSync(path.join(root, "prisma.config.ts"), path.join(dir, "prisma.config.ts"));
      const res = spawnSync(process.execPath, ["-e", "import('./prisma.config.ts').then((m) => console.log(m.default.datasource.url))"], {
        cwd: dir,
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/prod" },
      });
      expect(res.stderr).not.toContain("Cannot find module");
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("postgresql://u:p@127.0.0.1:5432/prod");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deploy pipeline under NODE_ENV=production (regression: Cannot find module '@tailwindcss/postcss')", () => {
  const deploy = read("deploy/scripts/deploy.sh");
  const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };

  it("every build-time tool the pipeline runs is a devDependency installed by the guarded npm ci", () => {
    // postcss.config -> Next build (tailwind), tunnel:build -> esbuild, migrations -> prisma, type checks during next build -> typescript
    expect(read("postcss.config.mjs")).toContain("@tailwindcss/postcss");
    expect(read("scripts/build-tunnel.mjs")).toMatch(/esbuild/);
    for (const name of ["@tailwindcss/postcss", "tailwindcss", "postcss", "esbuild", "prisma", "typescript", "@types/node", "@types/react"]) expect(pkg.devDependencies[name], name).toBeDefined();
    const ciIndex = deploy.indexOf("npm ci --include=dev");
    for (const step of ["npm run build", "npm run tunnel:build", "npx prisma migrate deploy"]) expect(deploy.indexOf(step), step).toBeGreaterThan(ciIndex);
    expect(deploy).toContain("node_modules/@tailwindcss/postcss/package.json"); // the module that failed on the server must be checked directly
  });

  it("refreshes a stale /srv/localians/bin/deploy.sh from the release and re-runs it, once", () => {
    // The server keeps a copy made at install time; an old copy (without the fix) must not run the install.
    expect(deploy.indexOf("LOCALIANS_DEPLOY_REEXEC")).toBeGreaterThan(-1);
    expect(deploy.indexOf("LOCALIANS_DEPLOY_REEXEC")).toBeLessThan(deploy.indexOf("npm ci"));
    expect(deploy.indexOf("LOCALIANS_DEPLOY_REEXEC")).toBeLessThan(deploy.indexOf("check-production-env.mjs"));
    expect(read("deploy/scripts/install.sh")).toMatch(/-o root -g root -m 750 "\$HERE"\/scripts\/\{restore,verify-restore,healthcheck\}\.sh/);
  });

  it("really does it: a stale bin/deploy.sh is replaced by the release's copy and not run again in a loop", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians-deploy-"));
    const lf = (s: string) => s.split(String.fromCharCode(13)).join(""); // Windows checkouts use CRLF; git archive emits LF
    const sh = (cwd: string, args: string[], env: Record<string, string> = {}) =>
      spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", ...env } });
    try {
      const server = path.join(tmp, "srv");
      const envDir = path.join(tmp, "etc");
      const repo = path.join(server, "repo");
      for (const d of [path.join(server, "bin"), path.join(server, "releases"), repo, envDir]) fs.mkdirSync(d, { recursive: true });
      for (const f of ["web.env", "gateway.env"]) fs.writeFileSync(path.join(envDir, f), 'NODE_ENV="production"\n');
      fs.mkdirSync(path.join(repo, "deploy", "scripts"), { recursive: true });
      fs.writeFileSync(path.join(repo, "deploy", "scripts", "deploy.sh"), read("deploy/scripts/deploy.sh"));
      fs.writeFileSync(path.join(repo, "deploy", "scripts", "backup.sh"), "#!/usr/bin/env bash\n# new backup\n");
      expect(sh(repo, ["git", "init", "-q", "-b", "main"]).status).toBe(0);
      expect(sh(repo, ["git", "remote", "add", "origin", repo]).status).toBe(0);
      expect(sh(repo, ["git", "add", "-A"]).status).toBe(0);
      expect(sh(repo, ["git", "commit", "-q", "-m", "release"]).status).toBe(0);
      const stale = path.join(server, "bin", "deploy.sh");
      fs.writeFileSync(stale, read("deploy/scripts/deploy.sh").replace("npm ci --include=dev", "npm ci")); // the pre-fix script
      const res = sh(server, ["bash", stale, "main"], { LOCALIANS_ROOT: server, LOCALIANS_ENV_DIR: envDir });
      const out = res.stdout + res.stderr;
      expect(out.match(/out of date — updating it/g)).toHaveLength(1); // refreshed once, no loop
      expect(out.match(/^release /gm)?.length).toBe(2); // stale run + re-run
      expect(lf(fs.readFileSync(stale, "utf8"))).toBe(lf(read("deploy/scripts/deploy.sh"))); // now the release's script
      expect(fs.readFileSync(path.join(server, "bin", "backup.sh"), "utf8")).toContain("# new backup");
      expect(fs.readdirSync(path.join(server, "releases"))).toHaveLength(1); // the discarded release directory was cleaned up
      expect(res.status).not.toBe(0); // it stops at the (missing) env checker in this fake layout, after the refresh
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
