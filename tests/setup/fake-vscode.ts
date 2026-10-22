/**
 * A small stand-in for the `vscode` module, enough to activate the Localians extension in Vitest and observe what it
 * registers, shows and stores. (The real editor is exercised by extensions/vscode/test.)
 */
type Listener<T> = (e: T) => unknown;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  };
  fire(e: T) {
    for (const l of this.listeners) l(e);
  }
  dispose() {
    this.listeners = [];
  }
}

export const fake = {
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  disposedCommands: [] as string[],
  context: new Map<string, unknown>(),
  messages: [] as { level: "info" | "warn" | "error"; text: string }[],
  /** Answer the next message prompt with this button. */
  answers: [] as (string | undefined)[],
  statusBars: [] as { text: string; command?: string; visible: boolean; disposed: boolean }[],
  treeViews: [] as { id: string; provider: { getChildren(e?: unknown): unknown[] }; visible: boolean; disposed: boolean }[],
  config: new Map<string, unknown>(),
  opened: [] as string[],
  clipboard: "",
  trusted: true,
  folders: [] as { uri: { fsPath: string; scheme: string }; name: string }[],
  reset() {
    this.commands.clear();
    this.disposedCommands = [];
    this.context.clear();
    this.messages = [];
    this.answers = [];
    this.statusBars = [];
    this.treeViews = [];
    this.config.clear();
    this.opened = [];
    this.clipboard = "";
    this.trusted = true;
    this.folders = [];
  },
};

const message = (level: "info" | "warn" | "error") => async (text: string) => {
  fake.messages.push({ level, text });
  return fake.answers.shift();
};

export const version = "1.99.0-fake";
export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}
export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}
export enum ProgressLocation {
  Notification = 15,
}
export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}
export class ThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: unknown,
  ) {}
}
export class ThemeColor {
  constructor(readonly id: string) {}
}
export class MarkdownString {
  constructor(readonly value = "") {}
}
export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: unknown;
  iconPath?: unknown;
  contextValue?: string;
  command?: unknown;
  accessibilityInformation?: unknown;
  constructor(
    readonly label: string,
    readonly collapsibleState = TreeItemCollapsibleState.None,
  ) {}
}
export const Uri = {
  parse: (value: string) => ({ toString: () => value, value }),
  file: (fsPath: string) => ({ fsPath, scheme: "file" }),
};

const grantTrust = new EventEmitter<void>();
const configChanged = new EventEmitter<{ affectsConfiguration: (s: string) => boolean }>();
export const _events = { grantTrust, configChanged };

export const window = {
  createOutputChannel: () => ({ info() {}, warn() {}, error() {}, show() {}, dispose() {} }),
  createStatusBarItem: () => {
    const item = { text: "", command: undefined as string | undefined, tooltip: undefined as unknown, name: "", accessibilityInformation: undefined as unknown, visible: false, disposed: false, show() { item.visible = true; }, dispose() { item.disposed = true; } };
    fake.statusBars.push(item);
    return item;
  },
  createTreeView: (id: string, options: { treeDataProvider: { getChildren(e?: unknown): unknown[] } }) => {
    const view = { id, provider: options.treeDataProvider, visible: false, disposed: false, onDidChangeVisibility: new EventEmitter<{ visible: boolean }>().event, dispose() { view.disposed = true; } };
    fake.treeViews.push(view);
    return view;
  },
  showInformationMessage: message("info"),
  showWarningMessage: message("warn"),
  showErrorMessage: message("error"),
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
  setStatusBarMessage: (text: string) => {
    fake.messages.push({ level: "info", text });
    return { dispose() {} };
  },
  withProgress: async (_o: unknown, task: (p: unknown, c: unknown) => unknown) =>
    task({ report() {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) }),
};

export const commands = {
  registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
    fake.commands.set(id, run);
    return { dispose: () => fake.disposedCommands.push(id) };
  },
  executeCommand: async (id: string, ...args: unknown[]) => {
    if (id === "setContext") {
      fake.context.set(String(args[0]), args[1]);
      return;
    }
    return fake.commands.get(id)?.(...args);
  },
};

export const workspace = {
  get isTrusted() {
    return fake.trusted;
  },
  get workspaceFolders() {
    return fake.folders;
  },
  getConfiguration: (section: string) => ({ get: <T>(key: string, fallback?: T) => (fake.config.has(`${section}.${key}`) ? fake.config.get(`${section}.${key}`) : fallback) as T }),
  onDidChangeWorkspaceFolders: new EventEmitter<void>().event,
  onDidGrantWorkspaceTrust: grantTrust.event,
  onDidChangeConfiguration: configChanged.event,
};

export const env = {
  clipboard: { writeText: async (text: string) => void (fake.clipboard = text) },
  openExternal: async (uri: { toString(): string }) => {
    fake.opened.push(uri.toString());
    return true;
  },
};
