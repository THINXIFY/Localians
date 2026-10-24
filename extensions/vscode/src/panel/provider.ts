import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { parseMessage, type PanelMessage, type PanelState } from "./model";

export const PANEL_VIEW_ID = "localians.panel";

/**
 * The page shell. Everything it loads comes from the extension's media/panel folder; the Content Security Policy
 * allows nothing else (no remote content, no inline code except the nonce'd script tag, no eval). The state arrives
 * later by postMessage, so no account data is ever part of the HTML.
 */
export function panelHtml(webview: Pick<vscode.Webview, "cspSource" | "asWebviewUri">, mediaRoot: vscode.Uri, nonce = randomBytes(18).toString("base64")) {
  const css = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "panel.css"));
  const js = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "panel.js"));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}">
<title>Localians</title>
</head>
<body>
<main id="app" aria-live="polite" aria-busy="true"><p class="muted loading">Loading Localians…</p></main>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}

/** Hosts the sidebar panel: sends state, receives validated messages. Holds no secrets itself. */
export class PanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly visibility = new vscode.EventEmitter<boolean>();
  readonly onDidChangeVisibility = this.visibility.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly state: () => PanelState,
    private readonly onMessage: (message: PanelMessage) => unknown,
    private readonly log: (line: string) => void,
  ) {}

  get visible() {
    return Boolean(this.view?.visible);
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, "media", "panel");
    view.webview.options = { enableScripts: true, enableCommandUris: false, localResourceRoots: [mediaRoot] };
    view.webview.html = panelHtml(view.webview, mediaRoot);
    this.disposables.push(
      view.webview.onDidReceiveMessage((raw: unknown) => {
        const message = parseMessage(raw);
        if (!message) return this.log("Ignored an unexpected message from the Localians panel.");
        if (message.type === "ready") return this.post();
        void this.onMessage(message);
      }),
      view.onDidChangeVisibility(() => {
        this.visibility.fire(view.visible);
        if (view.visible) this.post();
      }),
      view.onDidDispose(() => {
        this.view = undefined;
        this.visibility.fire(false);
      }),
    );
    this.visibility.fire(view.visible);
  }

  /** Sends the current state (cheap; the panel re-renders only what changed). */
  post() {
    if (!this.view) return;
    void this.view.webview.postMessage({ type: "state", state: this.state() });
  }

  dispose() {
    for (const d of this.disposables.splice(0)) d.dispose();
    this.visibility.dispose();
  }
}
