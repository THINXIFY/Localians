/** Client-safe vocabulary for preview statuses (mirrors PreviewStatus in src/server/previews.ts). */
export type PreviewStatusValue = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "EXPIRED" | "REVOKED" | "FAILED";

export const STATUS_LABEL: Record<PreviewStatusValue, string> = {
  CONNECTING: "Connecting",
  CONNECTED: "Connected",
  RECONNECTING: "Reconnecting",
  DISCONNECTED: "Disconnected",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
  FAILED: "Failed",
};

/** One-line explanations, used as badge titles and in details. */
export const STATUS_HELP: Record<PreviewStatusValue, string> = {
  CONNECTING: "The CLI is establishing the tunnel.",
  CONNECTED: "The gateway is serving this preview right now.",
  RECONNECTING: "The tunnel dropped. The CLI is trying to reconnect; the link is reserved meanwhile.",
  DISCONNECTED: "Sharing was stopped from the terminal.",
  EXPIRED: "The preview ended because the CLI went silent or the maximum share time passed.",
  REVOKED: "The preview was stopped from the dashboard, or its CLI login was revoked.",
  FAILED: "The CLI never connected, so this preview never served traffic.",
};

export type StatusTone = "live" | "warn" | "off" | "bad";

export const STATUS_TONE: Record<PreviewStatusValue, StatusTone> = {
  CONNECTING: "warn",
  CONNECTED: "live",
  RECONNECTING: "warn",
  DISCONNECTED: "off",
  EXPIRED: "off",
  REVOKED: "bad",
  FAILED: "bad",
};

export const isServing = (status: PreviewStatusValue) => status === "CONNECTED";

/** How traffic is counted — shown wherever request or bandwidth numbers appear. */
export const METERING_NOTE =
  "Requests: each HTTP request forwarded to your app, plus one per WebSocket connection. Bandwidth: request and response bodies plus WebSocket data, in both directions. Headers and encryption overhead aren't counted.";

/** The command developers run to start a new preview (until npm publication, via the linked dev CLI). */
export function shareCommand(port: number | null, projectId?: string, run = "localians") {
  return `${run} share ${port ?? "<port>"}${projectId ? ` --project ${projectId}` : ""}`;
}

export type PreviewEventType =
  | "CREATED"
  | "CONNECTED"
  | "RECONNECTED"
  | "CONNECTION_LOST"
  | "STOPPED_BY_CLI"
  | "STOPPED_FROM_DASHBOARD"
  | "REVOKED"
  | "EXPIRED"
  | "PROTECTION_CHANGED"
  | "VISITORS_SIGNED_OUT"
  | "QUOTA_EXCEEDED";

export const EVENT_LABEL: Record<PreviewEventType, string> = {
  CREATED: "Session created",
  CONNECTED: "Connected",
  RECONNECTED: "Reconnected",
  CONNECTION_LOST: "Connection lost",
  STOPPED_BY_CLI: "Stopped from the terminal",
  STOPPED_FROM_DASHBOARD: "Stopped from the dashboard",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
  PROTECTION_CHANGED: "Access changed",
  VISITORS_SIGNED_OUT: "Visitors signed out",
  QUOTA_EXCEEDED: "Stopped: usage limit reached",
};

export const EVENT_TONE: Record<PreviewEventType, StatusTone> = {
  CREATED: "off",
  CONNECTED: "live",
  RECONNECTED: "live",
  CONNECTION_LOST: "warn",
  STOPPED_BY_CLI: "off",
  STOPPED_FROM_DASHBOARD: "bad",
  REVOKED: "bad",
  EXPIRED: "off",
  PROTECTION_CHANGED: "off",
  VISITORS_SIGNED_OUT: "off",
  QUOTA_EXCEEDED: "bad",
};

/**
 * Port suggested by default in the dashboard (wizard, new projects, examples). Only a starting
 * value: any port 1–65535 can be shared, saved project ports are never changed, and framework
 * guidance (Next.js 3000, Angular 4200, …) stays specific.
 */
export const DEFAULT_LOCAL_PORT = 5173;
