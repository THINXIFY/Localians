"use client";

import { AlertTriangle, ArrowUpRight, Check, ChevronRight, Clock, Globe, Link2, Lock, Plus, RefreshCw, Shuffle, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import type { PaymentInfo, PlanSummary } from "@/lib/plans";
import { type PreviewStatusValue } from "@/lib/previews";
import { saveShareSetupAction } from "@/server/actions/share";
import { DURATION_OPTIONS, durationLabel, FREE_MAX_MINUTES, isDurationOption } from "@tunnel/shared/durations";
import { inputClasses, PasswordInput, Select } from "../Field";
import { PlanCards } from "../plans/PlanCards";
import { AccessBadge } from "../previews/AccessBadge";
import { Countdown } from "../previews/Countdown";
import { StopPreviewButton } from "../previews/PreviewActions";
import { PreviewStatusBadge } from "../previews/PreviewStatusBadge";
import { CopyLabelButton } from "./Command";
import { InstallBeta } from "./InstallBeta";

type SharePreview = {
  id: string;
  publicUrl: string | null;
  localPort: number;
  status: PreviewStatusValue;
  active: boolean;
  canStop: boolean;
  endReason: string | null;
  /** Date from the server render, ISO string from polling. */
  expiresAt: Date | string;
  durationMinutes: number | null;
  startedBeforeWizard: boolean;
  project: { id: string; name: string; access: "PUBLIC" | "PASSWORD" };
};
type ShareStatus = { cliLoggedIn: boolean; preview: SharePreview | null };
type ProjectOption = {
  id: string;
  name: string;
  slug: string;
  defaultPort: number | null;
  status: "ACTIVE" | "ARCHIVED";
  accessMode: "PUBLIC" | "PASSWORD";
  hasPassword: boolean;
  /** The project's custom preview name (7-Day Pass), if it has one. */
  customName: string | null;
};
type Access = "PUBLIC" | "PASSWORD";

const PRESETS = [
  { label: "Next.js", port: 3000 },
  { label: "Vite", port: 5173 },
  { label: "Angular", port: 4200 },
  { label: "Django", port: 8000 },
] as const;
const WAIT_HELP_AFTER_MS = 40_000;
/** Remembered between visits in this browser (never the password). */
const PREFS_KEY = "localians.share.v1";
type Prefs = { port?: number; projectId?: string; access?: Access; durationMinutes?: number | null };
/** Optional auto-stops shorter than the plan (null = until the free preview / pass ends). */
const AUTO_STOPS = DURATION_OPTIONS.filter((o) => o.minutes < FREE_MAX_MINUTES);
/** With a pass: also 24 hours and 3 days (7 days is the whole pass). */
const PASS_AUTO_STOPS = DURATION_OPTIONS.filter((o) => o.minutes === FREE_MAX_MINUTES || o.minutes === 3 * 24 * 60);

function readPrefs(): Prefs {
  try {
    const value = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function writePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / storage blocked: nothing to remember
  }
}

/**
 * Share App: Select project → Configure preview (port, Free or 7-Day Pass, auto-stop, link) → Start sharing. Choices are
 * saved to a single-use setup code that the command carries, so the CLI asks nothing. What a project may do (its one
 * free 24-hour preview, or a 7-Day Pass) is decided by the server; the cards here only show it.
 */
export function ShareWizard({
  openedAt,
  initialPort,
  portFromUrl,
  run,
  published,
  localGateway,
  workspaceName,
  projects,
  setup,
  initialStatus,
  customUrlsRouting,
  plans,
  payment,
  previewDomain,
}: {
  openedAt: number;
  initialPort: number;
  /** The port came from the URL (e.g. "Share again" on a project): don't override it with remembered preferences. */
  portFromUrl: boolean;
  run: string;
  published: boolean;
  localGateway: boolean;
  workspaceName: string;
  projects: ProjectOption[];
  setup: { id: string; code: string };
  initialStatus: ShareStatus;
  /** Whether this server routes custom URLs (gateways updated). */
  customUrlsRouting: boolean;
  plans: { byProject: Record<string, PlanSummary>; newProject: PlanSummary };
  payment: PaymentInfo;
  previewDomain: string;
}) {
  const router = useRouter();
  // Previews started after this moment are "this visit". Reset by Share again.
  const [since, setSince] = useState(openedAt);
  const active = projects.filter((p) => p.status === "ACTIVE");
  const byPort = (port: number | null) => (port ? active.find((p) => p.defaultPort === port) : undefined);
  const ids = { project: useId(), name: useId(), port: useId(), password: useId(), access: useId(), stop: useId(), url: useId() };

  // ---- choices ---------------------------------------------------------------------------------
  const [portText, setPortText] = useState(String(initialPort));
  const [projectId, setProjectId] = useState(() => byPort(initialPort)?.id ?? (active.length ? active[0].id : "")); // "" = new project
  const [projectTouched, setProjectTouched] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [access, setAccess] = useState<Access>(() => (byPort(initialPort) ?? active[0])?.accessMode ?? "PUBLIC");
  const [password, setPassword] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [urlChoice, setUrlChoice] = useState<"custom" | "random">("custom");

  const creating = projectId === "";
  const selected = active.find((p) => p.id === projectId);
  const plan = selected ? (plans.byProject[selected.id] ?? plans.newProject) : plans.newProject;
  const passActive = Boolean(plan.pass);
  /** The link the preview will get: the project's custom name when its pass allows it and it's chosen. */
  const customName = customUrlsRouting && passActive && selected?.customName ? selected.customName : null;
  const url: "custom" | "random" = customName && urlChoice === "custom" ? "custom" : "random";
  // A shorter auto-stop than the plan is optional; pass-only lengths disappear without a pass.
  const stopOptions = passActive ? [...AUTO_STOPS, ...PASS_AUTO_STOPS] : AUTO_STOPS;
  const autoStop = duration !== null && stopOptions.some((o) => o.minutes === duration) ? duration : null;
  const portNumber = Number(portText);
  const portValid = /^\d{1,5}$/.test(portText) && portNumber >= 1 && portNumber <= 65535;
  const port = portValid ? portNumber : null;

  function choosePort(next: number | null, text = next ? String(next) : "") {
    setPortText(text);
    if (projectTouched) return; // the developer picked a project on purpose
    const match = byPort(next);
    if (!match) return; // keep the current project; it just shares another port
    setProjectId(match.id);
    setAccess(match.accessMode);
  }
  function chooseProject(id: string) {
    setProjectTouched(true);
    setProjectId(id);
    const p = active.find((x) => x.id === id);
    setAccess(p ? p.accessMode : "PUBLIC");
    if (p?.defaultPort) setPortText(String(p.defaultPort));
  }

  // Repeat visits start where the developer left off (after hydration, so server and client render the same).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (portFromUrl) return;
    const prefs = readPrefs();
    const remembered = prefs.projectId ? active.find((p) => p.id === prefs.projectId) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
    if (prefs.port && prefs.port >= 1 && prefs.port <= 65535) setPortText(String(prefs.port));
    if (prefs.durationMinutes === null || isDurationOption(prefs.durationMinutes)) setDuration(prefs.durationMinutes ?? null);
    if (remembered) {
      setProjectId(remembered.id);
      setProjectTouched(true);
      setAccess(remembered.accessMode);
    } else if (prefs.port) {
      const match = byPort(prefs.port);
      if (match) {
        setProjectId(match.id);
        setAccess(match.accessMode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);
  useEffect(() => {
    if (restored.current && port) writePrefs({ port, projectId: projectId || undefined, access, durationMinutes: duration });
  }, [port, projectId, access, duration]);

  // ---- readiness + saving the choices to the setup code ---------------------------------------------
  const keepsPassword = Boolean(selected?.hasPassword) && password.length === 0;
  const passwordTooShort = access === "PASSWORD" && password.length > 0 && password.length < 8;
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string; passwordSaved?: boolean }>({ state: "idle" });
  const passwordReady = access === "PUBLIC" || password.length >= 8 || keepsPassword || Boolean(save.passwordSaved);
  const [retry, setRetry] = useState(0);

  // After a refresh (e.g. Share again) the page brings a new one-time code: its choices start unsaved, and a project
  // created by the last share is picked up by its port.
  const [seenSetup, setSeenSetup] = useState(setup.id);
  if (seenSetup !== setup.id) {
    setSeenSetup(setup.id);
    setSave({ state: "idle" });
    const match = !projectTouched && !projectId ? byPort(port) : undefined;
    if (match) {
      setProjectId(match.id);
      setAccess(match.accessMode);
    }
  }

  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    if (passwordTooShort) return;
    saveTimer.current = window.setTimeout(async () => {
      setSave((s) => ({ ...s, state: "saving" }));
      let result: Awaited<ReturnType<typeof saveShareSetupAction>>;
      try {
        result = await saveShareSetupAction(setup.id, {
          port,
          durationMinutes: autoStop,
          url,
          project: projectId ? { kind: "existing", id: projectId } : { kind: "new", name: projectName.trim() },
          access: access === "PASSWORD" ? { mode: "PASSWORD", ...(password.length >= 8 ? { password } : {}) } : { mode: "PUBLIC" },
        });
      } catch {
        // Network failure, or the session ended and the request was redirected to sign-in.
        result = { ok: false, error: "Couldn't save your choices. Check your connection, or sign in again." };
      }
      setSave(result.ok ? { state: "saved", passwordSaved: result.data.passwordSaved } : { state: "error", message: result.error });
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [setup.id, port, projectId, projectName, access, password, passwordTooShort, autoStop, url, retry]);

  const ready = portValid && passwordReady && !passwordTooShort && save.state !== "error" && plan.canShare;
  const command = `${run} share ${port ?? "<port>"} --setup ${setup.code}`;

  // ---- live status of this user's preview ---------------------------------------------------------
  const [status, setStatus] = useState<ShareStatus>(initialStatus);
  const [offline, setOffline] = useState(false);
  const [waitingLong, setWaitingLong] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let failures = 0;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const response = await fetch(`/api/dashboard/share-status?since=${since}`, { cache: "no-store" });
          if (!response.ok) throw new Error(String(response.status));
          setStatus((await response.json()) as ShareStatus);
          failures = 0;
          setOffline(false);
        } catch {
          failures += 1;
          if (failures >= 3) setOffline(true); // keep the last known state; keep trying
        }
      }
      if (!stopped) timer = window.setTimeout(poll, 2000);
    };
    timer = window.setTimeout(poll, 1500);
    const help = window.setTimeout(() => setWaitingLong(true), WAIT_HELP_AFTER_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(help);
    };
  }, [since]);

  const preview = status.preview;
  const phase: "idle" | "waiting" | "live" | "unstable" | "ended" =
    preview && preview.active && preview.publicUrl
      ? preview.status === "CONNECTED"
        ? "live"
        : "unstable"
      : preview && !preview.active && !preview.startedBeforeWizard
        ? "ended"
        : copied
          ? "waiting"
          : "idle";

  const length =
    autoStop !== null
      ? `for ${durationLabel(autoStop)}`
      : passActive
        ? `until the pass ends (${formatDateTime(new Date(plan.pass!.endsAt))})`
        : plan.free.state === "active"
          ? `until the free preview ends (${formatDateTime(new Date(plan.free.endsAt))})`
          : "for up to 24 hours";
  const commandNote = !plan.canShare
    ? plan.free.state === "limit_reached"
      ? `You've used ${plan.freeLimit} free previews in 30 days. Upgrade this project for ${payment.offer.priceLabel}, or try again later.`
      : `This project's free preview has ended. Upgrade for ${payment.offer.priceLabel} to share it for ${payment.offer.moreLabel}.`
    : !portValid
      ? "Enter a valid port to get your command."
      : access === "PASSWORD" && !passwordReady
        ? "Enter a password (8+ characters) to get the command."
        : save.state === "error"
          ? save.message
          : save.state === "saving"
            ? "Saving your choices…"
            : `Your link will work ${length}. The command works once, for the next 30 minutes.`;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <ol className="divide-y divide-line">
        {/* ---------------------------------------------------------------------- 1. Project */}
        <Step n={1} title="Select project">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] md:gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={creating ? ids.name : ids.project} className="text-[13px] font-medium text-fg">
              Project
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              {creating ? (
                <input
                  id={ids.name}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value.slice(0, 80))}
                  placeholder="Project name (optional)"
                  autoComplete="off"
                  className={cn(inputClasses, "h-10 w-full min-w-0 text-[14px] sm:flex-1")}
                  data-testid="new-project-name"
                />
              ) : (
                <Select id={ids.project} value={projectId} onChange={(e) => chooseProject(e.target.value)} density="sm" wrapperClassName="sm:flex-1" className="text-[14px]">
                  {active.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.defaultPort ? ` · :${p.defaultPort}` : ""}
                    </option>
                  ))}
                </Select>
              )}
              {active.length ? (
                <button
                  type="button"
                  onClick={() => {
                    if (creating) return chooseProject(byPort(port)?.id ?? active[0].id);
                    setProjectTouched(true);
                    setProjectId("");
                    setAccess("PUBLIC");
                  }}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-line-strong bg-tint/[0.02] px-3.5 text-[13px] font-medium text-fg-2 transition-colors hover:border-tint/25 hover:bg-tint/[0.05] hover:text-fg focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] focus-visible:outline-none"
                >
                  {creating ? (
                    "Choose existing"
                  ) : (
                    <>
                      <Plus className="size-3.5" aria-hidden="true" />
                      New project
                    </>
                  )}
                </button>
              ) : null}
            </div>
            <p className="text-[12px] text-fg-3" data-testid="project-hint">
              {creating
                ? "A new project is created when you run the command (named after your app if you leave this empty)."
                : !projectTouched && selected?.defaultPort === port
                  ? `Matched by port ${port}.`
                  : "Your preview is added to this project."}
            </p>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-medium text-fg">Who can open the link</legend>
            <div className="flex h-10 w-full rounded-xl border border-line-strong bg-tint/[0.02] p-1" role="radiogroup" aria-label="Who can open the link">
              {(
                [
                  { value: "PUBLIC", icon: Globe, label: "Public" },
                  { value: "PASSWORD", icon: Lock, label: "Password protected" },
                ] as const
              ).map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "relative flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] transition-colors has-[:focus-visible]:shadow-[0_0_0_3px_var(--accent-glow)]",
                    access === o.value ? "bg-accent/[0.12] font-medium text-fg" : "text-fg-2 hover:text-fg",
                  )}
                >
                  <input type="radio" name={ids.access} value={o.value} checked={access === o.value} onChange={() => setAccess(o.value)} className="absolute inset-0 cursor-pointer appearance-none rounded-lg opacity-0" />
                  <o.icon className={cn("size-3.5", access === o.value ? "text-accent-ink" : "text-fg-3")} aria-hidden="true" />
                  {o.value === "PASSWORD" ? (
                    <>
                      <span className="lg:hidden">Password</span>
                      <span className="hidden lg:inline">Password protected</span>
                    </>
                  ) : (
                    o.label
                  )}
                </label>
              ))}
            </div>
            {access === "PASSWORD" ? (
              <div className="flex flex-col gap-1 motion-safe:animate-[menu-in_160ms_ease-out]">
                <label htmlFor={ids.password} className="sr-only">
                  Preview password
                </label>
                <PasswordInput
                  id={ids.password}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={selected?.hasPassword ? "Keep the current password" : "Password (8+ characters)"}
                  autoComplete="new-password"
                  maxLength={128}
                  aria-invalid={passwordTooShort}
                  className="h-10 text-[13.5px]"
                />
                <p className={cn("text-[12px]", passwordTooShort ? "text-danger" : "text-fg-3")}>{passwordTooShort ? "Use at least 8 characters." : "Send it separately from the link."}</p>
              </div>
            ) : (
              <p className="text-[12px] text-fg-3">Anyone with the link can open your app while it&apos;s shared.</p>
            )}
          </fieldset>
          </div>
        </Step>

        {/* ---------------------------------------------------------------------- 2. Configure preview */}
        <Step n={2} title="Configure preview">
          <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.port} className="text-[13px] font-medium text-fg">
            Port
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 items-center rounded-xl border border-line-strong bg-tint/[0.03] pl-3.5 transition-colors hover:border-tint/25 focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_var(--accent-glow)]">
              <span className="select-none font-mono text-[12.5px] text-fg-3">localhost:</span>
              <input
                id={ids.port}
                inputMode="numeric"
                autoComplete="off"
                value={portText}
                onChange={(e) => {
                  const text = e.target.value.replace(/[^\d]/g, "").slice(0, 5);
                  const n = Number(text);
                  choosePort(/^\d{1,5}$/.test(text) && n >= 1 && n <= 65535 ? n : null, text);
                }}
                aria-invalid={!portValid}
                aria-describedby={`${ids.port}-hint`}
                className="h-full w-16 bg-transparent pr-3 font-mono text-[14.5px] text-fg outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common ports">
              {PRESETS.map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => choosePort(p.port)}
                  aria-pressed={port === p.port}
                  className={cn(
                    "inline-flex h-10 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-[12.5px] transition-colors focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] focus-visible:outline-none",
                    port === p.port ? "border-accent/45 bg-accent/[0.08] font-medium text-fg" : "border-line-strong text-fg-2 hover:border-tint/25 hover:bg-tint/[0.03] hover:text-fg",
                  )}
                >
                  {p.label} <span className="font-mono text-fg-3">{p.port}</span>
                </button>
              ))}
            </div>
          </div>
          <p id={`${ids.port}-hint`} className={cn("text-[12px]", portValid ? "text-fg-3" : "text-danger")}>
            {portValid ? "Use the port your dev server prints." : "Enter a port from 1 to 65535."}
          </p>
          </div>

          <PlanCards
            plan={plan}
            project={selected ? { id: selected.id, name: selected.name } : null}
            payment={payment}
            previewDomain={previewDomain}
            hasCustomName={Boolean(selected?.customName)}
          />

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={ids.stop} className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                <Clock className="size-3.5 text-fg-3" aria-hidden="true" />
                Auto-stop
              </label>
              <Select
                id={ids.stop}
                value={autoStop === null ? "" : String(autoStop)}
                onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
                density="sm"
                data-testid="auto-stop"
              >
                <option value="">{passActive ? "When the pass ends" : "When the free preview ends"}</option>
                {stopOptions.map((o) => (
                  <option key={o.minutes} value={o.minutes}>
                    After {o.label}
                  </option>
                ))}
              </Select>
            </div>
            {customName ? (
              <fieldset className="flex min-w-0 flex-col gap-1.5" data-testid="url-options">
                <legend className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <Link2 className="size-3.5 text-fg-3" aria-hidden="true" />
                  Preview link
                </legend>
                <div className="flex h-10 w-full min-w-0 rounded-xl border border-line-strong bg-tint/[0.02] p-1">
                  {(
                    [
                      { value: "custom", icon: Link2, label: `${customName}.${previewDomain}` },
                      { value: "random", icon: Shuffle, label: "Random link" },
                    ] as const
                  ).map((o) => (
                    <label
                      key={o.value}
                      className={cn(
                        "relative flex h-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12.5px] transition-colors has-[:focus-visible]:shadow-[0_0_0_3px_var(--accent-glow)]",
                        o.value === "custom" ? "flex-[1.6]" : "flex-1 justify-center",
                        urlChoice === o.value ? "bg-accent/[0.12] text-fg" : "text-fg-2 hover:text-fg",
                        o.value === "custom" && "font-mono",
                      )}
                    >
                      <input type="radio" name={ids.url} value={o.value} checked={urlChoice === o.value} onChange={() => setUrlChoice(o.value)} aria-label={o.value === "custom" ? "Custom URL" : "Random link"} className="absolute inset-0 cursor-pointer appearance-none opacity-0" />
                      <o.icon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : passActive && selected && customUrlsRouting ? (
              <p className="text-[12.5px] text-fg-3 sm:pt-8">
                <Link href={`/dashboard/projects/${selected.id}#custom-url`} className="text-fg-2 underline underline-offset-2">
                  Choose your custom URL
                </Link>{" "}
                — included in your pass.
              </p>
            ) : null}
          </div>
        </Step>

        {/* ---------------------------------------------------------------------- 3. Start sharing */}
        <Step n={3} title="Start sharing" done={phase === "live"}>
          {phase === "idle" || phase === "waiting" ? (
            <>
              <p className="text-[13.5px]">Run this in a terminal in your project folder, next to your running app:</p>
              <div
                className={cn(
                  "group flex flex-col gap-3 rounded-xl border bg-black/40 p-3 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:p-2 sm:pl-4",
                  ready ? "border-accent/35 shadow-[0_0_0_1px_rgba(184,255,59,0.06)]" : "border-line-strong",
                )}
              >
                <code className={cn("min-w-0 flex-1 font-mono text-[14.5px] text-fg transition-opacity [overflow-wrap:anywhere]", !ready && "opacity-50")} data-testid="share-command">
                  <span aria-hidden="true" className="select-none text-accent-ink">
                    ${" "}
                  </span>
                  {command}
                </code>
                {ready ? <CopyLabelButton value={command} label="Copy Command" onCopied={() => setCopied(true)} /> : null}
              </div>
              <p className={cn("flex items-center gap-1.5 text-[12.5px]", save.state === "error" || !plan.canShare ? "text-danger" : "text-fg-3")} aria-live="polite" data-testid="setup-state">
                {save.state === "error" || !plan.canShare ? <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                {commandNote}
                {save.state === "error" ? (
                  <button type="button" onClick={() => setRetry((n) => n + 1)} className="ml-1 font-medium text-fg underline underline-offset-2">
                    Try again
                  </button>
                ) : null}
              </p>
            </>
          ) : null}

          <div aria-live="polite" data-testid="share-result">
            <div key={phase} className="motion-safe:animate-[menu-in_200ms_ease-out]">
              {phase === "live" || phase === "unstable" ? (
                <LivePreview preview={preview!} selectedPort={port} />
              ) : phase === "ended" ? (
                <StateCard
                  tone="bad"
                  icon={preview!.status === "EXPIRED" ? <Clock className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
                  title={preview!.status === "EXPIRED" ? "Preview time ended" : preview!.status === "OFFLINE" ? "Your computer went offline" : "Sharing stopped"}
                >
                  <p>
                    {preview!.status === "EXPIRED"
                      ? `${preview!.project.name}'s preview time ended. That link no longer works.`
                      : preview!.status === "OFFLINE"
                        ? `${preview!.project.name} stopped because the share command or this computer lost its connection. That link no longer works.`
                        : `${preview!.project.name}${preview!.endReason ? ` — ${preview!.endReason.toLowerCase()}` : ""}. That link no longer works.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSince(Date.now());
                      setCopied(false);
                      setWaitingLong(false);
                      router.refresh(); // a fresh one-time code
                    }}
                    className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-1 h-9 w-fit" })}
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Share again
                  </button>
                </StateCard>
              ) : (
                <StateCard tone={phase === "waiting" ? "wait" : "idle"} title={phase === "waiting" ? "Waiting for your app to connect…" : "Your link appears here"}>
                  <p>
                    {status.cliLoggedIn ? (
                      "This computer is signed in, so sharing starts as soon as you run the command."
                    ) : (
                      <>
                        First time on this computer? Your browser opens once — approve it for <strong className="font-medium text-fg-2">{workspaceName}</strong>.
                      </>
                    )}
                  </p>
                </StateCard>
              )}
            </div>
          </div>
          {offline ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-warn" role="status">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Can&apos;t reach Localians right now — retrying. Your share keeps running.
            </p>
          ) : null}

          <details className="group rounded-xl border border-line" open={waitingLong && phase === "waiting" ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13px] text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 text-fg-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
              Help &amp; advanced
            </summary>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-[13px] leading-relaxed text-fg-2">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Your app must be running: <code className="font-mono text-[12px]">localhost:{port ?? "port"}</code> opens in your browser.
                </li>
                <li>Keep the command running while you share. Press Ctrl+C in that terminal to stop.</li>
                <li>Your computer and app must stay on and connected — the preview shows Offline when they aren&apos;t, even with a pass.</li>
                <li>First time? Approve the request that opened in your browser (Authorize CLI).</li>
                <li>Don&apos;t share apps with real customer data or secrets.</li>
              </ul>
              {published ? null : <InstallBeta localGateway={localGateway} />}
              <Link href="/docs/troubleshooting" className="w-fit text-[13px] font-medium text-accent-ink underline underline-offset-4">
                Connection help
              </Link>
            </div>
          </details>
        </Step>
      </ol>
    </div>
  );
}

function LivePreview({ preview, selectedPort }: { preview: SharePreview; selectedPort: number | null }) {
  const url = preview.publicUrl!;
  const live = preview.status === "CONNECTED";
  return (
    <div className={cn("flex flex-col gap-4 rounded-xl border p-4 sm:p-5", live ? "border-accent/35 bg-accent/[0.05]" : "border-warn/30 bg-warn/[0.05]")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex size-2.5" aria-hidden="true">
          {live ? <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" /> : null}
          <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-accent" : "bg-warn")} />
        </span>
        <PreviewStatusBadge status={preview.status} />
        <AccessBadge access={preview.project.access} />
        <span className="min-w-0 truncate text-[13.5px] font-medium text-fg">{preview.project.name}</span>
        <span className="font-mono text-[12px] text-fg-3">localhost:{preview.localPort}</span>
      </div>
      <Countdown expiresAt={preview.expiresAt} className="w-fit rounded-full border border-line-strong bg-bg/40 px-3 py-1 text-[13px] font-medium tabular-nums text-fg" />
      <p className="break-all font-mono text-[16px] text-fg sm:text-[18px]" data-testid="share-preview-url">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyLabelButton value={url} label="Copy Link" />
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm", className: "h-10" })}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          Open
        </a>
        {preview.canStop ? <StopPreviewButton preview={{ id: preview.id, publicUrl: url, active: preview.active, canStop: preview.canStop, projectName: preview.project.name }} size="sm" /> : null}
      </div>
      <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-fg-3">
        {!live ? <li className="text-warn">Connection dropped — reconnecting. Keep the command running.</li> : null}
        {selectedPort && selectedPort !== preview.localPort ? <li>This preview shares port {preview.localPort}, not {selectedPort}.</li> : null}
        {preview.startedBeforeWizard ? <li>This preview was already running when you opened this page.</li> : null}
        <li>
          {preview.project.access === "PASSWORD" ? "Visitors enter the project password first." : "Anyone with this link can open your app."}{" "}
          <Link href={`/dashboard/projects/${preview.project.id}#access`} className="text-fg-2 underline underline-offset-2">
            {preview.project.access === "PASSWORD" ? "Change password" : "Add a password"}
          </Link>
        </li>
      </ul>
    </div>
  );
}

function StateCard({ tone, icon, title, children }: { tone: "idle" | "wait" | "bad"; icon?: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl border p-4 text-[13px] leading-relaxed text-fg-3", tone === "bad" ? "border-danger/30 bg-danger/[0.04]" : "border-dashed border-line-strong")}>
      <p className={cn("flex items-center gap-2 text-[14px] font-medium", tone === "bad" ? "text-danger" : "text-fg")}>
        {icon ??
          (tone === "wait" ? (
            <span className="flex gap-1" aria-hidden="true">
              {[0, 150, 300].map((d) => (
                <span key={d} className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
          ) : (
            <span className="size-1.5 rounded-full bg-fg-3" aria-hidden="true" />
          ))}
        {title}
      </p>
      {children}
    </div>
  );
}

/** A numbered section. Only the last step shows a check (when the preview is live), so progress reads clearly. */
function Step({ n, title, done = false, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <li className="flex gap-4 p-5 sm:gap-5 sm:p-6">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[12.5px] transition-colors duration-300",
          done ? "border-accent/50 bg-accent text-[#070907]" : "border-line-strong text-fg-2",
        )}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <section aria-labelledby={id} className="flex min-w-0 flex-1 flex-col gap-4 text-[14px] leading-relaxed text-fg-2">
        <h2 id={id} className="text-[16px] font-semibold leading-7 tracking-[-0.015em] text-fg">
          {title}
        </h2>
        {children}
      </section>
    </li>
  );
}
