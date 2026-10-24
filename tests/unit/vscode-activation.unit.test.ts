import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../../extensions/vscode/src/extension";
import { SECRET_KEY } from "../../extensions/vscode/src/core/auth";
import { _events, fake } from "../setup/fake-vscode";

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../extensions/vscode/package.json"), "utf8")) as {
  version: string;
  contributes: {
    commands: { command: string; title: string }[];
    configuration: { properties: Record<string, { scope?: string; default?: unknown }> };
    views: Record<string, { type?: string; id: string }[]>;
    menus: Record<string, { command: string }[]>;
    walkthroughs: { id: string; steps: { id: string; media: { markdown: string } }[] }[];
  };
};

function context(secrets = new Map<string, string>()) {
  const memento = () => {
    const data = new Map<string, unknown>();
    return { get: (k: string, d?: unknown) => (data.has(k) ? data.get(k) : d), update: async (k: string, v: unknown) => void data.set(k, v), keys: () => [...data.keys()] };
  };
  return {
    extensionUri: { fsPath: "/ext", path: "/ext", scheme: "file" },
    subscriptions: [] as { dispose(): unknown }[],
    secrets: { get: async (k: string) => secrets.get(k), store: async (k: string, v: string) => void secrets.set(k, v), delete: async (k: string) => void secrets.delete(k), onDidChange: () => ({ dispose() {} }) },
    workspaceState: memento(),
    globalState: memento(),
    store: secrets,
  };
}

const signedInCredentials = (apiUrl: string) =>
  JSON.stringify({ apiUrl, token: "secret-token-value", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), user: { email: "dev@example.com", name: "Dev" }, workspace: { id: "w", name: "Dev's Workspace" } });

// A server that refuses connections: any network call fails fast and visibly.
const OFFLINE = "http://127.0.0.1:9";

beforeEach(() => fake.reset());

describe("VS Code extension activation", () => {
  it("registers every contributed command, starts signed out, and cleans up on deactivate", async () => {
    const ctx = context();
    await activate(ctx as never);
    for (const { command } of manifest.contributes.commands) expect(fake.commands.has(command), command).toBe(true);
    expect(fake.context.get("localians.signedIn")).toBe(false);
    expect(fake.context.get("localians.sharing")).toBe(false);
    // The status bar says where things stand and opens the sidebar.
    expect(fake.statusBars[0]).toMatchObject({ text: "$(broadcast) Localians: Signed Out", command: "localians.focus", visible: true });
    expect(fake.webviews.map((w) => w.id)).toEqual(["localians.panel"]);
    const view = fake.webviews[0].resolve();
    expect(view.webview.options).toMatchObject({ enableScripts: true, enableCommandUris: false });
    view.send({ type: "ready" });
    expect(view.state).toMatchObject({ phase: "signedOut", account: null, previews: [] }); // the welcome screen
    expect(fake.messages).toEqual([]); // nothing pops up on startup

    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    expect(fake.disposedCommands.sort()).toEqual([...fake.commands.keys()].sort());
    expect(fake.statusBars[0].disposed).toBe(true);
  });

  it("restores a saved sign-in for the configured server only, and shows the account", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    const ctx = context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]]));
    await activate(ctx as never);
    expect(fake.context.get("localians.signedIn")).toBe(true);
    expect(fake.statusBars[0]).toMatchObject({ text: "$(broadcast) Localians: Connected", command: "localians.focus" });
    const view = fake.webviews[0].resolve();
    view.send({ type: "ready" });
    expect(view.state).toMatchObject({ phase: "signedIn", account: { email: "dev@example.com", workspace: "Dev's Workspace" } });
    expect(JSON.stringify(view.posted) + view.webview.html).not.toContain("secret-token-value"); // the page never sees the token

    await deactivate();
    fake.reset();
    // Same token, different server setting: not used.
    fake.config.set("localians.serverUrl", "https://localians.com");
    await activate(context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]])) as never);
    expect(fake.context.get("localians.signedIn")).toBe(false);
    await deactivate();
  });

  it("refuses to share in Restricted Mode, and never touches the network for it", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    fake.trusted = false;
    fake.folders = [{ uri: { fsPath: "/work/app", scheme: "file" }, name: "app" }];
    await activate(context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]])) as never);
    await fake.commands.get("localians.share")!();
    expect(fake.messages.at(-1)).toMatchObject({ level: "warn", text: expect.stringContaining("Restricted Mode") });
    await deactivate();
  });

  it("sign out forgets the token even when the server can't be reached, and says so", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    const ctx = context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]]));
    await activate(ctx as never);
    await fake.commands.get("localians.logout")!();
    expect(ctx.store.has(SECRET_KEY)).toBe(false);
    expect(fake.context.get("localians.signedIn")).toBe(false);
    expect(fake.messages.at(-1)?.text).toMatch(/revoke it in Settings → CLI/i);
    expect(JSON.stringify(fake.messages)).not.toContain("secret-token-value");
    await deactivate();
  });

  it("changing the server signs out (tokens are bound to the server that issued them)", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    const ctx = context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]]));
    await activate(ctx as never);
    fake.config.set("localians.serverUrl", "https://localians.com");
    _events.configChanged.fire({ affectsConfiguration: (s) => s === "localians.serverUrl" });
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.store.has(SECRET_KEY)).toBe(false);
    expect(fake.context.get("localians.signedIn")).toBe(false);
    await deactivate();
  });

  it("rejects an unsafe server setting instead of sending tokens to it", async () => {
    fake.config.set("localians.serverUrl", "http://evil.example");
    await activate(context() as never);
    expect(fake.messages.at(-1)).toMatchObject({ level: "error", text: expect.stringContaining("localians.serverUrl") });
    await deactivate();
  });

  it("preview commands with nothing shared explain instead of failing", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    await activate(context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]])) as never);
    await fake.commands.get("localians.copyLink")!();
    expect(fake.messages.at(-1)?.text).toBe("Localians: nothing is being shared.");
    expect(fake.clipboard).toBe("");
    await fake.commands.get("localians.openDashboard")!();
    expect(fake.opened.at(-1)).toBe(`${OFFLINE}/dashboard/previews`);
    await deactivate();
  });
});

describe("sidebar panel", () => {
  it("ignores anything but the messages its controls send, and never acts on invalid values", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    await activate(context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]])) as never);
    const view = fake.webviews[0].resolve();
    view.send({ type: "ready" });
    const before = view.posted.length;
    for (const bad of [null, "share", { type: "eval", code: "1" }, { type: "share", port: 70000 }, { type: "preview", action: "delete", id: "x" }, { type: "link", target: "file:///etc/passwd" }]) view.send(bad);
    await new Promise((r) => setTimeout(r, 20));
    expect(view.posted.length).toBe(before);
    expect(fake.opened).toEqual([]);
    await deactivate();
  });

  it("explains instead of failing: an app that isn't running gets a plain message and a retry", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    await activate(context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]])) as never);
    const view = fake.webviews[0].resolve();
    view.send({ type: "share", port: 1, projectId: null, newProjectName: "Nothing here", access: "public", durationMinutes: 0 });
    await new Promise((r) => setTimeout(r, 300));
    expect(view.state).toMatchObject({
      busy: false,
      notice: { tone: "warning", text: "Nothing is running on localhost:1. Start your app and try again.", actions: [{ label: "Retry Detection", message: { type: "detect" } }] },
    });
    view.send({ type: "dismissNotice" });
    expect(view.state?.notice).toBeNull();
    await deactivate();
  });

  it("Sign In shows the waiting state with the code, and Cancel goes back to the welcome screen", async () => {
    // A tiny server that starts a device login and keeps it pending.
    const http = await import("node:http");
    const server = http.createServer((req, res) => {
      const body = req.url === "/api/cli/device/code"
        ? { device_code: "dev-code", user_code: "ABCD-EFGH", verification_uri: "http://127.0.0.1/cli/activate", verification_uri_complete: "http://127.0.0.1/cli/activate?code=ABCD-EFGH", expires_in: 600, interval: 1 }
        : { error: "authorization_pending", message: "Waiting" };
      res.writeHead(req.url === "/api/cli/device/code" ? 200 : 400, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    fake.config.set("localians.serverUrl", url);
    await activate(context() as never);
    const view = fake.webviews[0].resolve();
    view.send({ type: "signIn" });
    await new Promise((r) => setTimeout(r, 300));
    expect(view.state).toMatchObject({ phase: "signingIn", signIn: { code: "ABCD-EFGH" } });
    expect(fake.opened).toEqual(["http://127.0.0.1/cli/activate?code=ABCD-EFGH"]);
    view.send({ type: "copyCode" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.clipboard).toBe("ABCD-EFGH");
    view.send({ type: "cancelSignIn" });
    await new Promise((r) => setTimeout(r, 1500));
    expect(view.state).toMatchObject({ phase: "signedOut", signIn: null });
    await deactivate();
    server.close();
  });
});

describe("extension manifest", () => {
  it("0.2.0: a webview sidebar, the documented commands, and a Getting Started walkthrough whose pages ship", () => {
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.contributes.views.localians).toEqual([expect.objectContaining({ type: "webview", id: "localians.panel" })]);
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, c.title]));
    expect(titles).toMatchObject({
      "localians.openDashboard": "Open Dashboard",
      "localians.login": "Sign In",
      "localians.share": "Share App",
      "localians.copyLink": "Copy Preview Link",
      "localians.stop": "Stop Sharing",
      "localians.logout": "Sign Out",
      "localians.gettingStarted": "Getting Started",
    });
    const declared = new Set(manifest.contributes.commands.map((c) => c.command));
    for (const list of Object.values(manifest.contributes.menus)) for (const m of list) expect(declared.has(m.command), m.command).toBe(true);
    const [walkthrough] = manifest.contributes.walkthroughs;
    expect(walkthrough.steps.map((s) => s.id)).toEqual(["signIn", "runApp", "share", "copyLink"]);
    const ignore = fs.readFileSync(path.resolve(__dirname, "../../extensions/vscode/.vscodeignore"), "utf8");
    for (const step of walkthrough.steps) expect(fs.existsSync(path.resolve(__dirname, "../../extensions/vscode", step.media.markdown)), step.media.markdown).toBe(true);
    for (const shipped of ["media/panel/panel.js", "media/panel/panel.css", "media/walkthrough/*.md"]) expect(ignore).toContain(`!${shipped}`);
  });

  it("keeps the server and port settings out of workspace control, and supports restricted/remote workspaces sensibly", () => {
    const props = manifest.contributes.configuration.properties;
    expect(props["localians.serverUrl"]).toMatchObject({ scope: "application", default: "https://localians.com" }); // a workspace can't redirect tokens
    expect(props["localians.extraPorts"].scope).toBe("application");
    const pkg = manifest as unknown as Record<string, unknown>;
    expect(pkg.extensionKind).toEqual(["workspace"]); // runs where the dev server runs (Remote/WSL/Codespaces)
    expect(pkg.capabilities).toMatchObject({ untrustedWorkspaces: { supported: "limited" }, virtualWorkspaces: false });
    expect(pkg.private).toBe(true); // not publishable until approved
  });
});
