import * as vscode from "vscode";
import type { AppSuggestion } from "./core/detect";
import type { Share } from "./core/shares";

export type RemotePreview = { id: string; publicUrl: string | null; localPort: number; status: string; project: { name: string } };

/** What a tree row stands for; passed to commands invoked from the row. */
export type Ref =
  | { kind: "section"; id: "previews" | "apps" | "account" }
  | { kind: "share"; sessionId: string }
  | { kind: "remote"; id: string; publicUrl: string | null }
  | { kind: "app"; app: AppSuggestion }
  | { kind: "manual" }
  | { kind: "link"; url: string }
  | { kind: "info" };

export class Item extends vscode.TreeItem {
  constructor(
    readonly ref: Ref,
    label: string,
    collapsible = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsible);
  }
}

export type TreeModel = {
  signedIn: boolean;
  account: { email: string; workspace: string; server: string } | null;
  shares: Share[];
  remote: RemotePreview[];
  apps: AppSuggestion[];
  scanning: boolean;
  trusted: boolean;
};

const STATUS: Record<Share["status"], { text: string; icon: string; color: string }> = {
  connecting: { text: "Connecting…", icon: "loading~spin", color: "charts.yellow" },
  connected: { text: "Connected", icon: "circle-filled", color: "charts.green" },
  reconnecting: { text: "Reconnecting…", icon: "sync~spin", color: "charts.yellow" },
  ended: { text: "Stopped", icon: "circle-outline", color: "disabledForeground" },
};

/** The Localians sidebar: previews, local apps, account. Native tree items only (theme-aware, keyboard accessible). */
export class LocaliansTree implements vscode.TreeDataProvider<Item> {
  private readonly changed = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly model: () => TreeModel) {}

  refresh() {
    this.changed.fire(undefined);
  }

  getTreeItem(item: Item) {
    return item;
  }

  getChildren(parent?: Item): Item[] {
    const m = this.model();
    if (!m.signedIn) return []; // the welcome view (package.json "viewsWelcome") shows instead
    if (!parent) {
      return [
        section("previews", "Previews", m.shares.filter((s) => s.status !== "ended").length + m.remote.length),
        section("apps", "Local apps", m.apps.length),
        section("account", "Account"),
      ];
    }
    const ref = parent.ref;
    if (ref.kind === "section" && ref.id === "previews") return this.previews(m);
    if (ref.kind === "section" && ref.id === "apps") return this.apps(m);
    if (ref.kind === "section" && ref.id === "account") return this.account(m);
    if (ref.kind === "share") {
      const share = m.shares.find((s) => s.sessionId === ref.sessionId);
      return share ? shareDetails(share) : [];
    }
    return [];
  }

  private previews(m: TreeModel): Item[] {
    const items = m.shares.map(shareItem);
    for (const r of m.remote) items.push(remoteItem(r));
    if (!items.length) {
      const empty = new Item({ kind: "info" }, "Nothing shared yet");
      empty.description = "Pick a local app below";
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }
    return items;
  }

  private apps(m: TreeModel): Item[] {
    const items: Item[] = m.apps.map((app) => {
      const item = new Item({ kind: "app", app }, app.name ?? app.title ?? `localhost:${app.port}`);
      item.description = [`:${app.port}`, app.framework].filter(Boolean).join(" · ");
      item.tooltip = new vscode.MarkdownString(`**localhost:${app.port}**${app.framework ? ` · ${app.framework}` : ""}${app.folder ? `\n\n${app.folder}` : ""}\n\nClick to share it.`);
      item.iconPath = new vscode.ThemeIcon("server-process");
      item.contextValue = "app";
      item.command = { command: "localians.share", title: "Share App", arguments: [item.ref] };
      item.accessibilityInformation = { label: `Running app on port ${app.port}${app.framework ? `, ${app.framework}` : ""}. Activate to share.` };
      return item;
    });
    if (!m.apps.length) {
      const none = new Item({ kind: "info" }, m.scanning ? "Looking for running apps…" : "No running app found");
      none.description = m.scanning ? "" : "Start your app (e.g. npm run dev), then refresh";
      none.iconPath = new vscode.ThemeIcon(m.scanning ? "loading~spin" : "info");
      items.push(none);
    }
    const manual = new Item({ kind: "manual" }, "Share another port…");
    manual.iconPath = new vscode.ThemeIcon("add");
    manual.command = { command: "localians.share", title: "Share App", arguments: [{ kind: "manual" }] };
    items.push(manual);
    if (!m.trusted) {
      const trust = new Item({ kind: "info" }, "Trust this workspace to share");
      trust.iconPath = new vscode.ThemeIcon("shield");
      trust.command = { command: "workbench.trust.manage", title: "Manage Workspace Trust" };
      items.unshift(trust);
    }
    return items;
  }

  private account(m: TreeModel): Item[] {
    const who = new Item({ kind: "info" }, m.account?.email ?? "Signed in");
    who.description = m.account?.workspace;
    who.tooltip = m.account ? `${m.account.email} — ${m.account.workspace}\n${m.account.server}` : undefined;
    who.iconPath = new vscode.ThemeIcon("account");
    const dashboard = new Item({ kind: "info" }, "Open dashboard");
    dashboard.iconPath = new vscode.ThemeIcon("globe");
    dashboard.command = { command: "localians.openDashboard", title: "Open Dashboard" };
    const help = new Item({ kind: "info" }, "Help");
    help.iconPath = new vscode.ThemeIcon("question");
    help.command = { command: "localians.help", title: "Help" };
    const settings = new Item({ kind: "info" }, "Settings");
    settings.iconPath = new vscode.ThemeIcon("gear");
    settings.command = { command: "workbench.action.openSettings", title: "Settings", arguments: ["@ext:thinxify.localians"] };
    return [who, dashboard, settings, help];
  }
}

function section(id: "previews" | "apps" | "account", label: string, count?: number) {
  const item = new Item({ kind: "section", id }, label, id === "account" ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
  item.id = `section:${id}`;
  if (count) item.description = String(count);
  item.contextValue = `section.${id}`;
  return item;
}

function shareItem(share: Share) {
  const s = STATUS[share.status];
  const item = new Item({ kind: "share", sessionId: share.sessionId }, share.projectName, vscode.TreeItemCollapsibleState.Expanded);
  item.id = `share:${share.sessionId}`;
  item.description = `${s.text} · :${share.port}`;
  item.iconPath = new vscode.ThemeIcon(s.icon, new vscode.ThemeColor(s.color));
  item.contextValue = share.status === "ended" ? "share.ended" : "share.live";
  item.tooltip = new vscode.MarkdownString(
    `**${share.projectName}** — ${s.text}\n\n${share.publicUrl}\n\nlocalhost:${share.port} · ${share.access === "password" ? "Password protected" : "Public — anyone with the link"}`,
  );
  item.accessibilityInformation = { label: `${share.projectName}, ${s.text}, port ${share.port}, ${share.access === "password" ? "password protected" : "public"}` };
  return item;
}

function shareDetails(share: Share): Item[] {
  const link = new Item({ kind: "link", url: share.publicUrl }, share.publicUrl.replace(/^https?:\/\//, ""));
  link.iconPath = new vscode.ThemeIcon("link");
  link.tooltip = "Copy the preview link";
  link.command = { command: "localians.copyLink", title: "Copy Preview Link", arguments: [{ kind: "share", sessionId: share.sessionId }] };
  const access = new Item({ kind: "info" }, share.access === "password" ? "Password protected" : "Public — anyone with the link");
  access.iconPath = new vscode.ThemeIcon(share.access === "password" ? "lock" : "globe");
  if (share.access === "public" && share.status !== "ended") {
    access.command = { command: "localians.protect", title: "Set Preview Password", arguments: [{ kind: "share", sessionId: share.sessionId }] };
    access.tooltip = "Click to protect it with a password";
  }
  const items = [link, access];
  if (share.status === "ended" && share.endMessage) {
    const why = new Item({ kind: "info" }, share.endMessage);
    why.iconPath = new vscode.ThemeIcon("info");
    items.push(why);
  }
  return items;
}

function remoteItem(r: RemotePreview) {
  const item = new Item({ kind: "remote", id: r.id, publicUrl: r.publicUrl }, r.project.name);
  item.id = `remote:${r.id}`;
  item.description = `${r.status === "CONNECTED" ? "Connected" : r.status.toLowerCase()} · :${r.localPort} · elsewhere`;
  item.tooltip = `Shared from another terminal or computer.\n${r.publicUrl ?? ""}`;
  item.iconPath = new vscode.ThemeIcon("remote", new vscode.ThemeColor(r.status === "CONNECTED" ? "charts.green" : "charts.yellow"));
  item.contextValue = "share.remote";
  return item;
}
