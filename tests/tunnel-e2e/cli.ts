import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TUNNEL_E2E } from "./env";

export const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "localians-e2e-"));

/**
 * Runs the bundled CLI as a real child process (as a developer would). LOCALIANS_E2E_CLI points at another build,
 * e.g. the copy installed from the packed npm tarball (release checks).
 */
const CLI_PATH = process.env.LOCALIANS_E2E_CLI ?? path.join(TUNNEL_E2E.root, "tunnel/cli/dist/localians.js");

export function runCli(args: string[], cwd = TUNNEL_E2E.root) {
  const proc: ChildProcess = spawn(process.execPath, [CLI_PATH, ...args], {
    cwd,
    env: {
      ...(Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "FORCE_COLOR")) as NodeJS.ProcessEnv),
      LOCALIANS_CONFIG_DIR: configDir,
      LOCALIANS_API_URL: TUNNEL_E2E.apiUrl,
      // The CLI verifies the gateway's TLS certificate against the local test CA.
      NODE_EXTRA_CA_CERTS: path.join(TUNNEL_E2E.certs, "ca.crt"),
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  proc.stdout!.on("data", (d) => (output += d.toString()));
  proc.stderr!.on("data", (d) => (output += d.toString()));
  const exited = new Promise<number>((resolve) => proc.on("exit", (code) => resolve(code ?? -1)));

  return {
    proc,
    exited,
    get output() {
      return output;
    },
    async waitFor(pattern: RegExp, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = pattern.exec(output);
        if (match) return match;
        if (proc.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`CLI output never matched ${pattern}.\n--- output ---\n${output}`);
    },
  };
}
