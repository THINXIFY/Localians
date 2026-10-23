/**
 * How long a preview session lasts. Shared by the control plane (which enforces it), the dashboard, the CLI and the
 * VS Code extension, so every client offers the same choices. The server only accepts these values and checks them
 * against the workspace's plan; clients can't extend a session by sending something else.
 */
export type DurationOption = { minutes: number; label: string; short: string; plan: "free" | "pass" };

export const DURATION_OPTIONS: readonly DurationOption[] = [
  { minutes: 5, label: "5 minutes", short: "5m", plan: "free" },
  { minutes: 15, label: "15 minutes", short: "15m", plan: "free" },
  { minutes: 30, label: "30 minutes", short: "30m", plan: "free" },
  { minutes: 60, label: "1 hour", short: "1h", plan: "free" },
  { minutes: 12 * 60, label: "12 hours", short: "12h", plan: "free" },
  { minutes: 24 * 60, label: "24 hours", short: "24h", plan: "free" },
  { minutes: 3 * 24 * 60, label: "3 days", short: "3d", plan: "pass" },
  { minutes: 7 * 24 * 60, label: "7 days", short: "7d", plan: "pass" },
];

/** Longest session on the free plan, and with a Preview Pass. */
export const FREE_MAX_MINUTES = 24 * 60;
export const PASS_MAX_MINUTES = 7 * 24 * 60;
/** What the dashboard preselects. */
export const DEFAULT_DURATION_MINUTES = 60;
/** What a client that doesn't choose gets (older CLI and VS Code versions): the free maximum, as before timers existed. */
export const LEGACY_DURATION_MINUTES = FREE_MAX_MINUTES;

export const isDurationOption = (minutes: unknown): minutes is number => DURATION_OPTIONS.some((o) => o.minutes === minutes);

export const durationLabel = (minutes: number) => DURATION_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} minutes`;

/** `5m`, `15m`, `30m`, `1h`, `12h`, `24h`, `3d`, `7d` (also `90` = minutes, `2h`, `1d`) → minutes; null if not a listed option. */
export function parseDuration(input: string): number | null {
  const match = /^\s*(\d{1,5})\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)?\s*$/i.exec(input);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = (match[2] ?? "m").toLowerCase()[0];
  const minutes = unit === "d" ? n * 24 * 60 : unit === "h" ? n * 60 : n;
  return isDurationOption(minutes) ? minutes : null;
}

/** "2h 05m", "14m 09s", "45s" — for countdowns. */
export function formatRemaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  if (d) return `${d}d ${pad(h)}h`;
  if (h) return `${h}h ${pad(m)}m`;
  if (m) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

/** endReason recorded when a session's chosen time runs out (distinguishes "Expired" from "went offline"). */
export const TIME_UP_REASON = "Preview time ended";
