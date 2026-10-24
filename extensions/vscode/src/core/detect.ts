import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { detectProject, findLocalAddress, type LoopbackAddress } from "@tunnel/cli/local";

/**
 * Finding apps to share, without intrusive scanning:
 * - only this machine's loopback addresses (127.0.0.1 / ::1) are ever contacted,
 * - only a short, fixed list of common dev-server ports, plus ports suggested by the open workspace and the
 *   user's `localians.extraPorts`,
 * - one small `GET /` per open port, to confirm it really is an HTTP server.
 * Nothing is shared until the user picks an app and confirms.
 */
export const COMMON_PORTS = [3000, 3001, 3002, 4000, 4200, 4321, 5000, 5173, 5174, 8000, 8080, 8888] as const;
export const MAX_PORTS = 40;

export type RunningApp = { port: number; address: LoopbackAddress; framework: string | null; title: string | null };

export type WorkspaceApp = {
  /** Suggested project name (package.json name, pyproject name, … or folder). */
  name: string;
  /** Framework label shown to the user, e.g. "Next.js". */
  framework: string | null;
  /** Localians project framework value (NEXTJS, …) for new projects. */
  frameworkValue: string | null;
  /** The usual dev-server port for that framework, if any. */
  port: number | null;
  folder: string;
};

export type AppSuggestion = RunningApp & { name: string | null; frameworkValue: string | null; folder: string | null };

type Known = { label: string; value: string | null; port: number };
// Order matters: meta-frameworks before the libraries they use.
const NODE_FRAMEWORKS: [dependency: string, known: Known][] = [
  ["next", { label: "Next.js", value: "NEXTJS", port: 3000 }],
  ["nuxt", { label: "Nuxt", value: "VUE", port: 3000 }],
  ["@remix-run/dev", { label: "Remix", value: "REACT_VITE", port: 5173 }],
  ["@sveltejs/kit", { label: "SvelteKit", value: "OTHER", port: 5173 }],
  ["astro", { label: "Astro", value: "OTHER", port: 4321 }],
  ["@angular/core", { label: "Angular", value: "ANGULAR", port: 4200 }],
  ["gatsby", { label: "Gatsby", value: "REACT_VITE", port: 8000 }],
  ["react-scripts", { label: "React", value: "REACT_VITE", port: 3000 }],
  ["@vue/cli-service", { label: "Vue", value: "VUE", port: 8080 }],
  ["svelte", { label: "Svelte", value: "OTHER", port: 5173 }],
  ["vue", { label: "Vue", value: "VUE", port: 5173 }],
  ["vite", { label: "Vite", value: "REACT_VITE", port: 5173 }],
  ["@nestjs/core", { label: "NestJS", value: "NODEJS", port: 3000 }],
  ["express", { label: "Express", value: "NODEJS", port: 3000 }],
  ["fastify", { label: "Fastify", value: "NODEJS", port: 3000 }],
];

const read = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** What kind of app lives in `folder` (one directory, no walking up), or null if nothing recognisable. */
export function describeFolder(folder: string): WorkspaceApp | null {
  const name = detectProject(folder, path.dirname(folder)).name;
  const pkgText = read(path.join(folder, "package.json"));
  if (pkgText !== null) {
    let deps: Record<string, string> = {};
    try {
      const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // a broken package.json still marks an app folder
    }
    const hit = NODE_FRAMEWORKS.find(([dep]) => dep in deps)?.[1];
    return { name, framework: hit?.label ?? (Object.keys(deps).length ? "Node.js" : null), frameworkValue: hit?.value ?? null, port: hit?.port ?? null, folder };
  }
  const python = [read(path.join(folder, "requirements.txt")), read(path.join(folder, "pyproject.toml")), read(path.join(folder, "Pipfile"))].join("\n").toLowerCase();
  if (fs.existsSync(path.join(folder, "manage.py")) || /\bdjango\b/.test(python)) return { name, framework: "Django", frameworkValue: "OTHER", port: 8000, folder };
  if (/\bfastapi\b/.test(python)) return { name, framework: "FastAPI", frameworkValue: "OTHER", port: 8000, folder };
  if (/\bflask\b/.test(python)) return { name, framework: "Flask", frameworkValue: "OTHER", port: 5000, folder };
  const gemfile = read(path.join(folder, "Gemfile"));
  if (gemfile !== null) return { name, framework: /\brails\b/.test(gemfile) ? "Rails" : "Ruby", frameworkValue: "OTHER", port: 3000, folder };
  if (fs.existsSync(path.join(folder, "composer.json"))) return { name, framework: "PHP", frameworkValue: "OTHER", port: 8000, folder };
  if (fs.existsSync(path.join(folder, "go.mod"))) return { name, framework: "Go", frameworkValue: "OTHER", port: 8080, folder };
  if (fs.existsSync(path.join(folder, "index.html"))) return { name, framework: "Static site", frameworkValue: "OTHER", port: null, folder };
  return null;
}

const MONOREPO_DIRS = ["apps", "packages", "services", "frontend", "backend", "web", "client", "server", "site", "api"];
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", "venv", ".venv", "__pycache__", "vendor", "target"]);

/**
 * Apps in the open workspace folders: each root, plus (bounded) monorepo children such as apps/* and packages/*.
 * Reads only manifest files; never runs anything.
 */
export function detectWorkspaceApps(roots: string[], limit = 24): WorkspaceApp[] {
  const found: WorkspaceApp[] = [];
  const seen = new Set<string>();
  const visit = (folder: string) => {
    const key = path.resolve(folder).toLowerCase();
    if (seen.has(key) || found.length >= limit) return;
    seen.add(key);
    const app = describeFolder(folder);
    // Only folders that run a dev server (libraries such as a shared UI package have no port of their own).
    if (app && (app.port || app.framework === "Static site")) found.push(app);
  };
  const children = (folder: string) => {
    try {
      return fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !SKIP.has(d.name) && !d.name.startsWith("."))
        .map((d) => path.join(folder, d.name));
    } catch {
      return [];
    }
  };
  for (const root of roots) {
    visit(root);
    for (const dir of children(root)) {
      if (MONOREPO_DIRS.includes(path.basename(dir).toLowerCase())) {
        visit(dir);
        for (const pkg of children(dir).slice(0, 30)) visit(pkg);
      } else if (fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, "manage.py"))) {
        visit(dir);
      }
    }
  }
  return found;
}

/** Guesses the framework from what the server answered (headers / first bytes of HTML). */
export function frameworkFromResponse(headers: http.IncomingHttpHeaders, body: string): string | null {
  const powered = String(headers["x-powered-by"] ?? "").toLowerCase();
  const server = String(headers.server ?? "").toLowerCase();
  if (powered.includes("next.js") || body.includes("/_next/")) return "Next.js";
  if (body.includes("/@vite/client")) return "Vite";
  if (/ng-version=/.test(body)) return "Angular";
  if (body.includes("__nuxt")) return "Nuxt";
  if (powered.includes("express")) return "Express";
  if (server.includes("werkzeug")) return "Flask";
  if (server.includes("wsgiserver") || String(headers["set-cookie"] ?? "").includes("csrftoken")) return "Django";
  if (server.includes("uvicorn")) return "FastAPI";
  return null;
}

/**
 * Is there an HTTP server on localhost:<port>? Contacts loopback only. Dev servers can take a few seconds to answer the
 * first request while they compile, so the wait is generous; probes run in parallel.
 */
export async function probe(port: number, timeoutMs = 5000): Promise<RunningApp | null> {
  const address = await findLocalAddress(port);
  if (!address) return null;
  return new Promise((resolve) => {
    const req = http.get(
      { host: address, port, path: "/", headers: { accept: "text/html,*/*", "user-agent": "localians-vscode-probe" }, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("error", () => undefined); // reset mid-body: what arrived is enough
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 32_768) res.destroy();
        });
        const finish = () => {
          const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(body)?.[1]?.trim() ?? null;
          resolve({ port, address, framework: frameworkFromResponse(res.headers, body), title });
        };
        res.on("end", finish);
        res.on("close", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null)); // not HTTP (or not answering): not offered
  });
}

/** The ports worth checking: common ones, the workspace's frameworks, and the user's extra ports (deduplicated, capped). */
export function portsToCheck(workspaceApps: WorkspaceApp[], extra: unknown[] = []): number[] {
  const valid = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 65535;
  const ports = [...workspaceApps.map((a) => a.port), ...extra, ...COMMON_PORTS].filter(valid);
  return [...new Set(ports)].slice(0, MAX_PORTS);
}

/**
 * Running apps, each labelled with a workspace app only when that is unambiguous: the only running server of its
 * framework family and the only workspace app of that family (or, when the server doesn't reveal its framework, the
 * only workspace app whose usual port it is). Another project's server on the same default port — say, a different
 * Next.js app on 3000 — is never mistaken for this one. Workspace matches first, then by port.
 */
export async function findRunningApps(workspaceApps: WorkspaceApp[], ports: number[]): Promise<AppSuggestion[]> {
  const running = (await Promise.all(ports.map((p) => probe(p)))).filter((a): a is RunningApp => a !== null);
  const suggestions = running.map((app) => {
    let match: WorkspaceApp | undefined;
    if (app.framework) {
      const runningSame = running.filter((r) => r.framework && sameFamily(r.framework, app.framework!));
      const workspaceSame = workspaceApps.filter((w) => w.framework && sameFamily(w.framework, app.framework!));
      if (runningSame.length === 1 && workspaceSame.length === 1) match = workspaceSame[0];
    } else {
      const onPort = workspaceApps.filter((w) => w.port === app.port);
      if (onPort.length === 1) match = onPort[0];
    }
    return { ...app, framework: app.framework ?? match?.framework ?? null, name: match?.name ?? null, frameworkValue: match?.frameworkValue ?? null, folder: match?.folder ?? null };
  });
  return suggestions.sort((a, b) => Number(Boolean(b.name)) - Number(Boolean(a.name)) || a.port - b.port);
}

/** A name for a new project for this running app: its own match, else the workspace app of the same framework. */
export function suggestProjectName(app: AppSuggestion, workspaceApps: WorkspaceApp[], fallback: string) {
  if (app.name) return app.name;
  const same = workspaceApps.filter((w) => app.framework && w.framework && sameFamily(w.framework, app.framework));
  if (same.length === 1) return same[0].name;
  // The workspace's only app, unless the running app is clearly something else (another framework).
  const only = workspaceApps.length === 1 ? workspaceApps[0] : null;
  if (only && !(app.framework && only.framework && !sameFamily(only.framework, app.framework))) return only.name;
  if (only) return app.title?.trim().slice(0, 80) || `${app.framework} app`;
  return fallback;
}

/** The Localians framework value for a new project, from a detected framework label. */
export function frameworkValueFor(label: string | null): string | null {
  if (!label) return null;
  return NODE_FRAMEWORKS.find(([, known]) => known.label === label)?.[1].value ?? (["Django", "Flask", "FastAPI"].includes(label) ? "OTHER" : null);
}

const FAMILY: Record<string, string> = { Vite: "vite", React: "vite", Vue: "vite", Svelte: "vite", SvelteKit: "vite", Remix: "vite", "Node.js": "node", Express: "node" };
const sameFamily = (a: string, b: string) => a === b || (FAMILY[a] ?? a) === (FAMILY[b] ?? b);
