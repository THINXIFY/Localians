/**
 * Runs INSIDE a real VS Code (the extension host) as a tiny "driver" extension next to the Localians extension — started
 * by tests/integration/vscode-host.test.ts against a real Localians control plane and gateway. (VS Code keeps storage in
 * memory under --extensionTestsPath, so a normal launch is the only way to prove SecretStorage survives a restart.)
 * Two launches, each ending with a graceful quit (which is also what flushes secrets to disk):
 *
 *   seed — contract checks, then the sign-in is written to the extension's SecretStorage;
 *   run  — a fresh VS Code loads it, lists projects, shares a running app, copies/stops, recovers from a revoked
 *          sign-in, and leaves a share running so the test can prove closing VS Code stops it.
 *
 * The extension's controller is reached through its documented `activate()` return value; private members are read
 * only to observe state (there is no UI automation API for quick picks or notifications).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import * as vscode from "vscode";

const SECRET_KEY = "localians.credentials.v1";
const EXTENSION_ID = "thinxify.localians";

type Env = { phase: "seed" | "run"; credentialsFile: string; resultFile: string; server: string; gatewayPort: number; appPort: number; projectId: string; projectName: string; email: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Anything = any;

const env = (): Env => JSON.parse(fs.readFileSync(process.env.LOCALIANS_HOST_CONFIG!, "utf8")) as Env;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, check: () => T | undefined | false | Promise<T | undefined | false>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${what}${last ? ` (${last instanceof Error ? last.message : String(last)})` : ""}`);
}

/** GET through the gateway the way a visitor's browser would (Host = the preview hostname). */
function visit(gatewayPort: number, publicUrl: string, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: gatewayPort, path, headers: { host: new URL(publicUrl).host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function controllerOf(): Promise<Anything> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is installed in the host`);
  const exports = (await extension.activate()) as { controller?: unknown } | undefined;
  assert.ok(exports?.controller, "activate() returns the controller");
  return exports.controller as Anything;
}

// ---------------------------------------------------------------------------------------------------- seed phase
async function seedPhase(e: Env) {
  const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
  assert.ok(extension, `the extension under development is loaded (found: ${vscode.extensions.all.filter((x) => !x.id.startsWith("vscode.")).map((x) => x.id).join(", ") || "none"}; ${vscode.extensions.all.length} built-in)`);
  const manifest = extension.packageJSON as Anything;
  assert.equal(manifest.publisher, "thinxify");
  assert.equal(manifest.name, "localians");

  const controller = await controllerOf();
  assert.equal(extension.isActive, true, "activates on startup");

  // Every contributed command is registered (a typo in package.json or a missing handler would show here).
  const registered = new Set(await vscode.commands.getCommands(true));
  for (const command of manifest.contributes.commands as { command: string }[]) assert.ok(registered.has(command.command), `command ${command.command} is registered`);
  assert.ok(registered.has("localians.statusMenu"));

  // Settings: defaults come from the manifest; the test overrides only the server (to its local control plane).
  const config = vscode.workspace.getConfiguration("localians");
  assert.equal(config.inspect("serverUrl")?.defaultValue, "https://localians.com");
  assert.equal(config.get("serverUrl"), e.server, "the test server is configured");
  assert.equal(config.get("hostHeader"), "rewrite");
  assert.equal(config.get("verboseLog"), false);

  // Signed out: nothing is signed in, the welcome view (not tree rows) is what the user sees.
  assert.equal(controller.credentials, null);
  assert.deepEqual(controller.tree.getChildren(), []);

  // Commands that need an account don't throw when signed out (they offer to connect instead).
  await vscode.commands.executeCommand("localians.copyLink"); // "nothing is being shared"
  await vscode.commands.executeCommand("localians.refresh");

  // Store the sign-in the way the extension does (its own SecretStorage), then end this VS Code.
  const credentials = fs.readFileSync(e.credentialsFile, "utf8");
  await controller.context.secrets.store(SECRET_KEY, credentials);
  assert.equal(await controller.context.secrets.get(SECRET_KEY), credentials);
}

// ---------------------------------------------------------------------------------------------------- run phase
async function runPhase(e: Env) {
  const controller = await controllerOf();

  // 1. The sign-in survived the restart in real SecretStorage, bound to this server.
  const stored = await controller.context.secrets.get(SECRET_KEY);
  await until(`credentials loaded from SecretStorage (secret present after restart: ${stored ? "yes" : "NO"}, server setting: ${vscode.workspace.getConfiguration("localians").get("serverUrl")})`, () => controller.credentials?.user.email === e.email, 5000);
  assert.equal(controller.credentials.apiUrl, e.server);

  // 2. Account, projects and the running app are found.
  await controller.refresh(true);
  assert.ok(controller.me.projects.some((p: { id: string }) => p.id === e.projectId), "the project is listed");
  await until("the local app is detected", () => controller.apps.some((a: { port: number }) => a.port === e.appPort));
  const sections = controller.tree.getChildren() as { label: string }[];
  assert.deepEqual(
    sections.map((s) => String(s.label)),
    ["Previews", "Local apps", "Account"],
  );
  const appRows = controller.tree.getChildren(sections[1]) as { label: string }[];
  assert.ok(appRows.some((r) => String(r.label).includes(`localhost:${e.appPort}`)), "the app row is in the tree");
  const accountRows = (controller.tree.getChildren(sections[2]) as { label: string; description?: string }[]).map((r) => `${r.label} ${r.description ?? ""}`).join(" | ");
  assert.ok(accountRows.includes(e.email), "the account row shows who is signed in");

  // 3. Share: connected only when confirmed, link copied, served through the gateway.
  const project = controller.me.projects.find((p: { id: string }) => p.id === e.projectId);
  const app = controller.apps.find((a: { port: number }) => a.port === e.appPort);
  void controller.connect(app, project, 60); // resolves when its "Sharing…" notification is dismissed: don't await
  const share = await until("the share connects", () => controller.shares.list().find((s: { status: string }) => s.status === "connected"));
  assert.match(share.publicUrl, /^http:\/\/[a-z2-7]{12}\./);
  assert.equal(share.durationMinutes, 60);
  await until("the link is on the clipboard", async () => (await vscode.env.clipboard.readText()) === share.publicUrl);
  assert.match(String(controller.status.text), new RegExp(`Sharing :${e.appPort}`));
  const served = await visit(e.gatewayPort, share.publicUrl, "/?q=in-vscode");
  assert.equal(served.status, 200);
  assert.ok(served.body.includes("q=in-vscode"), "the app is served through the preview link");
  const live = controller.tree.getChildren(controller.tree.getChildren()[0]) as { label: string }[];
  assert.ok(live.some((r) => String(r.label).includes(e.projectName)), "the preview is listed with its project");

  // 4. Copy through the command (as the tree's inline button does), then stop: the link stops working.
  await vscode.env.clipboard.writeText("something else");
  await vscode.commands.executeCommand("localians.copyLink", { kind: "share", sessionId: share.sessionId });
  assert.equal(await vscode.env.clipboard.readText(), share.publicUrl);
  await vscode.commands.executeCommand("localians.stop", { kind: "share", sessionId: share.sessionId });
  await until("the share stops", () => controller.shares.list().length === 0 || controller.shares.get(share.sessionId)?.status === "ended");
  await until("the link no longer works", async () => (await visit(e.gatewayPort, share.publicUrl, "/")).status === 404);

  // 5. A revoked sign-in is noticed and everything is cleaned up (the user is asked to connect again).
  void controller.connect(app, project, 60);
  const second = await until("the second share connects", () => controller.shares.list().find((s: { status: string; sessionId: string }) => s.status === "connected" && s.sessionId !== share.sessionId));
  const revoked = await fetch(`${e.server}/api/cli/logout`, { method: "POST", headers: { authorization: `Bearer ${controller.credentials.token}` } });
  assert.equal(revoked.status, 200);
  void controller.refresh(true); // 401 → "sign-in expired" (its notification stays open; don't await)
  await until("the extension drops the revoked sign-in", () => controller.credentials === null);
  assert.equal(await controller.context.secrets.get(SECRET_KEY), undefined, "the revoked token is removed from SecretStorage");
  await until("the share ended with the sign-in", () => controller.shares.get(second.sessionId)?.status === "ended" || controller.shares.list().length === 0);
  assert.deepEqual(controller.tree.getChildren(), [], "signed out again: the welcome view is shown");
  assert.match(String(controller.status.text), /Localians/);

  // 6. Sign in again with a fresh token (as the real flow stores it) and leave a share running: the test then closes
  //    VS Code and checks that its link was stopped by deactivate().
  const fresh = fs.readFileSync(e.credentialsFile.replace(/\.json$/, ".fresh.json"), "utf8");
  await controller.context.secrets.store(SECRET_KEY, fresh);
  controller.credentials = await controller.auth.load(e.server);
  assert.ok(controller.credentials, "the new sign-in loads");
  await controller.refresh(true);
  void controller.connect(app, controller.me.projects.find((p: { id: string }) => p.id === e.projectId), 60);
  const last = await until("the final share connects", () => controller.shares.list().find((s: { status: string }) => s.status === "connected"));
  fs.writeFileSync(e.resultFile, JSON.stringify({ sessionId: last.sessionId, publicUrl: last.publicUrl }));
}

/** The driver extension's entry point: run the phase, record the outcome, then quit VS Code like a user would. */
export function activate(): void {
  void (async () => {
    const e = env();
    try {
      if (e.phase === "seed") await seedPhase(e);
      else await runPhase(e);
      fs.writeFileSync(`${e.resultFile}.${e.phase}.done`, "ok");
    } catch (error) {
      fs.writeFileSync(`${e.resultFile}.${e.phase}.error`, error instanceof Error ? (error.stack ?? error.message) : String(error));
    } finally {
      await vscode.commands.executeCommand("workbench.action.quit");
    }
  })();
}
