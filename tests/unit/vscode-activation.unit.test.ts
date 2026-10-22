import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../../extensions/vscode/src/extension";
import { SECRET_KEY } from "../../extensions/vscode/src/core/auth";
import { _events, fake } from "../setup/fake-vscode";

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../extensions/vscode/package.json"), "utf8")) as {
  contributes: { commands: { command: string }[]; configuration: { properties: Record<string, { scope?: string; default?: unknown }> } };
};

function context(secrets = new Map<string, string>()) {
  const memento = () => {
    const data = new Map<string, unknown>();
    return { get: (k: string, d?: unknown) => (data.has(k) ? data.get(k) : d), update: async (k: string, v: unknown) => void data.set(k, v), keys: () => [...data.keys()] };
  };
  return {
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
    expect(fake.statusBars[0]).toMatchObject({ text: "$(broadcast) Localians", command: "localians.login", visible: true });
    expect(fake.treeViews[0].id).toBe("localians.main");
    expect(fake.treeViews[0].provider.getChildren()).toEqual([]); // the welcome view shows instead
    expect(fake.messages).toEqual([]); // nothing pops up on startup

    await deactivate();
    for (const d of ctx.subscriptions) d.dispose();
    expect(fake.disposedCommands.sort()).toEqual([...fake.commands.keys()].sort());
    expect(fake.statusBars[0].disposed).toBe(true);
    expect(fake.treeViews[0].disposed).toBe(true);
  });

  it("restores a saved sign-in for the configured server only, and shows the account", async () => {
    fake.config.set("localians.serverUrl", OFFLINE);
    const ctx = context(new Map([[SECRET_KEY, signedInCredentials(OFFLINE)]]));
    await activate(ctx as never);
    expect(fake.context.get("localians.signedIn")).toBe(true);
    expect(fake.statusBars[0]).toMatchObject({ text: "$(broadcast) Share App", command: "localians.share" });
    const sections = fake.treeViews[0].provider.getChildren() as { label: string }[];
    expect(sections.map((s) => s.label)).toEqual(["Previews", "Local apps", "Account"]);

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
    expect(fake.messages.at(-1)?.text).toContain("revoke it in Settings → CLI");
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

describe("extension manifest", () => {
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
