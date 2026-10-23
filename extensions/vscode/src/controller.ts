import os from "node:os";
import * as vscode from "vscode";
import { ApiError, createApi, type ApiProject } from "@tunnel/cli/api";
import { detectProject, type LoopbackAddress } from "@tunnel/cli/local";
import { DEFAULT_DURATION_MINUTES, DURATION_OPTIONS, formatRemaining, isDurationOption } from "@tunnel/shared/durations";
import { Auth, LoginError, type Credentials } from "./core/auth";
import { detectWorkspaceApps, findRunningApps, frameworkValueFor, portsToCheck, probe, suggestProjectName, type AppSuggestion, type WorkspaceApp } from "./core/detect";
import { DEFAULT_SERVER_URL, isWebUrl, parseServerUrl } from "./core/server";
import { ShareError, ShareManager, type Share } from "./core/shares";
import { LocaliansTree, type Item, type Ref, type RemotePreview } from "./tree";

declare const __LOCALIANS_EXTENSION_VERSION__: string | undefined;
export const VERSION = typeof __LOCALIANS_EXTENSION_VERSION__ === "string" ? __LOCALIANS_EXTENSION_VERSION__ : "0.0.0-dev";

const PREFS_KEY = "localians.prefs.v1"; // workspaceState: last port + project (never a password)
const PUBLIC_ACK_KEY = "localians.publicAck.v1"; // globalState: projects the user agreed to share publicly
const REFRESH_MS = 15_000;

type Me = { user: { email: string; name: string }; workspace: { id: string; name: string }; projects: ApiProject[] };
type Prefs = { port?: number; projectId?: string; durationMinutes?: number };

/** Everything the extension does, behind its commands. The UI is native VS Code: tree, quick picks, notifications. */
export class Controller implements vscode.Disposable {
  readonly output: vscode.LogOutputChannel;
  private readonly auth: Auth;
  private readonly shares: ShareManager;
  private readonly tree: LocaliansTree;
  private readonly status: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private credentials: Credentials | null = null;
  private me: Me | null = null;
  private remote: RemotePreview[] = [];
  private apps: AppSuggestion[] = [];
  private scanning = false;
  private timer: NodeJS.Timeout | undefined;
  private treeView: vscode.TreeView<Item> | undefined;
  private readonly userAgent = `localians-vscode/${VERSION} (${process.platform}; vscode ${vscode.version})`;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel("Localians", { log: true });
    this.auth = new Auth(context.secrets, this.userAgent);
    this.shares = new ShareManager({
      api: () => this.api(),
      userAgent: this.userAgent,
      hostHeader: () => vscode.workspace.getConfiguration("localians").get<"rewrite" | "preserve">("hostHeader") ?? "rewrite",
      onChange: () => this.render(),
      log: (line) => this.output.info(line),
      onRequest: (share, e) => {
        if (vscode.workspace.getConfiguration("localians").get<boolean>("verboseLog")) {
          this.output.info(`${share.projectName} ${e.websocket ? "WS " : ""}${e.method} ${e.status} ${e.path.split("?")[0]} ${e.ms}ms`);
        }
      },
    });
    this.tree = new LocaliansTree(() => ({
      signedIn: Boolean(this.credentials),
      account: this.credentials ? { email: this.credentials.user.email, workspace: this.credentials.workspace.name, server: this.credentials.apiUrl } : null,
      shares: this.shares.list(),
      remote: this.remote,
      apps: this.apps,
      scanning: this.scanning,
      trusted: vscode.workspace.isTrusted,
    }));
    this.status = vscode.window.createStatusBarItem("localians.status", vscode.StatusBarAlignment.Left, 50);
    this.status.name = "Localians";
  }

  async activate() {
    this.treeView = vscode.window.createTreeView("localians.main", { treeDataProvider: this.tree, showCollapseAll: false });
    const commands: [string, (arg?: Ref) => unknown][] = [
      ["localians.share", (arg) => this.share(arg)],
      ["localians.stop", (arg) => this.stop(arg)],
      ["localians.copyLink", (arg) => this.copyLink(arg)],
      ["localians.openPreview", (arg) => this.openPreview(arg)],
      ["localians.protect", (arg) => this.protect(arg)],
      ["localians.reconnect", (arg) => this.reconnect(arg)],
      ["localians.openDashboard", () => this.openServerPage("/dashboard/previews")],
      ["localians.refresh", () => this.refresh(true)],
      ["localians.login", () => this.login()],
      ["localians.logout", () => this.logout()],
      ["localians.switchAccount", () => this.switchAccount()],
      ["localians.help", () => this.openServerPage("/docs/getting-started")],
      ["localians.showLog", () => this.output.show()],
      ["localians.statusMenu", () => this.statusMenu()],
    ];
    for (const [id, run] of commands) {
      this.disposables.push(
        vscode.commands.registerCommand(id, async (arg?: unknown) => {
          try {
            await run(toRef(arg));
          } catch (error) {
            this.output.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
            void vscode.window.showErrorMessage(`Localians: ${error instanceof Error ? error.message : "Something went wrong."}`, "Show Log").then((a) => a && this.output.show());
          }
        }),
      );
    }
    this.disposables.push(
      this.treeView,
      this.status,
      this.output,
      this.treeView.onDidChangeVisibility((e) => (e.visible ? this.startPolling() : this.stopPolling())),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.detect()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.render()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("localians.serverUrl")) void this.serverChanged();
        if (e.affectsConfiguration("localians.extraPorts")) void this.detect();
      }),
    );

    const server = this.serverUrl();
    this.credentials = server ? await this.auth.load(server) : null;
    this.render();
    if (this.credentials) void this.refresh(false);
    if (this.treeView.visible) this.startPolling();
  }

  // ------------------------------------------------------------------ state

  private serverUrl(): string | null {
    const parsed = parseServerUrl(vscode.workspace.getConfiguration("localians").get("serverUrl") ?? DEFAULT_SERVER_URL);
    if (!parsed.ok) {
      void vscode.window.showErrorMessage(`Localians: the "localians.serverUrl" setting is invalid. ${parsed.error}`, "Open Settings").then((a) => {
        if (a) void vscode.commands.executeCommand("workbench.action.openSettings", "localians.serverUrl");
      });
      return null;
    }
    return parsed.url;
  }

  private api() {
    return this.credentials ? createApi(this.credentials.apiUrl, this.credentials.token, this.userAgent) : null;
  }

  private render() {
    const live = this.shares.list().filter((s) => s.status !== "ended");
    void vscode.commands.executeCommand("setContext", "localians.signedIn", Boolean(this.credentials));
    void vscode.commands.executeCommand("setContext", "localians.sharing", live.length > 0);
    this.tree.refresh();

    if (!this.credentials) {
      this.status.text = "$(broadcast) Localians";
      this.status.tooltip = "Connect to Localians to share your local apps";
      this.status.command = "localians.login";
    } else if (!live.length) {
      this.status.text = "$(broadcast) Share App";
      this.status.tooltip = "Localians: share a local app with a secure HTTPS link";
      this.status.command = "localians.share";
    } else {
      const connecting = live.some((s) => s.status !== "connected");
      this.status.text = `${connecting ? "$(sync~spin)" : "$(broadcast)"} ${live.length === 1 ? `Sharing :${live[0].port}` : `Sharing ${live.length} apps`}`;
      this.status.tooltip = new vscode.MarkdownString(live.map((s) => `**${s.projectName}** — ${s.status}  \n${s.publicUrl}`).join("\n\n"));
      this.status.command = "localians.statusMenu";
    }
    this.status.accessibilityInformation = { label: `Localians: ${this.status.text.replace(/\$\([^)]+\)\s*/g, "")}` };
    this.status.show();
  }

  private startPolling() {
    this.stopPolling();
    void this.detect();
    this.timer = setInterval(() => void this.refresh(false), REFRESH_MS);
  }

  private stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Re-checks the account, projects and previews from elsewhere, and looks for running apps. */
  async refresh(userAsked: boolean) {
    await Promise.all([this.loadAccount(userAsked), this.detect()]);
  }

  private async loadAccount(userAsked: boolean) {
    const api = this.api();
    if (!api) return;
    try {
      const [me, tunnels] = await Promise.all([api.me(), api.listTunnels()]);
      this.me = me as Me;
      const mine = new Set(this.shares.list().map((s) => s.sessionId));
      this.remote = tunnels.tunnels.filter((t) => !mine.has(t.id) && t.publicUrl).map((t) => ({ ...t }));
      this.render();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return this.sessionExpired();
      if (userAsked) void vscode.window.showWarningMessage(`Localians: ${error instanceof Error ? error.message : "Couldn't refresh."}`);
      this.output.warn(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private workspaceApps(): WorkspaceApp[] {
    const roots = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === "file").map((f) => f.uri.fsPath);
    // In an untrusted workspace, don't read its files at all; ports are still listed.
    return vscode.workspace.isTrusted ? detectWorkspaceApps(roots) : [];
  }

  private async detect() {
    if (this.scanning) return;
    this.scanning = true;
    this.tree.refresh();
    try {
      const workspaceApps = this.workspaceApps();
      const extra = vscode.workspace.getConfiguration("localians").get<unknown[]>("extraPorts") ?? [];
      this.apps = await findRunningApps(workspaceApps, portsToCheck(workspaceApps, extra));
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  // ------------------------------------------------------------------ account

  async login(): Promise<boolean> {
    const server = this.serverUrl();
    if (!server) return false;
    try {
      const credentials = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Localians", cancellable: true },
        async (progress, cancel) =>
          this.auth.signIn(server, `VS Code on ${os.hostname()} (${process.platform})`, {
            isCancelled: () => cancel.isCancellationRequested,
            open: async (url, code) => {
              progress.report({ message: `Approve VS Code in your browser — code ${code}` });
              this.output.info(`Sign-in: approve code ${code} at ${url}`);
              const opened = isWebUrl(url) && (await vscode.env.openExternal(vscode.Uri.parse(url)));
              if (!opened) {
                void vscode.window.showInformationMessage(`Open this link to approve VS Code (code ${code}): ${url}`, "Copy Link").then((a) => {
                  if (a) void vscode.env.clipboard.writeText(url);
                });
              }
              return opened;
            },
          }),
      );
      this.credentials = credentials;
      this.render();
      void vscode.window.showInformationMessage(`Localians: connected as ${credentials.user.email} (${credentials.workspace.name}).`, "Share App").then((a) => {
        if (a) void vscode.commands.executeCommand("localians.share");
      });
      await this.refresh(false);
      return true;
    } catch (error) {
      if (error instanceof LoginError && error.kind === "cancelled") return false;
      const message = error instanceof Error ? error.message : "Sign-in failed.";
      this.output.warn(`Sign-in failed: ${message}`);
      const action = await vscode.window.showErrorMessage(`Localians: ${message}`, "Try Again");
      if (action) return this.login();
      return false;
    }
  }

  async logout() {
    const live = this.shares.list().filter((s) => s.status !== "ended");
    if (live.length) {
      const ok = await vscode.window.showWarningMessage(`Signing out stops ${live.length === 1 ? "your preview" : `${live.length} previews`}.`, { modal: true }, "Sign Out");
      if (!ok) return;
    }
    await this.shares.stopAll();
    const { revoked } = await this.auth.signOut(this.credentials);
    this.credentials = null;
    this.me = null;
    this.remote = [];
    this.render();
    void vscode.window.showInformationMessage(
      revoked ? "Localians: signed out. This computer's access was revoked." : "Localians: signed out here. Couldn't reach Localians to revoke the access — revoke it in Settings → CLI on the dashboard.",
    );
  }

  private async switchAccount() {
    await this.logout();
    if (!this.credentials) await this.login();
  }

  private async sessionExpired() {
    await this.shares.stopAll();
    await this.auth.forget();
    this.credentials = null;
    this.me = null;
    this.remote = [];
    this.render();
    const action = await vscode.window.showWarningMessage("Localians: your sign-in expired or was revoked.", "Connect Again");
    if (action) await this.login();
  }

  private async serverChanged() {
    if (!this.credentials) return this.render();
    await this.shares.stopAll();
    await this.auth.forget(); // credentials are bound to the server that issued them
    this.credentials = null;
    this.render();
    void vscode.window.showInformationMessage("Localians: the server changed, so you've been signed out.", "Connect").then((a) => a && this.login());
  }

  // ------------------------------------------------------------------ sharing

  private async ensureReady(): Promise<boolean> {
    if (!vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) {
      const action = await vscode.window.showWarningMessage(
        "Localians: sharing is turned off in Restricted Mode. Trust this workspace to share its apps.",
        "Manage Workspace Trust",
      );
      if (action) await vscode.commands.executeCommand("workbench.trust.manage");
      return false;
    }
    if (this.credentials) return true;
    const action = await vscode.window.showInformationMessage("Connect to Localians first — your browser opens once to approve VS Code.", "Connect");
    return action ? this.login() : false;
  }

  /** Share App: pick a running app → project → who can open it → connect. */
  async share(arg?: Ref) {
    if (!(await this.ensureReady())) return;
    const app = await this.pickApp(arg);
    if (!app) return;
    const existing = this.shares.activeForPort(app.port);
    if (existing) {
      const action = await vscode.window.showInformationMessage(`localhost:${app.port} is already shared: ${existing.publicUrl}`, "Copy Link", "Open");
      if (action === "Copy Link") await this.copyLink({ kind: "share", sessionId: existing.sessionId });
      if (action === "Open") await this.openPreview({ kind: "share", sessionId: existing.sessionId });
      return;
    }
    const project = await this.pickProject(app);
    if (!project) return;
    const access = await this.pickAccess(project, app.port);
    if (!access) return;
    const durationMinutes = await this.pickDuration();
    if (!durationMinutes) return;
    await this.connect(app, project, durationMinutes);
  }

  /** How long the link works. Localians checks the choice against the plan; the last one is preselected. */
  private async pickDuration(): Promise<number | null> {
    const last = this.context.workspaceState.get<Prefs>(PREFS_KEY)?.durationMinutes;
    const preferred = last && isDurationOption(last) ? last : DEFAULT_DURATION_MINUTES;
    type Pick = vscode.QuickPickItem & { minutes: number };
    const items: Pick[] = DURATION_OPTIONS.filter((o) => o.plan === "free").map((o) => ({
      label: `$(clock) ${o.label}`,
      description: o.minutes === preferred ? (o.minutes === last ? "Used last time" : "Recommended") : undefined,
      minutes: o.minutes,
    }));
    items.sort((a, b) => Number(b.minutes === preferred) - Number(a.minutes === preferred));
    const picked = await vscode.window.showQuickPick(items, { title: "How long should the link work?", placeHolder: "The link stops working after this time. You can share again any time.", ignoreFocusOut: true });
    return picked?.minutes ?? null;
  }

  private async pickApp(arg?: Ref): Promise<(AppSuggestion & { address: LoopbackAddress }) | null> {
    if (arg?.kind === "app") {
      const live = await probe(arg.app.port);
      if (live) return { ...arg.app, address: live.address };
      return this.notRunning(arg.app.port);
    }
    if (arg?.kind !== "manual") {
      await this.detect();
      const prefs = this.context.workspaceState.get<Prefs>(PREFS_KEY) ?? {};
      type Pick = vscode.QuickPickItem & { app?: AppSuggestion; manual?: boolean };
      const items: Pick[] = this.apps
        .slice()
        .sort((a, b) => Number(b.port === prefs.port) - Number(a.port === prefs.port))
        .map((app) => ({
          label: `$(server-process) localhost:${app.port}`,
          description: [app.name, app.framework].filter(Boolean).join(" · ") || app.title || undefined,
          detail: app.port === prefs.port ? "Shared last time" : undefined,
          app,
        }));
      items.push({ label: "$(edit) Enter a port…", manual: true, alwaysShow: true });
      const picked = await vscode.window.showQuickPick(items, {
        title: "Share App — which app?",
        placeHolder: this.apps.length ? "Running on this computer" : "No running app found — start it (e.g. npm run dev) or enter its port",
        ignoreFocusOut: true,
      });
      if (!picked) return null;
      if (picked.app) return { ...picked.app, address: picked.app.address };
    }
    const text = await vscode.window.showInputBox({
      title: "Share App — port",
      prompt: "The port your dev server prints, for example 3000 or 5173",
      ignoreFocusOut: true,
      validateInput: (v) => (/^\d{1,5}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 65535 ? undefined : "Enter a port from 1 to 65535."),
    });
    if (!text) return null;
    const port = Number(text.trim());
    const live = await probe(port);
    if (!live) return this.notRunning(port);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    const name = root?.scheme === "file" && vscode.workspace.isTrusted ? detectProject(root.fsPath).name : null;
    return { ...live, name, frameworkValue: null, folder: root?.fsPath ?? null };
  }

  private async notRunning(port: number): Promise<null> {
    const action = await vscode.window.showWarningMessage(
      `Nothing is answering on localhost:${port}. Start your app (for example npm run dev) and try again.`,
      "Try Again",
      "Choose Another Port",
    );
    if (action === "Try Again") void vscode.commands.executeCommand("localians.share", { kind: "app", app: { port, address: "127.0.0.1", framework: null, title: null, name: null, frameworkValue: null, folder: null } });
    if (action === "Choose Another Port") void vscode.commands.executeCommand("localians.share", { kind: "manual" });
    return null;
  }

  private async pickProject(app: AppSuggestion): Promise<ApiProject | null> {
    if (!this.me) await this.loadAccount(true);
    const me = this.me;
    if (!me) return null;
    const prefs = this.context.workspaceState.get<Prefs>(PREFS_KEY) ?? {};
    const suggestedName = suggestProjectName(app, this.workspaceApps(), vscode.workspace.workspaceFolders?.[0]?.name ?? "My app");
    const byPort = me.projects.find((p) => p.defaultPort === app.port);
    const remembered = prefs.port === app.port ? me.projects.find((p) => p.id === prefs.projectId) : undefined;
    const first = remembered ?? byPort;
    type Pick = vscode.QuickPickItem & { project?: ApiProject; create?: boolean };
    const describe = (p: ApiProject) => [p.defaultPort ? `port ${p.defaultPort}` : null, p.access === "password" ? "password protected" : null].filter(Boolean).join(" · ");
    const items: Pick[] = [];
    if (first) items.push({ label: `$(project) ${first.name}`, description: describe(first), detail: first === remembered ? "Used last time" : `Uses port ${app.port}`, project: first });
    items.push({ label: `$(add) New project “${suggestedName}”`, description: app.framework ?? undefined, create: true });
    const others = me.projects.filter((p) => p !== first);
    if (others.length) items.push({ label: "Other projects", kind: vscode.QuickPickItemKind.Separator });
    for (const p of others) items.push({ label: `$(project) ${p.name}`, description: describe(p), project: p });
    const picked = await vscode.window.showQuickPick(items, { title: `Share localhost:${app.port} — project`, placeHolder: "Previews are grouped by project", ignoreFocusOut: true });
    if (!picked) return null;
    if (picked.project) return picked.project;

    const name = await vscode.window.showInputBox({
      title: "New project",
      value: suggestedName,
      prompt: "Name it after your app. You can rename it in the dashboard.",
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim().length >= 1 && v.trim().length <= 80 ? undefined : "Use 1–80 characters."),
    });
    if (!name) return null;
    const api = this.api();
    if (!api) return null;
    const { project } = await api.createProject({ name: name.trim(), framework: app.frameworkValue ?? frameworkValueFor(app.framework), defaultPort: app.port });
    me.projects.unshift(project);
    this.output.info(`Created project ${project.name}`);
    return project;
  }

  /** Public (with a clear warning) or password protected. A protected project is never made public from here. */
  private async pickAccess(project: ApiProject, port: number): Promise<"public" | "password" | null> {
    type Pick = vscode.QuickPickItem & { value: "keep" | "public" | "password" | "dashboard" };
    const protectedNow = project.access === "password";
    const items: Pick[] = protectedNow
      ? [
          { label: "$(lock) Keep password protection", description: "Visitors enter the project password", value: "keep" },
          { label: "$(key) Set a new password", description: "Signs out current visitors", value: "password" },
          { label: "$(globe) Make it public…", description: "Done in the dashboard", value: "dashboard" },
        ]
      : [
          { label: "$(globe) Public", description: "Anyone with the link can open it", value: "public" },
          { label: "$(lock) Password protected", description: "Visitors enter a password first", value: "password" },
        ];
    const picked = await vscode.window.showQuickPick(items, { title: `Who can open ${project.name}?`, ignoreFocusOut: true });
    if (!picked) return null;
    if (picked.value === "keep") return "password";
    if (picked.value === "dashboard") {
      await this.openServerPage(`/dashboard/projects/${encodeURIComponent(project.id)}#access`);
      return null;
    }
    if (picked.value === "password") return (await this.setPassword(project)) ? "password" : null;

    const acked = this.context.globalState.get<string[]>(PUBLIC_ACK_KEY) ?? [];
    if (!acked.includes(project.id)) {
      const ok = await vscode.window.showWarningMessage(
        `Share localhost:${port} publicly?`,
        { modal: true, detail: "Anyone with the link can open your app while sharing is on. Don't share apps with real customer data or secrets. You can add a password at any time." },
        "Share Publicly",
      );
      if (!ok) return null;
      await this.context.globalState.update(PUBLIC_ACK_KEY, [...acked, project.id].slice(-200));
    }
    return "public";
  }

  private async setPassword(project: { id: string; name: string }): Promise<boolean> {
    const password = await vscode.window.showInputBox({
      title: `Password for ${project.name}`,
      prompt: "Visitors enter it before they see your app. Send it separately from the link.",
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.length < 8 ? "Use at least 8 characters." : v.length > 128 ? "Use 128 characters or fewer." : undefined),
    });
    if (!password) return false;
    const api = this.api();
    if (!api) return false;
    try {
      await api.protectProject(project.id, password); // the password is only sent to the server, never logged
    } catch (error) {
      // Servers from before this feature answer 404 without a Localians error code.
      if (error instanceof ApiError && error.status === 404 && error.code === "http_error") {
        const action = await vscode.window.showWarningMessage(
          "Localians: this server doesn't support setting a preview password from VS Code yet. Set it in the dashboard (project → Access), then share again.",
          "Open Dashboard",
        );
        if (action) await this.openServerPage(`/dashboard/projects/${encodeURIComponent(project.id)}#access`);
        return false;
      }
      throw error;
    }
    const known = this.me?.projects.find((p) => p.id === project.id);
    if (known) Object.assign(known, { access: "password", hasPassword: true });
    this.shares.markProtected(project.id);
    this.output.info(`Password protection set for ${project.name}`);
    return true;
  }

  private async connect(app: AppSuggestion & { address: LoopbackAddress }, project: ApiProject, durationMinutes?: number) {
    try {
      const share = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Localians: sharing localhost:${app.port}…`, cancellable: true },
        async (_progress, cancel) => {
          const started = this.shares.start({ port: app.port, address: app.address, project, durationMinutes });
          cancel.onCancellationRequested(() => {
            const pending = this.shares.list().find((s) => s.port === app.port && s.status === "connecting");
            if (pending) void this.shares.stop(pending.sessionId);
          });
          return started;
        },
      );
      await this.context.workspaceState.update(PREFS_KEY, { port: app.port, projectId: project.id, durationMinutes: share.durationMinutes ?? durationMinutes } satisfies Prefs);
      await vscode.env.clipboard.writeText(share.publicUrl);
      void this.loadAccount(false);
      const action = await vscode.window.showInformationMessage(
        `Sharing ${share.projectName}: ${share.publicUrl} (link copied)${share.access === "password" ? " — password protected" : ""} · works for ${formatRemaining(share.expiresAt - Date.now())}`,
        "Open",
        "Stop Sharing",
      );
      if (action === "Open") await this.openPreview({ kind: "share", sessionId: share.sessionId });
      if (action === "Stop Sharing") await this.stop({ kind: "share", sessionId: share.sessionId });
    } catch (error) {
      if (error instanceof ShareError && error.code === "auth") return this.sessionExpired();
      if (error instanceof ShareError && error.code === "user") return; // cancelled
      if (error instanceof ShareError && (error.code === "free_used" || error.code === "free_limit")) {
        // The project's free preview is over: offer the 7-Day Pass (bought in the dashboard).
        const action = await vscode.window.showWarningMessage(`Localians: ${error.message}`, "Get 7-Day Pass");
        if (action) await this.openServerPage(`/dashboard/projects/${encodeURIComponent(project.id)}#plan`);
        return;
      }
      const message = error instanceof Error ? error.message : "Couldn't start sharing.";
      const action = await vscode.window.showErrorMessage(`Localians: ${message}`, "Try Again", "Show Log");
      if (action === "Try Again") await this.connect(app, project, durationMinutes);
      if (action === "Show Log") this.output.show();
    }
  }

  private async reconnect(arg?: Ref) {
    const share = arg?.kind === "share" ? this.shares.get(arg.sessionId) : undefined;
    if (!share) return this.share();
    const live = await probe(share.port);
    if (!live) return void (await this.notRunning(share.port));
    this.shares.dismiss(share.sessionId);
    const project = this.me?.projects.find((p) => p.id === share.projectId) ?? { id: share.projectId, name: share.projectName, slug: "", framework: null, defaultPort: share.port };
    await this.connect({ ...live, name: share.projectName, frameworkValue: null, folder: null }, project, share.durationMinutes);
  }

  // ------------------------------------------------------------------ preview actions

  /** The preview a command applies to: the row it was invoked on, the only live one, or one the user picks. */
  private async target(arg?: Ref): Promise<{ share?: Share; remote?: RemotePreview } | null> {
    if (arg?.kind === "share") {
      const share = this.shares.get(arg.sessionId);
      return share ? { share } : null;
    }
    if (arg?.kind === "remote") {
      const remote = this.remote.find((r) => r.id === arg.id);
      return remote ? { remote } : null;
    }
    const candidates: { share?: Share; remote?: RemotePreview }[] = [
      ...this.shares.list().filter((s) => s.status !== "ended").map((share) => ({ share })),
      ...this.remote.map((remote) => ({ remote })),
    ];
    if (candidates.length <= 1) return candidates[0] ?? null;
    const picked = await vscode.window.showQuickPick(
      candidates.map((c) => ({
        label: c.share?.projectName ?? c.remote!.project.name,
        description: c.share ? `:${c.share.port} · ${c.share.publicUrl}` : `:${c.remote!.localPort} · elsewhere`,
        c,
      })),
      { title: "Which preview?" },
    );
    return picked?.c ?? null;
  }

  async stop(arg?: Ref) {
    const t = await this.target(arg);
    if (!t) return void vscode.window.showInformationMessage("Localians: nothing is being shared.");
    if (t.share) {
      await this.shares.stop(t.share.sessionId);
      this.shares.dismiss(t.share.sessionId);
      void vscode.window.showInformationMessage(`Localians: stopped sharing ${t.share.projectName}. The link no longer works.`);
    } else if (t.remote) {
      await this.api()?.closeTunnel(t.remote.id);
      void vscode.window.showInformationMessage(`Localians: stopped ${t.remote.project.name}.`);
    }
    await this.loadAccount(false);
  }

  async copyLink(arg?: Ref) {
    const url = arg?.kind === "link" ? arg.url : await this.targetUrl(arg);
    if (!url) return;
    await vscode.env.clipboard.writeText(url);
    void vscode.window.setStatusBarMessage("$(check) Preview link copied", 2500);
  }

  async openPreview(arg?: Ref) {
    const url = await this.targetUrl(arg);
    if (url) await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async targetUrl(arg?: Ref) {
    const t = await this.target(arg);
    const url = t?.share?.publicUrl ?? t?.remote?.publicUrl ?? null;
    if (!url) void vscode.window.showInformationMessage("Localians: nothing is being shared.");
    return isWebUrl(url) ? url : null;
  }

  private async protect(arg?: Ref) {
    const t = await this.target(arg);
    if (!t?.share) return;
    if (await this.setPassword({ id: t.share.projectId, name: t.share.projectName })) {
      void vscode.window.showInformationMessage(`Localians: ${t.share.projectName} is now password protected. Visitors enter the password first.`);
    }
  }

  private async statusMenu() {
    const live = this.shares.list().filter((s) => s.status !== "ended");
    type Pick = vscode.QuickPickItem & { run: () => unknown };
    const items: Pick[] = [];
    for (const s of live) {
      const ref: Ref = { kind: "share", sessionId: s.sessionId };
      items.push({ label: `${s.projectName} — ${s.status}`, kind: vscode.QuickPickItemKind.Separator, run: () => undefined });
      items.push({ label: "$(copy) Copy Link", description: s.publicUrl, run: () => this.copyLink(ref) });
      items.push({ label: "$(link-external) Open Preview", run: () => this.openPreview(ref) });
      items.push({ label: "$(debug-stop) Stop Sharing", description: `localhost:${s.port}`, run: () => this.stop(ref) });
    }
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator, run: () => undefined });
    items.push({ label: "$(broadcast) Share Another App…", run: () => this.share() });
    items.push({ label: "$(globe) Open Dashboard", run: () => this.openServerPage("/dashboard/previews") });
    const picked = await vscode.window.showQuickPick(items, { title: "Localians" });
    await picked?.run();
  }

  private async openServerPage(path: string) {
    const base = this.credentials?.apiUrl ?? this.serverUrl() ?? DEFAULT_SERVER_URL;
    await vscode.env.openExternal(vscode.Uri.parse(`${base}${path}`));
  }

  /** Stops every preview this window started (their links stop working) — on deactivation / window close. */
  async shutdown() {
    this.stopPolling();
    await Promise.race([this.shares.stopAll(), new Promise((r) => setTimeout(r, 4000))]);
  }

  dispose() {
    this.stopPolling();
    for (const d of this.disposables.splice(0)) d.dispose();
  }
}

/** Commands can be invoked with a tree item, a Ref, or nothing (Command Palette / keybinding). */
function toRef(arg: unknown): Ref | undefined {
  if (!arg || typeof arg !== "object") return undefined;
  if ("ref" in arg) return (arg as { ref: Ref }).ref;
  if ("kind" in arg) return arg as Ref;
  return undefined;
}
