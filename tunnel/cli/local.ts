import fs from "node:fs";
import net from "node:net";
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

/** Best-effort framework detection from the current directory's package.json. */
export function detectProject(cwd: string) {
  let name = path.basename(cwd);
  let framework: string | null = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (pkg.name) name = pkg.name.replace(/^@[^/]+\//, "");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) framework = "NEXTJS";
    else if (deps["@angular/core"]) framework = "ANGULAR";
    else if (deps.vue) framework = "VUE";
    else if (deps.vite || deps.react) framework = "REACT_VITE";
    else if (Object.keys(deps).length) framework = "NODEJS";
  } catch {
    // No package.json: fall back to the folder name.
  }
  return { name: name.slice(0, 80) || "My app", framework };
}
