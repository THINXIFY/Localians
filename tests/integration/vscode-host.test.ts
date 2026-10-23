// The VS Code extension inside a REAL VS Code (Extension Development Host), against the real control plane, gateway and
// a local app. The in-host checks live in extensions/vscode/test/host/suite.ts; this file starts everything around them.
//
// Opt-in, because it opens VS Code windows: `npm run vscode:test [version]` downloads a separate stable build into ~/.cache/localians-vscode-test (outside the project, so dev servers do not watch it)
// (LOCALIANS_VSCODE_DOWNLOAD=1, optionally LOCALIANS_VSCODE_VERSION and LOCALIANS_VSIX_PATH to test an existing .vsix; the extension supports 1.90+), or set VSCODE_EXECUTABLE_PATH to
// use an installed one. Otherwise this test is skipped.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "@tunnel/cli/api";
import type { Gateway } from "@tunnel/gateway/gateway";
import { Auth } from "../../extensions/vscode/src/core/auth";
import { projectInputSchema } from "@/lib/validation/project";
import { decideDeviceAuthorization } from "@/server/cli/device";
import { resetLiveTunnelCache } from "@/server/cli/gateway-control";
import { prisma } from "@/server/db";
import { createProject } from "@/server/projects";
import { createVerifiedUser } from "./helpers";
import { GATEWAY_API_SECRET, PREVIEW_DOMAIN, startControlPlane, startLocalApp, startTestGateway, TUNNEL_TOKEN_SECRET, waitFor } from "./tunnel-harness";

const root = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(root, "extensions", "vscode");

/** VS Code's command-line entry (cli.js) next to the executable (the archive keeps it under a commit-named folder). */
function findCliJs(executable: string): string {
  const dir = path.dirname(executable);
  const direct = path.join(dir, "resources", "app", "out", "cli.js");
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const nested = path.join(dir, entry.name, "resources", "app", "out", "cli.js");
    if (entry.isDirectory() && fs.existsSync(nested)) return nested;
  }
  throw new Error(`cli.js not found next to ${executable}`);
}

const download = process.env.LOCALIANS_VSCODE_DOWNLOAD === "1";
const fromEnv = process.env.VSCODE_EXECUTABLE_PATH && fs.existsSync(process.env.VSCODE_EXECUTABLE_PATH) ? process.env.VSCODE_EXECUTABLE_PATH : null;
const vscodeExe = download ? null : fromEnv;
// Opt-in (npm run vscode:test): it opens VS Code windows, so `npm test` skips it.
const canRun = Boolean(vscodeExe) || download;

let controlPlane: Awaited<ReturnType<typeof startControlPlane>>;
let gateway: Gateway;
let gatewayPort: number;
let app: Awaited<ReturnType<typeof startLocalApp>>;
let tmp: string;

beforeAll(async () => {
  if (!canRun) return;
  Object.assign(process.env, { TUNNEL_PREVIEW_DOMAIN: PREVIEW_DOMAIN, TUNNEL_TOKEN_SECRET, GATEWAY_API_SECRET, TUNNEL_PUBLIC_SCHEME: "http", CLI_DEVICE_RATE_LIMIT: "1000" });
  controlPlane = await startControlPlane();
  const started = await startTestGateway(controlPlane.url);
  gateway = started.gateway;
  gatewayPort = started.port;
  process.env.TUNNEL_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}`;
  process.env.TUNNEL_PUBLIC_PORT = String(gatewayPort);
  process.env.GATEWAY_CONTROL_URL = started.adminUrl;
  resetLiveTunnelCache();
  app = await startLocalApp();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localians-vscode-host-"));
});

afterAll(async () => {
  await app?.close();
  await gateway?.close();
  await controlPlane?.close();
  if (tmp && process.env.LOCALIANS_KEEP_HOST_TMP !== "1") fs.rmSync(tmp, { recursive: true, force: true });
  else if (tmp) console.log(`VS Code host test files kept in ${tmp}`);
});

/** A sign-in exactly as the extension would store it: browser approval (done here by the user's own account). */
async function signIn(userId: string) {
  const auth = new Auth({ get: async () => undefined, store: async () => undefined, delete: async () => undefined }, "localians-vscode/host-test");
  return auth.signIn(controlPlane.url, "VS Code host test (real)", {
    open: async (_url, code) => {
      await decideDeviceAuthorization(userId, code, true);
      return true;
    },
    isCancelled: () => false,
    sleep: () => new Promise((r) => setTimeout(r, 20)),
  });
}

describe.skipIf(!canRun)("VS Code extension in a real VS Code (Extension Development Host)", () => {
  it("activates, keeps the sign-in in real SecretStorage across a restart, shares, copies, stops, recovers from a revoked sign-in, and stops its links when VS Code closes", async () => {
    const { downloadAndUnzipVSCode } = await import("@vscode/test-electron");
    const executable = vscodeExe ?? (await downloadAndUnzipVSCode({ version: process.env.LOCALIANS_VSCODE_VERSION ?? "stable", cachePath: path.join(os.homedir(), ".cache", "localians-vscode-test") }));

    // The extension exactly as shipped: the real .vsix, installed into a clean VS Code the way a user installs it.
    const vsixDir = path.join(tmp, "vsix");
    if (process.env.LOCALIANS_VSIX_PATH) {
      // Test one specific, already built file (the release candidate) instead of building a new one.
      fs.mkdirSync(vsixDir, { recursive: true });
      fs.copyFileSync(process.env.LOCALIANS_VSIX_PATH, path.join(vsixDir, path.basename(process.env.LOCALIANS_VSIX_PATH)));
    } else {
      execFileSync(process.execPath, [path.join(extensionRoot, "scripts", "package.mjs"), "--out-dir", vsixDir], { cwd: extensionRoot, stdio: "pipe" });
    }
    const vsix = fs.readdirSync(vsixDir).find((n) => n.endsWith(".vsix"))!;
    const version = (JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8")) as { version: string }).version;
    // The in-host checks ship as a tiny second extension that runs them when VS Code starts, then quits VS Code.
    const driverDir = path.join(tmp, "driver-extension");
    fs.mkdirSync(driverDir, { recursive: true });
    fs.writeFileSync(path.join(driverDir, "package.json"), JSON.stringify({ name: "localians-host-driver", publisher: "localians-test", version: "0.0.0", engines: { vscode: "^1.90.0" }, main: "./driver.js", activationEvents: ["onStartupFinished"], extensionDependencies: ["thinxify.localians"] }));
    await build({ entryPoints: [path.join(extensionRoot, "test", "host", "suite.ts")], outfile: path.join(driverDir, "driver.js"), bundle: true, platform: "node", format: "cjs", target: "node20", external: ["vscode"], logLevel: "silent" });

    // A user, a project on the local app's port, and two sign-ins (the second is used after the first is revoked).
    const { user } = await createVerifiedUser("Host Test User");
    const project = await createProject(user.id, projectInputSchema.parse({ name: "Host Shop", description: "", framework: "NEXTJS", defaultPort: String(app.port) }));
    const first = await signIn(user.id);
    const second = await signIn(user.id);
    fs.writeFileSync(path.join(tmp, "credentials.json"), JSON.stringify(first));
    fs.writeFileSync(path.join(tmp, "credentials.fresh.json"), JSON.stringify(second));

    // A clean VS Code profile with the test server, the local app's port and no prompts.
    const userData = path.join(tmp, "user-data");
    const extensions = path.join(tmp, "extensions");
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "ELECTRON_RUN_AS_NODE" && !k.startsWith("VSCODE_"))) as NodeJS.ProcessEnv;
    const cliEnv = { ...cleanEnv, ELECTRON_RUN_AS_NODE: "1" };
    const cli = findCliJs(executable);
    const install = execFileSync(executable, [cli, "--install-extension", path.join(vsixDir, vsix), "--user-data-dir", userData, "--extensions-dir", extensions], { env: cliEnv, encoding: "utf8" });
    expect(install).toContain("successfully installed");
    const listed = execFileSync(executable, [cli, "--list-extensions", "--show-versions", "--user-data-dir", userData, "--extensions-dir", extensions], { env: cliEnv, encoding: "utf8" });
    expect(listed).toContain(`thinxify.localians@${version}`);
    const workspace = path.join(tmp, "workspace");
    fs.mkdirSync(path.join(userData, "User"), { recursive: true });
    fs.mkdirSync(extensions, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, "package.json"), JSON.stringify({ name: "host-shop", scripts: { dev: "next dev" }, dependencies: { next: "15.0.0" } }));
    fs.writeFileSync(
      path.join(userData, "User", "settings.json"),
      JSON.stringify({
        "localians.serverUrl": controlPlane.url,
        "localians.extraPorts": [app.port],
        "security.workspace.trust.enabled": false,
        "update.mode": "none",
        "telemetry.telemetryLevel": "off",
        "workbench.startupEditor": "none",
        "extensions.autoUpdate": false,
        "extensions.ignoreRecommendations": true,
        "window.dialogStyle": "custom",
      }),
    );

    const base = { phase: "seed" as const, credentialsFile: path.join(tmp, "credentials.json"), resultFile: path.join(tmp, "result.json"), server: controlPlane.url, gatewayPort, appPort: app.port, projectId: project.id, projectName: project.name, email: user.email };
    // Tests may themselves run inside VS Code (an integrated terminal or another extension host): its ELECTRON_RUN_AS_NODE
    // would make the launched VS Code behave like plain Node, and its VSCODE_* variables would attach it to THAT window.
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => k === "ELECTRON_RUN_AS_NODE" || k.startsWith("VSCODE_")));
    for (const k of Object.keys(inherited)) delete process.env[k];
    const runPhase = async (phase: "seed" | "run") => {
      const config = path.join(tmp, `config-${phase}.json`);
      fs.writeFileSync(config, JSON.stringify({ ...base, phase }));
      const marker = (kind: "done" | "error") => `${base.resultFile}.${phase}.${kind}`;
      const args = [
        workspace,
        // The Localians extension is the installed .vsix; only the checks run from a development folder.
        `--extensionDevelopmentPath=${driverDir}`,
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensions}`,
        "--disable-workspace-trust",
        "--skip-release-notes",
        "--skip-welcome",
        "--disable-telemetry",
        "--new-window",
        // Headless Linux (CI): no sandbox helper and no desktop keyring.
        ...(process.platform === "linux" ? ["--no-sandbox", "--password-store=basic"] : []),
      ];
      // No shell: the paths in this repository contain spaces.
      const child = spawn(executable, args, { env: { ...process.env, LOCALIANS_HOST_CONFIG: config }, stdio: "ignore", windowsHide: false });
      const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
      const timeout = setTimeout(() => {
        if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGKILL");
      }, 150_000);
      await exited;
      clearTimeout(timeout);
      if (fs.existsSync(marker("error"))) throw new Error(`${phase} phase failed in VS Code:
${fs.readFileSync(marker("error"), "utf8")}`);
      if (!fs.existsSync(marker("done"))) throw new Error(`${phase} phase did not finish: VS Code exited or timed out before the checks completed.`);
    };

    try {
      await runPhase("seed"); // throws with the failing assertion if the contract checks fail
      await runPhase("run"); //  a fresh VS Code: SecretStorage → projects → share → copy → stop → revoked sign-in → share again
    } finally {
      Object.assign(process.env, inherited);
    }

    // VS Code is closed now: the link its last share was serving must have been stopped (deactivate → stopAll).
    const { sessionId } = JSON.parse(fs.readFileSync(path.join(tmp, "result.json"), "utf8")) as { sessionId: string };
    await waitFor(async () => (await prisma.tunnelSession.findUniqueOrThrow({ where: { id: sessionId } })).status !== "CONNECTED", 20_000, "VS Code closed → share stopped");

    // Nothing stored the token outside SecretStorage: not in settings, workspace files or VS Code's logs.
    const leaks: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (!/(\.vscdb|state\.vscdb(\.backup)?|Cookies|Local Storage|Session Storage|\.ldb|\.log)$/.test(entry.name) || /\.log$/.test(entry.name)) {
          if (entry.name === "credentials.json" || entry.name === "credentials.fresh.json") continue;
          if (fs.statSync(full).size < 20_000_000 && (fs.readFileSync(full).includes(first.token) || fs.readFileSync(full).includes(second.token))) leaks.push(full);
        }
      }
    };
    walk(userData);
    walk(workspace);
    expect(leaks).toEqual([]);
    // The token is only valid server-side as a revocable CLI credential, never a dashboard session.
    await expect(createApi(controlPlane.url, first.token, "t").me()).rejects.toMatchObject({ status: 401 }); // revoked in step 5
  }, 900_000); // includes a first-time VS Code download (~350 MB)
});
