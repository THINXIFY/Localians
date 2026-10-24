import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/** Only loopback targets are allowed: the CLI never forwards to other machines on the network. */
export const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1"] as const;
export type LoopbackAddress = (typeof LOOPBACK_ADDRESSES)[number];

export function isLoopback(host: string) {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h);
}

export function parsePort(input: string | undefined): number | null {
  if (!input || !/^\d{1,5}$/.test(input.trim())) return null;
  const port = Number(input);
  return port >= 1 && port <= 65535 ? port : null;
}

function canConnect(host: string, port: number, timeoutMs = 1500) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * Finds which loopback address the dev server listens on (IPv4 or IPv6 —
 * Vite and newer Node versions often bind `localhost` to ::1 only).
 */
export async function findLocalAddress(port: number): Promise<LoopbackAddress | null> {
  for (const address of LOOPBACK_ADDRESSES) if (await canConnect(address, port)) return address;
  return null;
}

const read = (file: string) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/** `name = "..."` inside a TOML [section] (enough for pyproject.toml and Cargo.toml; no TOML parser needed). */
function tomlName(text: string, section: string) {
  const start = text.indexOf(`[${section}]`);
  if (start < 0) return null;
  const body = text.slice(start + section.length + 2).split(/^\[/m)[0];
  return body.match(/^\s*name\s*=\s*["']([^"']+)["']/m)?.[1] ?? null;
}

type Detected = { name: string | null; framework: string | null };

/** One directory: the first project manifest found decides the name (and, for Node, the framework). */
function fromManifests(dir: string): Detected | null {
  const pkgText = read(path.join(dir, "package.json"));
  if (pkgText !== null) {
    try {
      const pkg = JSON.parse(pkgText) as { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const framework = deps.next
        ? "NEXTJS"
        : deps["@angular/core"]
          ? "ANGULAR"
          : deps.vue
            ? "VUE"
            : deps.vite || deps.react
              ? "REACT_VITE"
              : Object.keys(deps).length
                ? "NODEJS"
                : null;
      return { name: pkg.name?.replace(/^@[^/]+\//, "") || null, framework };
    } catch {
      return { name: null, framework: null }; // a broken package.json still marks the project root
    }
  }
  const pyproject = read(path.join(dir, "pyproject.toml"));
  if (pyproject !== null) return { name: tomlName(pyproject, "project") ?? tomlName(pyproject, "tool.poetry"), framework: null };
  const cargo = read(path.join(dir, "Cargo.toml"));
  if (cargo !== null) return { name: tomlName(cargo, "package"), framework: null };
  const composer = read(path.join(dir, "composer.json"));
  if (composer !== null) {
    try {
      return { name: (JSON.parse(composer) as { name?: string }).name?.split("/").pop() || null, framework: null };
    } catch {
      return { name: null, framework: null };
    }
  }
  const goMod = read(path.join(dir, "go.mod"));
  if (goMod !== null) return { name: goMod.match(/^module\s+(\S+)/m)?.[1].split("/").pop() ?? null, framework: null };
  for (const marker of ["Gemfile", "manage.py", "requirements.txt", "index.html"]) if (fs.existsSync(path.join(dir, marker))) return { name: null, framework: null };
  return null;
}

/** Trims, collapses whitespace and caps the length; the name is otherwise kept as the developer wrote it. */
const tidy = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 80);

/**
 * Best-effort project name and framework for a new project, from where the command is run.
 * Walks up from `cwd` to the nearest project root (package.json, pyproject.toml, Cargo.toml, composer.json, go.mod,
 * Gemfile, …) so running from a subfolder like `src/` still finds the app. Never uses the home directory or the
 * filesystem root as a name. `root` is that folder (where the command is run, if no manifest was found): the key the
 * CLI remembers this app's project under.
 */
export function detectProject(cwd: string, home = os.homedir()) {
  const stop = new Set([path.resolve(home), path.parse(path.resolve(cwd)).root]);
  let dir = path.resolve(cwd);
  for (let depth = 0; depth < 6 && !stop.has(dir); depth++) {
    const found = fromManifests(dir);
    if (found) return { name: tidy(found.name ?? path.basename(dir)) || "My app", framework: found.framework, root: dir };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const here = path.resolve(cwd);
  return { name: stop.has(here) ? "My app" : tidy(path.basename(here)) || "My app", framework: null, root: here };
}
