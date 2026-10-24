import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainShareError } from "../../extensions/vscode/src/controller";
import { Auth, SECRET_KEY } from "../../extensions/vscode/src/core/auth";
import { ShareError } from "../../extensions/vscode/src/core/shares";
import { durationsFor, matchProject, parseMessage } from "../../extensions/vscode/src/panel/model";
import { panelHtml } from "../../extensions/vscode/src/panel/provider";

const panelScript = fs.readFileSync(path.resolve(__dirname, "../../extensions/vscode/media/panel/panel.js"), "utf8");

describe("sidebar panel: messages from the page", () => {
  it("accepts exactly the messages its controls send", () => {
    expect(parseMessage({ type: "signIn" })).toEqual({ type: "signIn" });
    expect(parseMessage({ type: "share", port: 3000, projectId: "cl_abc123", newProjectName: null, access: "password", durationMinutes: 60 })).toEqual({
      type: "share",
      port: 3000,
      projectId: "cl_abc123",
      newProjectName: null,
      access: "password",
      durationMinutes: 60,
    });
    expect(parseMessage({ type: "share", port: 5173, projectId: null, newProjectName: "  My   Shop ", access: "public", durationMinutes: 0 })).toMatchObject({ newProjectName: "My Shop" });
    expect(parseMessage({ type: "preview", action: "stop", id: "sess_1" })).toEqual({ type: "preview", action: "stop", id: "sess_1" });
    expect(parseMessage({ type: "link", target: "docs" })).toEqual({ type: "link", target: "docs" });
    expect(parseMessage({ type: "guide", open: false })).toEqual({ type: "guide", open: false });
  });

  it("rejects anything else: unknown types, bad ports, durations, ids, links and names", () => {
    for (const bad of [
      null,
      "signIn",
      [],
      { type: "runCommand", command: "workbench.action.terminal.sendSequence" },
      { type: "share", port: 0, projectId: null, newProjectName: "x", access: "public", durationMinutes: 0 },
      { type: "share", port: 3000, projectId: null, newProjectName: "x", access: "everyone", durationMinutes: 0 },
      { type: "share", port: 3000, projectId: null, newProjectName: "x", access: "public", durationMinutes: 999 },
      { type: "share", port: 3000, projectId: null, newProjectName: "", access: "public", durationMinutes: 0 },
      { type: "share", port: 3000, projectId: null, newProjectName: "x".repeat(81), access: "public", durationMinutes: 0 },
      { type: "share", port: 3000, projectId: "../../etc", newProjectName: null, access: "public", durationMinutes: 0 },
      { type: "preview", action: "delete", id: "s" },
      { type: "preview", action: "stop", id: "a b" },
      { type: "upgrade", projectId: "x/../y" },
      { type: "link", target: "https://evil.example" },
      { type: "guide", open: "yes" },
    ]) {
      expect(parseMessage(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("sidebar panel: page shell", () => {
  const webview = { cspSource: "https://x.vscode-cdn.net", asWebviewUri: (u: { path: string }) => ({ toString: () => `https://x.vscode-cdn.net${u.path}` }) };

  it("allows only its own files, a nonce'd script and nothing remote; carries no account data", () => {
    const html = panelHtml(webview as never, { path: "/ext/media/panel", fsPath: "/ext/media/panel", scheme: "file" } as never, "n0nce");
    const csp = /content="([^"]+)"/.exec(html)![1];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-n0nce'");
    expect(csp).toContain("style-src https://x.vscode-cdn.net");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(html).toContain('<script nonce="n0nce" src="https://x.vscode-cdn.net/ext/media/panel/panel.js">');
    expect(html).not.toMatch(/@|token|lcl_/i);
  });

  it("the page script builds the page with DOM APIs only and talks to VS Code only through postMessage", () => {
    expect(panelScript).not.toMatch(/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/);
    expect(panelScript).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage/);
    expect(panelScript).toContain("acquireVsCodeApi()");
  });
});

describe("sidebar panel: what it offers", () => {
  const projects = [
    { id: "p_next", name: "next-sample-app", defaultPort: 4310 },
    { id: "p_api", name: "Orders API", defaultPort: 8000 },
    { id: "p_loose", name: "Vite sample", defaultPort: null },
  ];

  it("matches an app to its project, never to a project bound to another port", () => {
    expect(matchProject(projects, 4310, "whatever", null)).toBe("p_next"); // the project using the port
    expect(matchProject(projects, 5174, "Vite sample", null)).toBe("p_loose"); // same name, no port yet
    expect(matchProject(projects, 5174, "next-sample-app", null)).toBeNull(); // named like it but uses :4310 → create new
    expect(matchProject(projects, 5174, "x", "p_api")).toBe("p_api"); // remembered for this port wins
    expect(matchProject(projects, 5174, "x", "p_gone")).toBeNull();
  });

  it("only offers lengths the project is entitled to", () => {
    expect(durationsFor({ plan: null })).toEqual([0, 5, 15, 30, 60, 720, 1440]);
    expect(durationsFor({ plan: { pass: true, passEndsAt: null, free: "used", freeEndsAt: null, canShare: true } })).toEqual([0, 5, 15, 30, 60, 720, 1440, 4320, 10080]);
  });

  it("explains failures in plain words, with a useful next step instead of a raw server error", () => {
    expect(explainShareError(new ShareError("x", "free_used"), "p1", 3000)).toEqual({
      tone: "warning",
      text: "Your preview period has ended. Renew your Preview Pass to continue.",
      actions: [{ label: "Renew Preview Pass", message: { type: "upgrade", projectId: "p1" } }],
    });
    expect(explainShareError(new ShareError("You can share up to 5 apps at once.", "too_many_tunnels"), "p1", 3000).text).toBe(
      "You've reached your active preview limit. Stop another preview or review your plan.",
    );
    expect(explainShareError(new ShareError("x", "already_sharing"), "p1", 3000).text).toBe("This app is already being shared. Open its active preview below.");
    const unknown = explainShareError(new Error("ECONNRESET at internal/net.js:123"), "p1", 5173);
    expect(unknown.text).toBe("Couldn't share localhost:5173. Check your internet connection and try again.");
    expect(JSON.stringify(unknown)).not.toContain("ECONNRESET");
  });
});

describe("sign-in storage", () => {
  it("a late \"revoked\" answer about an old login never deletes a newer sign-in", async () => {
    const store = new Map<string, string>();
    const secrets = { get: async (k: string) => store.get(k), store: async (k: string, v: string) => void store.set(k, v), delete: async (k: string) => void store.delete(k) };
    const auth = new Auth(secrets, "test");
    store.set(SECRET_KEY, JSON.stringify({ apiUrl: "https://localians.com", token: "lcl_new", expiresAt: new Date(Date.now() + 86_400_000).toISOString(), user: { email: "a@b.test", name: "A" }, workspace: { id: "w", name: "W" } }));
    await auth.forget("lcl_old"); // the old login was revoked, but the user has signed in again
    expect(store.has(SECRET_KEY)).toBe(true);
    await auth.forget("lcl_new");
    expect(store.has(SECRET_KEY)).toBe(false);
  });
});
