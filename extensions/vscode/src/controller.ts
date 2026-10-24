import os from "node:os";
import * as vscode from "vscode";
import { ApiError, createApi, type ApiProject } from "@tunnel/cli/api";
import { detectProject, type LoopbackAddress } from "@tunnel/cli/local";
import { DEFAULT_DURATION_MINUTES, DURATION_OPTIONS, formatRemaining, isDurationOption } from "@tunnel/shared/durations";
import { Auth, LoginError, type Credentials } from "./core/auth";
import { detectWorkspaceApps, findRunningApps, frameworkValueFor, portsToCheck, probe, suggestProjectName, type AppSuggestion, type WorkspaceApp } from "./core/detect";
import { DEFAULT_SERVER_URL, isWebUrl, parseServerUrl } from "./core/server";
import { ShareError, ShareManager, type Share } from "./core/shares";
import { durationsFor, matchProject, PANEL_DURATIONS, UNTIL_PLAN_ENDS, type LinkTarget, type Notice, type PanelMessage, type PanelPreview, type PanelProject, type PanelState } from "./panel/model";
import { PANEL_VIEW_ID, PanelProvider } from "./panel/provider";
import type { Ref, RemotePreview } from "./types";

declare const __LOCALIANS_EXTENSION_VERSION__: string | undefined;
export const VERSION = typeof __LOCALIANS_EXTENSION_VERSION__ === "string" ? __LOCALIANS_EXTENSION_VERSION__ : "0.0.0-dev";

const PREFS_KEY = "localians.prefs.v1"; // workspaceState: last port, project and duration (never a password)
const PROJECTS_KEY = "localians.projectsByPort.v1"; // workspaceState: port → project chosen for it
const PUBLIC_ACK_KEY = "localians.publicAck.v1"; // globalState: projects the user agreed to share publicly
const GUIDE_KEY = "localians.guideOpen.v1"; // globalState: whether "Getting started" is expanded
const REFRESH_MS = 15_000;
const WALKTHROUGH_ID = "thinxify.localians#start";

type Me = Awaited<ReturnType<ReturnType<typeof createApi>["me"]>>;
/** durationMinutes 0 = "until the free preview or pass ends" (nothing sent: Localians applies the project's plan). */
type Prefs = { port?: number; projectId?: string; durationMinutes?: number };
type App = AppSuggestion & { address: LoopbackAddress };
/** How a share was started: from the sidebar (results show there) or a command (results are notifications). */
type Origin = "panel" | "command";

/**
 * Everything the extension does: the sidebar panel (a webview) for the everyday flow, plus the same actions as
 * commands (Command Palette, status bar). Sharing itself runs the CLI's tunnel agent (core/shares).
 */
export class Controller implements vscode.Disposable {
  readonly output: vscode.LogOutputChannel;
  private readonly auth: Auth;
  private readonly shares: ShareManager;
  readonly panel: PanelProvider;
  private readonly status: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private credentials: Credentials | null = null;
  private me: Me | null = null;
  private remote: RemotePreview[] = [];
  private apps: AppSuggestion[] = [];
  private scanning = false;
  private timer: NodeJS.Timeout | undefined;
  private signIn: { code: string; url: string } | null = null;
  private signingIn = false;
  private cancelSignIn = false;
  private notice: Notice | null = null;
  private busy = false;
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
    this.panel = new PanelProvider(
      context.extensionUri,
      () => this.panelState(),
      (message) => this.onPanelMessage(message),
      (line) => this.output.warn(line),
    );
    this.status = vscode.window.createStatusBarItem("localians.status", vscode.StatusBarAlignment.Left, 50);
    this.status.name = "Localians";
  }

  async activate() {
    const commands: [string, (arg?: Ref) => unknown][] = [
      ["localians.focus", () => this.focus()],
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
      ["localians.gettingStarted", () => this.gettingStarted()],
      ["localians.help", () => this.openServerPage("/docs/vscode")],
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
            void vscode.window.showErrorMessage("Localians: something went wrong. Try again, or open the log for details.", "Show Log").then((a) => a && this.output.show());
          }
        }),
      );
    }
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, this.panel),
      this.panel,
      this.status,
      this.output,
      this.panel.onDidChangeVisibility((visible) => (visible ? this.startPolling() : this.stopPolling())),
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

  private live() {
    return this.shares.list().filter((s) => s.status !== "ended");
  }

  private render() {
    const live = this.live();
    void vscode.commands.executeCommand("setContext", "localians.signedIn", Boolean(this.credentials));
    void vscode.commands.executeCommand("setContext", "localians.sharing", live.length > 0);
    this.panel.post();

    const count = live.length + this.remote.filter((r) => r.status === "CONNECTED").length;
    const reconnecting = live.some((s) => s.status !== "connected");
    if (!this.credentials) {
      this.status.text = "$(broadcast) Localians: Signed Out";
      this.status.tooltip = "Localians — sign in to share your local apps";
    } else if (!count) {
      this.status.text = "$(broadcast) Localians: Connected";
      this.status.tooltip = "Localians — open the sidebar to share a local app";
    } else {
      this.status.text = `${reconnecting ? "$(sync~spin)" : "$(broadcast)"} Localians: ${count} Live`;
      this.status.tooltip = new vscode.MarkdownString(live.map((s) => `**${s.projectName}** — ${s.status}  \n${s.publicUrl}`).join("\n\n") || "Previews running");
    }
    this.status.command = "localians.focus";
    this.status.accessibilityInformation = { label: this.status.text.replace(/\$\([^)]+\)\s*/g, "") };
    this.status.show();
  }

  /** What the sidebar shows. Never contains a token or password. */
  panelState(): PanelState {
    const prefs = this.context.workspaceState.get<Prefs>(PREFS_KEY) ?? {};
    const byPort = this.context.workspaceState.get<Record<string, string>>(PROJECTS_KEY) ?? {};
    const projects: PanelProject[] = (this.me?.projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      defaultPort: p.defaultPort,
      access: p.access === "password" ? "password" : "public",
      hasPassword: Boolean(p.hasPassword),
      customUrl: isWebUrl(p.customUrl) ? p.customUrl : null,
      plan: p.plan ?? null,
    }));
    const workspaceApps = this.workspaceApps();
    const folderName = vscode.workspace.workspaceFolders?.[0]?.name ?? "My app";
    const apps = this.apps.map((app) => {
      const suggestedName = suggestProjectName(app, workspaceApps, folderName);
      return {
        port: app.port,
        label: [app.framework, app.name ?? app.title].filter(Boolean).join(" · ") || "App",
        framework: app.framework,
        suggestedName,
        projectId: matchProject(projects, app.port, suggestedName, byPort[String(app.port)] ?? null),
      };
    });
    const previews: PanelPreview[] = [
      ...this.shares.list().map((s) => ({
        id: s.sessionId,
        source: "local" as const,
        project: s.projectName,
        projectId: s.projectId,
        port: s.port,
        status: s.status,
        url: s.publicUrl,
        access: s.access,
        plan: null,
        expiresAt: s.expiresAt,
        endMessage: s.endMessage ?? null,
      })),
      ...this.remote.map((r) => ({
        id: r.id,
        source: "remote" as const,
        project: r.project.name,
        projectId: null,
        port: r.localPort,
        status: r.status === "CONNECTED" ? ("connected" as const) : r.status === "CONNECTING" ? ("connecting" as const) : ("offline" as const),
        url: isWebUrl(r.publicUrl) ? r.publicUrl : null,
        access: null,
        plan: null,
        expiresAt: r.expiresAt ? Date.parse(r.expiresAt) : null,
        endMessage: null,
      })),
    ];
    const user = this.credentials?.user;
    return {
      version: VERSION,
      phase: this.credentials ? "signedIn" : this.signingIn ? "signingIn" : "signedOut",
      trusted: vscode.workspace.isTrusted,
      signIn: this.signIn,
      account: this.credentials && user ? { name: user.name, username: user.username ?? null, email: user.email, workspace: this.credentials.workspace.name } : null,
      apps,
      scanning: this.scanning,
      projects,
      workspaceName: vscode.workspace.isTrusted ? folderName : "My app",
      last: { port: prefs.port ?? null, durationMinutes: prefs.durationMinutes ?? UNTIL_PLAN_ENDS },
      durations: PANEL_DURATIONS,
      previews,
      limit: this.me?.limits?.activePreviews ?? null,
      notice: this.notice,
      busy: this.busy,
      guideOpen: this.context.globalState.get<boolean>(GUIDE_KEY) ?? true,
      serverUrl: this.credentials?.apiUrl ?? DEFAULT_SERVER_URL,
    };
  }

  private startPolling() {
    this.stopPolling();
    void this.refresh(false);
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
    const asked = this.credentials; // the login this refresh is about
    if (!api || !asked) return;
    try {
      const [me, tunnels] = await Promise.all([api.me(), api.listTunnels()]);
      // Signed out or into another account meanwhile: this answer is about an old login, so it changes nothing.
      if (this.credentials?.token !== asked.token) return;
      this.me = me;
      // Newer servers report the username and renew the login while it's used: keep the saved copy current.
      const next: Credentials = { ...this.credentials, user: { ...this.credentials.user, ...me.user }, ...(me.credential ? { expiresAt: me.credential.expiresAt } : {}) };
      if (JSON.stringify(next) !== JSON.stringify(this.credentials)) {
        this.credentials = next;
        await this.auth.update(next);
      }
      const mine = new Set(this.shares.list().map((s) => s.sessionId));
      this.remote = tunnels.tunnels.filter((t) => !mine.has(t.id) && t.publicUrl).map((t) => ({ ...t }));
      this.render();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return this.sessionExpired(asked);
      if (userAsked) this.tell({ tone: "warning", text: "Couldn't reach Localians. Check your internet connection and try again.", actions: [{ label: "Try Again", message: { type: "detect" } }] });
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
    this.render();
    try {
      const workspaceApps = this.workspaceApps();
      const extra = vscode.workspace.getConfiguration("localians").get<unknown[]>("extraPorts") ?? [];
      this.apps = await findRunningApps(workspaceApps, portsToCheck(workspaceApps, extra));
    } finally {
      this.scanning = false;
      this.render();
    }
  }

  /** Shows a message in the sidebar; as a notification too when the sidebar isn't open. */
  private tell(notice: Notice, origin: Origin = "panel") {
    this.notice = notice;
    this.render();
    if (origin === "command" || !this.panel.visible) {
      const show = notice.tone === "error" ? vscode.window.showErrorMessage : notice.tone === "warning" ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
      const labels = notice.actions.map((a) => a.label);
      void show(`Localians: ${notice.text}`, ...labels).then((picked) => {
        const action = notice.actions.find((a) => a.label === picked);
        if (action) void this.onPanelMessage(action.message);
      });
    }
  }

  private async focus() {
    await vscode.commands.executeCommand(`${PANEL_VIEW_ID}.focus`);
  }

  private async gettingStarted() {
    try {
      await vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
    } catch {
      await this.focus();
    }
  }

  // ------------------------------------------------------------------ panel messages

  async onPanelMessage(message: PanelMessage) {
    switch (message.type) {
      case "signIn":
        return void this.login();
      case "cancelSignIn":
        this.cancelSignIn = true;
        return;
      case "copyCode":
        if (this.signIn) await vscode.env.clipboard.writeText(this.signIn.code);
        return void vscode.window.setStatusBarMessage("$(check) Sign-in code copied", 2500);
      case "openApproval":
        if (this.signIn && isWebUrl(this.signIn.url)) await vscode.env.openExternal(vscode.Uri.parse(this.signIn.url));
        return;
      case "signOut":
        return this.logout();
      case "switchAccount":
        return this.switchAccount();
      case "detect":
        return this.refresh(true);
      case "dismissNotice":
        this.notice = null;
        return this.render();
      case "guide":
        await this.context.globalState.update(GUIDE_KEY, message.open);
        return;
      case "upgrade":
        return this.openServerPage(`/dashboard/projects/${encodeURIComponent(message.projectId)}#plan`);
      case "link":
        return this.openLink(message.target);
      case "share":
        return this.shareFromPanel(message);
      case "preview": {
        const ref: Ref | undefined = this.shares.get(message.id) ? { kind: "share", sessionId: message.id } : this.remote.some((r) => r.id === message.id) ? { kind: "remote", id: message.id, publicUrl: null } : undefined;
        if (!ref) return;
        if (message.action === "copy") return this.copyLink(ref);
        if (message.action === "open") return this.openPreview(ref);
        if (message.action === "stop") return this.stop(ref, "panel");
        if (message.action === "reshare") return this.reconnect(ref);
        if (message.action === "dismiss" && ref.kind === "share") return this.shares.dismiss(ref.sessionId);
        return;
      }
    }
  }

  private async openLink(target: LinkTarget) {
    if (target === "settings") return void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:thinxify.localians");
    if (target === "trust") return void vscode.commands.executeCommand("workbench.trust.manage");
    if (target === "walkthrough") return this.gettingStarted();
    if (target === "log") return this.output.show();
    const paths: Record<string, string> = { dashboard: "/dashboard/previews", docs: "/docs/vscode", troubleshooting: "/docs/troubleshooting", billing: "/dashboard/settings/billing" };
    return this.openServerPage(paths[target]);
  }

  // ------------------------------------------------------------------ account

  async login(): Promise<boolean> {
    if (this.signingIn) {
      await this.focus();
      return false;
    }
    const server = this.serverUrl();
    if (!server) return false;
    this.signingIn = true;
    this.cancelSignIn = false;
    this.notice = null;
    this.render();
    void this.focus();
    try {
      const credentials = await this.auth.signIn(server, `VS Code on ${os.hostname()} (${process.platform})`, {
        isCancelled: () => this.cancelSignIn,
        open: async (url, code) => {
          this.signIn = { code, url };
          this.render();
          this.output.info(`Sign-in: approve code ${code} at ${url}`);
          const opened = isWebUrl(url) && (await vscode.env.openExternal(vscode.Uri.parse(url)));
          if (!opened) this.tell({ tone: "info", text: `Open the approval page in your browser and confirm the code ${code}.`, actions: [{ label: "Open Browser Again", message: { type: "openApproval" } }] });
          return opened;
        },
      });
      this.credentials = credentials;
      this.signIn = null;
      this.signingIn = false;
      this.notice = null;
      this.render();
      this.output.info(`Signed in as ${credentials.user.email} (${credentials.workspace.name})`);
      if (!this.panel.visible) void vscode.window.setStatusBarMessage(`$(check) Localians: signed in as ${credentials.user.email}`, 4000);
      await this.refresh(false);
      return true;
    } catch (error) {
      this.signIn = null;
      this.signingIn = false;
      if (error instanceof LoginError && error.kind === "cancelled") {
        this.render();
        return false;
      }
      const text =
        error instanceof LoginError && error.kind === "denied"
          ? "Sign-in was denied in the browser."
          : error instanceof LoginError && error.kind === "expired"
            ? "The sign-in code expired before it was approved. Try again and approve it within 10 minutes."
            : "Couldn't reach Localians to sign in. Check your internet connection and try again.";
      this.output.warn(`Sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
      this.tell({ tone: "error", text, actions: [{ label: "Try Again", message: { type: "signIn" } }] });
      return false;
    }
  }

  async logout() {
    const live = this.live();
    if (live.length) {
      const ok = await vscode.window.showWarningMessage(`Signing out stops ${live.length === 1 ? "your preview" : `${live.length} previews`}.`, { modal: true }, "Sign Out");
      if (!ok) return;
    }
    await this.shares.stopAll();
    const { revoked } = await this.auth.signOut(this.credentials);
    this.credentials = null;
    this.me = null;
    this.remote = [];
    for (const s of this.shares.list()) this.shares.dismiss(s.sessionId);
    this.notice = revoked
      ? { tone: "info", text: "Signed out. This computer's access was revoked.", actions: [] }
      : { tone: "warning", text: "Signed out here, but Localians couldn't be reached to revoke this computer's access. Revoke it in Settings → CLI on the dashboard.", actions: [{ label: "Open Dashboard", message: { type: "link", target: "dashboard" } }] };
    this.render();
    if (!this.panel.visible) void vscode.window.showInformationMessage(`Localians: ${this.notice.text}`);
  }

  private async switchAccount() {
    await this.logout();
    if (!this.credentials) await this.login();
  }

  /**
   * The server refused `which` login (expired or revoked). Only that login is dropped: if the user has signed in again
   * (or out) since the request started, the newer sign-in is kept.
   */
  private async sessionExpired(which: Credentials | null = this.credentials) {
    if (!which || this.credentials?.token !== which.token) return;
    this.credentials = null;
    await this.shares.stopAll();
    await this.auth.forget(which.token);
    this.me = null;
    this.remote = [];
    this.tell({ tone: "warning", text: "Your sign-in expired or was revoked. Connect your Localians account to start sharing again.", actions: [{ label: "Sign In", message: { type: "signIn" } }] });
  }

  private async serverChanged() {
    if (!this.credentials) return this.render();
    await this.shares.stopAll();
    await this.auth.forget(); // credentials are bound to the server that issued them
    this.credentials = null;
    this.me = null;
    this.tell({ tone: "info", text: "The server setting changed, so you've been signed out.", actions: [{ label: "Sign In", message: { type: "signIn" } }] }, "command");
  }

  // ------------------------------------------------------------------ sharing

  private async ensureReady(origin: Origin): Promise<boolean> {
    if (!vscode.workspace.isTrusted && vscode.workspace.workspaceFolders?.length) {
      const text = "Sharing is turned off in Restricted Mode. Trust this workspace to share its apps.";
      if (origin === "panel") this.tell({ tone: "warning", text, actions: [{ label: "Manage Workspace Trust", message: { type: "link", target: "trust" } }] });
      else {
        const action = await vscode.window.showWarningMessage(`Localians: ${text}`, "Manage Workspace Trust");
        if (action) await vscode.commands.executeCommand("workbench.trust.manage");
      }
      return false;
    }
    if (this.credentials) return true;
    const action = await vscode.window.showInformationMessage("Localians: connect your Localians account to start sharing.", "Sign In");
    return action ? this.login() : false;
  }

  /** The sidebar's Share App: everything was chosen in the panel; only a new password is asked for here. */
  private async shareFromPanel(m: Extract<PanelMessage, { type: "share" }>) {
    if (this.busy || !(await this.ensureReady("panel"))) return;
    if (this.shares.activeForPort(m.port)) {
      return this.tell({ tone: "info", text: "This app is already being shared. Open its active preview below.", actions: [] });
    }
    this.busy = true;
    this.notice = null;
    this.render();
    try {
      const live = await probe(m.port);
      if (!live) return this.tellNotRunning(m.port);
      if (!this.me) await this.loadAccount(true);
      if (!this.me) return;
      let project: ApiProject | undefined;
      if (m.projectId) {
        project = this.me.projects.find((p) => p.id === m.projectId);
        if (!project) return this.tell({ tone: "warning", text: "Project not found. Select an existing project or create a new one.", actions: [{ label: "Refresh", message: { type: "detect" } }] });
      }
      if (project?.plan && !project.plan.canShare) return this.tellRenew(project);
      if (m.durationMinutes !== UNTIL_PLAN_ENDS && !durationsFor(project ? { plan: project.plan ?? null } : null).includes(m.durationMinutes)) {
        return this.tell({ tone: "warning", text: "That length needs a Preview Pass for this project. Choose a shorter one, or get a pass.", actions: project ? [{ label: "Get a Preview Pass", message: { type: "upgrade", projectId: project.id } }] : [] });
      }
      if (project && project.access === "password" && m.access === "public") {
        return this.tell({ tone: "info", text: "This project is password protected. Make it public in the dashboard if you want to.", actions: [{ label: "Open Dashboard", message: { type: "link", target: "dashboard" } }] });
      }
      const name = m.newProjectName ?? "";
      const api = this.api();
      if (!api) return;
      if (!project) {
        const app = this.apps.find((a) => a.port === m.port);
        ({ project } = await api.createProject({ name, framework: app?.frameworkValue ?? frameworkValueFor(app?.framework ?? null), defaultPort: m.port }));
        this.me.projects.unshift(project);
        this.output.info(`Created project ${project.name}`);
      }
      if (m.access === "password" && !(project.access === "password" && project.hasPassword !== false)) {
        if (!(await this.setPassword(project))) return;
      }
      if (m.access === "public" && !(await this.acknowledgePublic(project, m.port))) return;
      const detected = this.apps.find((a) => a.port === m.port);
      const app: App = { ...(detected ?? { name: null, frameworkValue: null, folder: null, framework: live.framework, title: live.title }), ...live, port: m.port, address: live.address };
      await this.connect(app, project, m.durationMinutes || undefined, "panel");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return this.sessionExpired();
      this.output.error(`Share failed: ${error instanceof Error ? error.message : String(error)}`);
      this.tell({ tone: "error", text: "Couldn't start sharing. Check your internet connection and try again.", actions: [{ label: "Show Log", message: { type: "link", target: "log" } }] });
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /** Share App from the Command Palette: pick a running app → project → who can open it → how long. */
  async share(arg?: Ref) {
    if (!(await this.ensureReady("command"))) return;
    const app = await this.pickApp(arg);
    if (!app) return;
    const existing = this.shares.activeForPort(app.port);
    if (existing) {
      const action = await vscode.window.showInformationMessage("Localians: this app is already being shared.", "Copy Link", "Open");
      if (action === "Copy Link") await this.copyLink({ kind: "share", sessionId: existing.sessionId });
      if (action === "Open") await this.openPreview({ kind: "share", sessionId: existing.sessionId });
      return;
    }
    const project = await this.pickProject(app);
    if (!project) return;
    if (project.plan && !project.plan.canShare) return this.tellRenew(project, "command");
    const access = await this.pickAccess(project, app.port);
    if (!access) return;
    const durationMinutes = await this.pickDuration(project);
    if (durationMinutes === null) return;
    await this.connect(app, project, durationMinutes || undefined, "command");
  }

  /**
   * How long the link works. The first choice lets Localians apply the project's plan (its free 24-hour preview, or
   * its Preview Pass); the others stop earlier. Longer lengths are only offered with a Preview Pass; the server
   * checks every choice against the plan.
   */
  private async pickDuration(project: ApiProject): Promise<number | null> {
    const prefs = this.context.workspaceState.get<Prefs>(PREFS_KEY);
    const allowed = durationsFor({ plan: project.plan ?? null });
    const last = prefs?.durationMinutes;
    const preferred = last !== undefined && allowed.includes(last) && (last === UNTIL_PLAN_ENDS || isDurationOption(last)) ? last : UNTIL_PLAN_ENDS;
    type Pick = vscode.QuickPickItem & { minutes: number };
    const items: Pick[] = [
      { label: `$(clock) Until the ${project.plan?.pass ? "Preview Pass" : "free preview"} ends`, description: preferred === UNTIL_PLAN_ENDS ? (last === UNTIL_PLAN_ENDS ? "Used last time" : "Recommended") : undefined, minutes: UNTIL_PLAN_ENDS },
      ...DURATION_OPTIONS.filter((o) => allowed.includes(o.minutes)).map((o) => ({
        label: `$(clock) Stop after ${o.label}`,
        description: o.minutes === preferred ? "Used last time" : o.minutes === DEFAULT_DURATION_MINUTES ? "Short demo" : undefined,
        minutes: o.minutes,
      })),
    ];
    items.sort((a, b) => Number(b.minutes === preferred) - Number(a.minutes === preferred));
    const picked = await vscode.window.showQuickPick(items, { title: "How long should the link work?", placeHolder: "The link stops working after this time. You can share again any time.", ignoreFocusOut: true });
    return picked ? picked.minutes : null;
  }

  private async pickApp(arg?: Ref): Promise<App | null> {
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
        placeHolder: this.apps.length ? "Running on this computer" : "No running local application found — start it (e.g. npm run dev) or enter its port",
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

  private tellNotRunning(port: number) {
    this.tell({
      tone: "warning",
      text: `Nothing is running on localhost:${port}. Start your app and try again.`,
      actions: [{ label: "Retry Detection", message: { type: "detect" } }],
    });
  }

  private tellRenew(project: { id: string; plan?: { free: string } | null }, origin: Origin = "panel") {
    this.tell(
      {
        tone: "warning",
        text: project.plan?.free === "limit_reached" ? "You've used the free previews available right now. A Preview Pass lets you share this project now." : "Your preview period has ended. Renew your Preview Pass to continue.",
        actions: [{ label: "Renew Preview Pass", message: { type: "upgrade", projectId: project.id } }],
      },
      origin,
    );
  }

  private async notRunning(port: number): Promise<null> {
    const action = await vscode.window.showWarningMessage(`Localians: nothing is running on localhost:${port}. Start your app and try again.`, "Try Again", "Choose Another Port");
    if (action === "Try Again") void vscode.commands.executeCommand("localians.share", { kind: "app", app: { port, address: "127.0.0.1", framework: null, title: null, name: null, frameworkValue: null, folder: null } });
    if (action === "Choose Another Port") void vscode.commands.executeCommand("localians.share", { kind: "manual" });
    return null;
  }

  private async pickProject(app: AppSuggestion): Promise<ApiProject | null> {
    if (!this.me) await this.loadAccount(true);
    const me = this.me;
    if (!me) return null;
    const byPortMap = this.context.workspaceState.get<Record<string, string>>(PROJECTS_KEY) ?? {};
    const suggestedName = suggestProjectName(app, this.workspaceApps(), vscode.workspace.workspaceFolders?.[0]?.name ?? "My app");
    const firstId = matchProject(me.projects, app.port, suggestedName, byPortMap[String(app.port)] ?? null);
    const first = me.projects.find((p) => p.id === firstId);
    type Pick = vscode.QuickPickItem & { project?: ApiProject; create?: boolean };
    const describe = (p: ApiProject) =>
      [p.defaultPort ? `port ${p.defaultPort}` : null, p.access === "password" ? "password protected" : null, p.plan?.pass ? "Preview Pass" : p.plan && !p.plan.canShare ? "free preview used" : null].filter(Boolean).join(" · ");
    const items: Pick[] = [];
    if (first) items.push({ label: `$(project) ${first.name}`, description: describe(first), detail: byPortMap[String(app.port)] === first.id ? "Used last time" : `Uses port ${app.port}`, project: first });
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
    return (await this.acknowledgePublic(project, port)) ? "public" : null;
  }

  /** The first public share of a project asks once (remembered per project). */
  private async acknowledgePublic(project: { id: string }, port: number) {
    const acked = this.context.globalState.get<string[]>(PUBLIC_ACK_KEY) ?? [];
    if (acked.includes(project.id)) return true;
    const ok = await vscode.window.showWarningMessage(
      `Share localhost:${port} publicly?`,
      { modal: true, detail: "Anyone with the link can open your app while sharing is on. Don't share apps with real customer data or secrets. You can add a password at any time." },
      "Share Publicly",
    );
    if (!ok) return false;
    await this.context.globalState.update(PUBLIC_ACK_KEY, [...acked, project.id].slice(-200));
    return true;
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
      await api.protectProject(project.id, password); // the password is only sent to the server, never logged or stored
    } catch (error) {
      // Servers from before this feature answer 404 without a Localians error code.
      if (error instanceof ApiError && error.status === 404 && error.code === "http_error") {
        this.tell({ tone: "warning", text: "This server can't set a preview password from VS Code yet. Set it in the dashboard (project → Access), then share again.", actions: [{ label: "Open Dashboard", message: { type: "link", target: "dashboard" } }] });
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

  private async connect(app: App, project: ApiProject, durationMinutes: number | undefined, origin: Origin) {
    try {
      const share = await vscode.window.withProgress(
        // From the sidebar: a quiet progress bar on the view (the panel shows "Sharing…"); from a command: a cancellable notification.
        origin === "panel" ? { location: { viewId: PANEL_VIEW_ID } } : { location: vscode.ProgressLocation.Notification, title: `Localians: sharing localhost:${app.port}…`, cancellable: true },
        async (_progress, cancel) => {
          const started = this.shares.start({ port: app.port, address: app.address, project, durationMinutes });
          cancel.onCancellationRequested(() => {
            const pending = this.shares.list().find((s) => s.port === app.port && s.status === "connecting");
            if (pending) void this.shares.stop(pending.sessionId);
          });
          return started;
        },
      );
      await this.context.workspaceState.update(PREFS_KEY, { port: app.port, projectId: project.id, durationMinutes: durationMinutes ?? UNTIL_PLAN_ENDS } satisfies Prefs);
      const byPort = this.context.workspaceState.get<Record<string, string>>(PROJECTS_KEY) ?? {};
      await this.context.workspaceState.update(PROJECTS_KEY, { ...byPort, [String(app.port)]: project.id });
      await vscode.env.clipboard.writeText(share.publicUrl);
      void this.loadAccount(false);
      const text = `Sharing ${share.projectName}. The link is copied${share.access === "password" ? " (password protected)" : ""} and works for ${formatRemaining(share.expiresAt - Date.now())}.`;
      if (origin === "panel" && this.panel.visible) {
        this.notice = { tone: "success", text, actions: [{ label: "Open Preview", message: { type: "preview", action: "open", id: share.sessionId } }] };
        this.render();
        return;
      }
      const action = await vscode.window.showInformationMessage(`Localians: ${text} ${share.publicUrl}`, "Open", "Stop Sharing");
      if (action === "Open") await this.openPreview({ kind: "share", sessionId: share.sessionId });
      if (action === "Stop Sharing") await this.stop({ kind: "share", sessionId: share.sessionId });
    } catch (error) {
      if (error instanceof ShareError && error.code === "auth") return this.sessionExpired();
      if (error instanceof ShareError && error.code === "user") return; // cancelled
      this.output.warn(`Share failed: ${error instanceof Error ? error.message : String(error)}`);
      this.tell(explainShareError(error, project.id, app.port), origin);
    }
  }

  private async reconnect(arg?: Ref) {
    const share = arg?.kind === "share" ? this.shares.get(arg.sessionId) : undefined;
    if (!share) return this.share();
    const live = await probe(share.port);
    if (!live) return this.tellNotRunning(share.port);
    this.shares.dismiss(share.sessionId);
    const project = this.me?.projects.find((p) => p.id === share.projectId) ?? { id: share.projectId, name: share.projectName, slug: "", framework: null, defaultPort: share.port };
    await this.connect({ ...live, name: share.projectName, frameworkValue: null, folder: null }, project, share.durationMinutes ?? undefined, "panel");
  }

  // ------------------------------------------------------------------ preview actions

  /** The preview a command applies to: the one it was invoked for, the only live one, or one the user picks. */
  private async target(arg?: Ref): Promise<{ share?: Share; remote?: RemotePreview } | null> {
    if (arg?.kind === "share") {
      const share = this.shares.get(arg.sessionId);
      return share ? { share } : null;
    }
    if (arg?.kind === "remote") {
      const remote = this.remote.find((r) => r.id === arg.id);
      return remote ? { remote } : null;
    }
    const candidates: { share?: Share; remote?: RemotePreview }[] = [...this.live().map((share) => ({ share })), ...this.remote.map((remote) => ({ remote }))];
    if (candidates.length <= 1) return candidates[0] ?? null;
    const picked = await vscode.window.showQuickPick(
      candidates.map((c) => ({
        label: c.share?.projectName ?? c.remote!.project.name,
        description: c.share ? `:${c.share.port} · ${c.share.publicUrl}` : `:${c.remote!.localPort} · from a terminal`,
        c,
      })),
      { title: "Which preview?" },
    );
    return picked?.c ?? null;
  }

  async stop(arg?: Ref, origin: Origin = "command") {
    const t = await this.target(arg);
    if (!t) return void vscode.window.showInformationMessage("Localians: nothing is being shared.");
    if (t.share) {
      await this.shares.stop(t.share.sessionId);
      this.shares.dismiss(t.share.sessionId);
      const text = `Stopped sharing ${t.share.projectName}. The link no longer works.`;
      if (origin === "panel" && this.panel.visible) this.notice = { tone: "info", text, actions: [] };
      else void vscode.window.showInformationMessage(`Localians: ${text}`);
    } else if (t.remote) {
      await this.api()?.closeTunnel(t.remote.id);
      const text = `Stopped ${t.remote.project.name}.`;
      if (origin === "panel" && this.panel.visible) this.notice = { tone: "info", text, actions: [] };
      else void vscode.window.showInformationMessage(`Localians: ${text}`);
    }
    await this.loadAccount(false);
    this.render();
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
    const live = this.live();
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
    this.cancelSignIn = true;
    await Promise.race([this.shares.stopAll(), new Promise((r) => setTimeout(r, 4000))]);
  }

  dispose() {
    this.stopPolling();
    for (const d of this.disposables.splice(0)) d.dispose();
  }
}

/** Plain-words explanation and a useful next step for a failed share (never a raw server error). */
export function explainShareError(error: unknown, projectId: string, port: number): Notice {
  const code = error instanceof ShareError ? error.code : "";
  switch (code) {
    case "free_used":
      return { tone: "warning", text: "Your preview period has ended. Renew your Preview Pass to continue.", actions: [{ label: "Renew Preview Pass", message: { type: "upgrade", projectId } }] };
    case "free_limit":
      return { tone: "warning", text: "You've used the free previews available right now. A Preview Pass lets you share this project now.", actions: [{ label: "Get a Preview Pass", message: { type: "upgrade", projectId } }] };
    case "too_many_tunnels":
      return { tone: "warning", text: "You've reached your active preview limit. Stop another preview or review your plan.", actions: [{ label: "Review Plan", message: { type: "link", target: "billing" } }] };
    case "already_sharing":
      return { tone: "info", text: "This app is already being shared. Open its active preview below.", actions: [] };
    case "not_found":
      return { tone: "warning", text: "Project not found. Select an existing project or create a new one.", actions: [{ label: "Refresh", message: { type: "detect" } }] };
    case "plan_required":
    case "invalid_duration":
      return { tone: "warning", text: "That length needs a Preview Pass for this project. Choose a shorter one, or get a pass.", actions: [{ label: "Get a Preview Pass", message: { type: "upgrade", projectId } }] };
    case "project_archived":
      return { tone: "warning", text: "This project is archived. Restore it in the dashboard, or choose another project.", actions: [{ label: "Open Dashboard", message: { type: "link", target: "dashboard" } }] };
    case "bandwidth_quota":
      return { tone: "warning", text: "This workspace has used today's preview bandwidth. Sharing is available again after midnight UTC.", actions: [] };
    case "too_many_sessions":
      return { tone: "warning", text: "You've started a lot of previews today. Keep one running longer, or try again later.", actions: [] };
    case "tunnels_unavailable":
      return { tone: "error", text: "Sharing isn't available on this Localians server right now. Try again later.", actions: [{ label: "Troubleshooting", message: { type: "link", target: "troubleshooting" } }] };
    default:
      return {
        tone: "error",
        text: `Couldn't share localhost:${port}. Check your internet connection and try again.`,
        actions: [
          { label: "Troubleshooting", message: { type: "link", target: "troubleshooting" } },
          { label: "Show Log", message: { type: "link", target: "log" } },
        ],
      };
  }
}

/** Commands can be invoked with a Ref, an object holding one, or nothing (Command Palette / keybinding). */
function toRef(arg: unknown): Ref | undefined {
  if (!arg || typeof arg !== "object") return undefined;
  if ("ref" in arg) return (arg as { ref: Ref }).ref;
  if ("kind" in arg) return arg as Ref;
  return undefined;
}
