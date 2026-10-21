export type GatewayErrorKind =
  | "not-found"
  | "offline"
  | "local-unreachable"
  | "local-timeout"
  | "bad-gateway"
  | "too-large"
  | "rate-limited"
  | "busy"
  | "bad-request"
  | "protected"
  | "unavailable";

const PAGES: Record<GatewayErrorKind, { status: number; title: string; body: string }> = {
  "not-found": { status: 404, title: "This preview link isn't active", body: "The link may be mistyped, or the developer has stopped sharing." },
  offline: { status: 503, title: "This preview is offline", body: "The developer's Localians CLI isn't connected right now. Try again in a moment." },
  "local-unreachable": { status: 502, title: "The app isn't running", body: "Localians is connected, but the developer's local server isn't responding. They may have stopped it." },
  "local-timeout": { status: 504, title: "The app took too long to respond", body: "The developer's local server didn't answer in time." },
  "bad-gateway": { status: 502, title: "Something went wrong", body: "The preview connection was interrupted. Please try again." },
  "too-large": { status: 413, title: "Request too large", body: "This request is larger than previews allow." },
  "rate-limited": { status: 429, title: "Too many requests", body: "Please slow down and try again shortly." },
  busy: { status: 503, title: "Preview is busy", body: "This preview is handling too many requests. Please try again shortly." },
  "bad-request": { status: 400, title: "Bad request", body: "The request couldn't be understood." },
  protected: { status: 401, title: "Password required", body: "This preview is password protected. Open it in a browser to enter the password." },
  unavailable: { status: 503, title: "This preview is starting", body: "Localians is still confirming this preview. Try again in a few seconds." },
};

export const statusFor = (kind: GatewayErrorKind) => PAGES[kind].status;

/** Small branded HTML page. Static text only — nothing from the request is reflected. */
export function errorPage(kind: GatewayErrorKind) {
  const { status, title, body } = PAGES[kind];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Localians</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070907;color:#f7f8f5;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:440px;padding:32px 24px}p.k{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.16em;color:#a7b0a4}p.k span{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:2px;background:#b8ff3b}h1{margin:16px 0 8px;font-size:26px;line-height:1.2;letter-spacing:-.02em}p{color:#a7b0a4;margin:0}small{display:block;margin-top:24px;color:#858f84;font:12px ui-monospace,Menlo,monospace}</style></head><body><main><p class="k"><span></span>LOCALIANS</p><h1>${title}</h1><p>${body}</p><small>HTTP ${status}</small></main></body></html>`;
  return { status, html };
}
