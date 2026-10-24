import { DURATION_OPTIONS } from "@tunnel/shared/durations";

/**
 * The Localians sidebar panel's data (extension → webview) and the messages it may send back (webview → extension).
 * The state never contains tokens or passwords. Every incoming message is validated by parseMessage before anything
 * acts on it, so a compromised or buggy webview can only ask for the same things its buttons offer.
 */

export type PanelPlan = {
  pass: boolean;
  passEndsAt: string | null;
  free: "available" | "active" | "used" | "limit_reached";
  freeEndsAt: string | null;
  canShare: boolean;
};

export type PanelProject = {
  id: string;
  name: string;
  defaultPort: number | null;
  access: "public" | "password";
  hasPassword: boolean;
  customUrl: string | null;
  /** null: an older server that doesn't report plans (the server still enforces them). */
  plan: PanelPlan | null;
};

export type PanelApp = {
  port: number;
  /** "Next.js · my-shop" or the page title. */
  label: string;
  framework: string | null;
  /** Name for a new project for this app. */
  suggestedName: string;
  /** The project this app most likely belongs to (remembered, same port, or same name); null = create one. */
  projectId: string | null;
};

export type PanelPreview = {
  id: string;
  /** "local": started from this VS Code window (full control); "remote": from a terminal or another computer. */
  source: "local" | "remote";
  project: string;
  projectId: string | null;
  port: number;
  status: "connecting" | "connected" | "reconnecting" | "ended" | "offline";
  url: string | null;
  access: "public" | "password" | null;
  plan: "free" | "pass" | null;
  /** Epoch ms when the link stops working (local previews). */
  expiresAt: number | null;
  /** Why it ended, in plain words. */
  endMessage: string | null;
};

export type NoticeTone = "info" | "success" | "warning" | "error";
export type Notice = { tone: NoticeTone; text: string; actions: { label: string; message: PanelMessage }[] };

export type PanelState = {
  version: string;
  phase: "signedOut" | "signingIn" | "signedIn";
  trusted: boolean;
  /** While signing in: the one-time code and the approval page. */
  signIn: { code: string; url: string } | null;
  account: { name: string; username: string | null; email: string; workspace: string } | null;
  apps: PanelApp[];
  scanning: boolean;
  projects: PanelProject[];
  /** For a port typed by hand. */
  workspaceName: string;
  last: { port: number | null; durationMinutes: number };
  durations: { minutes: number; label: string; plan: "free" | "pass" }[];
  previews: PanelPreview[];
  limit: number | null;
  notice: Notice | null;
  busy: boolean;
  guideOpen: boolean;
  /** The project's checkout page (for "Upgrade"), the dashboard, docs. Only http(s) on the configured server. */
  serverUrl: string;
};

export const UNTIL_PLAN_ENDS = 0;
export const PANEL_DURATIONS = DURATION_OPTIONS.map(({ minutes, label, plan }) => ({ minutes, label, plan }));

export type LinkTarget = "dashboard" | "docs" | "troubleshooting" | "settings" | "walkthrough" | "trust" | "log" | "billing";

export type PanelMessage =
  | { type: "ready" }
  | { type: "signIn" }
  | { type: "cancelSignIn" }
  | { type: "copyCode" }
  | { type: "openApproval" }
  | { type: "signOut" }
  | { type: "switchAccount" }
  | { type: "detect" }
  | { type: "share"; port: number; projectId: string | null; newProjectName: string | null; access: "public" | "password"; durationMinutes: number }
  | { type: "preview"; action: "copy" | "open" | "stop" | "reshare" | "dismiss"; id: string }
  | { type: "upgrade"; projectId: string }
  | { type: "link"; target: LinkTarget }
  | { type: "guide"; open: boolean }
  | { type: "dismissNotice" };

const SIMPLE = new Set(["ready", "signIn", "cancelSignIn", "copyCode", "openApproval", "signOut", "switchAccount", "detect", "dismissNotice"]);
const LINKS = new Set<LinkTarget>(["dashboard", "docs", "troubleshooting", "settings", "walkthrough", "trust", "log", "billing"]);
const PREVIEW_ACTIONS = new Set(["copy", "open", "stop", "reshare", "dismiss"]);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DURATIONS = new Set([UNTIL_PLAN_ENDS, ...DURATION_OPTIONS.map((o) => o.minutes)]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPort = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 65535;

/** Accepts exactly the messages the panel can send, with valid values; anything else is null (ignored). */
export function parseMessage(raw: unknown): PanelMessage | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;
  const { type } = raw;
  if (SIMPLE.has(type)) return { type } as PanelMessage;
  switch (type) {
    case "share": {
      const { port, projectId, newProjectName, access, durationMinutes } = raw;
      if (!isPort(port) || (access !== "public" && access !== "password") || !Number.isInteger(durationMinutes) || !DURATIONS.has(durationMinutes as number)) return null;
      if (projectId !== null && !(typeof projectId === "string" && ID.test(projectId))) return null;
      let name: string | null = null;
      if (projectId === null) {
        if (typeof newProjectName !== "string") return null;
        name = newProjectName.trim().replace(/\s+/g, " ");
        if (name.length < 1 || name.length > 80) return null;
      }
      return { type, port, projectId, newProjectName: name, access, durationMinutes: durationMinutes as number };
    }
    case "preview":
      return typeof raw.action === "string" && PREVIEW_ACTIONS.has(raw.action) && typeof raw.id === "string" && ID.test(raw.id)
        ? { type, action: raw.action as "copy", id: raw.id }
        : null;
    case "upgrade":
      return typeof raw.projectId === "string" && ID.test(raw.projectId) ? { type, projectId: raw.projectId } : null;
    case "link":
      return typeof raw.target === "string" && LINKS.has(raw.target as LinkTarget) ? { type, target: raw.target as LinkTarget } : null;
    case "guide":
      return typeof raw.open === "boolean" ? { type, open: raw.open } : null;
    default:
      return null;
  }
}

/**
 * Durations a project may use: "until the plan ends" plus the free lengths, and the longer ones only with a Preview
 * Pass. Unknown plan (older server): the free lengths (the server decides anyway).
 */
export function durationsFor(project: Pick<PanelProject, "plan"> | null) {
  return [UNTIL_PLAN_ENDS, ...PANEL_DURATIONS.filter((d) => d.plan === "free" || project?.plan?.pass).map((d) => d.minutes)];
}

/**
 * Which project an app most likely belongs to: remembered for this port, the one using the port, or one named like it
 * that isn't bound to another port. Never a project that uses a different port: then a new one is suggested.
 */
export function matchProject(projects: Pick<PanelProject, "id" | "name" | "defaultPort">[], port: number, suggestedName: string, rememberedId: string | null) {
  if (rememberedId && projects.some((p) => p.id === rememberedId)) return rememberedId;
  const byPort = projects.filter((p) => p.defaultPort === port);
  if (byPort.length === 1) return byPort[0].id;
  const wanted = suggestedName.trim().toLowerCase();
  const candidates = byPort.length ? byPort : projects.filter((p) => p.defaultPort === null);
  const byName = candidates.find((p) => p.name.trim().toLowerCase() === wanted);
  return byName?.id ?? byPort[0]?.id ?? null;
}
