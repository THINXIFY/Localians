"use client";

import { ArrowUpRight, Check, Globe, HelpCircle, Info, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { type PreviewStatusValue } from "@/lib/previews";
import { saveShareSetupAction } from "@/server/actions/share";
import { inputClasses, PasswordInput } from "../Field";
import { AccessBadge } from "../previews/AccessBadge";
import { PreviewStatusBadge } from "../previews/PreviewStatusBadge";
import { StopPreviewButton } from "../previews/PreviewActions";
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
  startedBeforeWizard: boolean;
  project: { id: string; name: string; access: "PUBLIC" | "PASSWORD" };
};
type ShareStatus = { cliLoggedIn: boolean; preview: SharePreview | null };
type ProjectOption = { id: string; name: string; slug: string; defaultPort: number | null; status: "ACTIVE" | "ARCHIVED"; accessMode: "PUBLIC" | "PASSWORD"; hasPassword: boolean };

const PRESETS = [
  { label: "Vite", port: 5173 },
  { label: "Next.js / React", port: 3000 },
  { label: "Angular", port: 4200 },
] as const;

const WAIT_HELP_AFTER_MS = 40_000;

/**
 * Share App: Choose Port → Run Command → Share Link. Choices (project, password) are saved to a
 * single-use setup code that the command carries, so the CLI asks nothing. The dashboard can't
 * reach the developer's computer; it waits for that user's own preview to connect.
 */
export function ShareWizard({
  openedAt,
  initialPort,
  run,
  published,
  localGateway,
  workspaceName,
  projects,
  setup,
  initialStatus,
}: {
  openedAt: number;
  initialPort: number;
  run: string;
  published: boolean;
  localGateway: boolean;
  workspaceName: string;
  projects: ProjectOption[];
  setup: { id: string; code: string };
  initialStatus: ShareStatus;
}) {
  // Fixed for this visit (server refreshes re-render with newer values).
  const [since] = useState(openedAt);
  const [setupRef] = useState(setup);
  const active = projects.filter((p) => p.status === "ACTIVE");
  const matching = (port: number | null) => active.find((p) => p.defaultPort === port);

  const [portText, setPortText] = useState(String(initialPort));
  const [choice, setChoice] = useState<"new" | "existing">(() => (matching(initialPort) ? "existing" : "new"));
  const [projectId, setProjectId] = useState(() => matching(initialPort)?.id ?? active[0]?.id ?? "");
  const [projectName, setProjectName] = useState("");
  const selected = choice === "existing" ? active.find((p) => p.id === projectId) : undefined;
  const [mode, setMode] = useState<"PUBLIC" | "PASSWORD">(() => matching(initialPort)?.accessMode ?? "PUBLIC");
  const [password, setPassword] = useState("");
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string; passwordSaved?: boolean }>({ state: "idle" });
  const [status, setStatus] = useState<ShareStatus>(initialStatus);
  const [waitingLong, setWaitingLong] = useState(false);
  const ids = { port: useId(), name: useId(), project: useId(), password: useId() };

  const portNumber = Number(portText);
  const portValid = /^\d{1,5}$/.test(portText) && portNumber >= 1 && portNumber <= 65535;
  const port = portValid ? portNumber : null;
  const keepsExistingPassword = Boolean(selected?.hasPassword) && password.length === 0;
  const passwordTooShort = mode === "PASSWORD" && password.length > 0 && password.length < 8;
  const passwordReady = mode === "PUBLIC" || password.length >= 8 || keepsExistingPassword || Boolean(save.passwordSaved);
  const ready = portValid && passwordReady && !passwordTooShort && save.state !== "error";
  const command = `${run} share ${port ?? "<port>"} --setup ${setupRef.code}`;
  const preview = status.preview;
  const connected = preview?.status === "CONNECTED";

  // Save choices to the setup code (debounced). The password is hashed on the server.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    if (passwordTooShort) return;
    saveTimer.current = window.setTimeout(async () => {
      setSave((s) => ({ ...s, state: "saving" }));
      const result = await saveShareSetupAction(setupRef.id, {
        port,
        project: choice === "existing" && projectId ? { kind: "existing", id: projectId } : { kind: "new", name: projectName.trim() },
        access: mode === "PASSWORD" ? { mode: "PASSWORD", ...(password.length >= 8 ? { password } : {}) } : { mode: "PUBLIC" },
      });
      setSave(result.ok ? { state: "saved", passwordSaved: result.data.passwordSaved } : { state: "error", message: result.error });
    }, 450);
    return () => window.clearTimeout(saveTimer.current);
  }, [setupRef.id, port, choice, projectId, projectName, mode, password, passwordTooShort]);

  // Watch for this user's preview (pauses while the tab is hidden).
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const response = await fetch(`/api/dashboard/share-status?since=${since}`, { cache: "no-store" });
          if (response.ok) setStatus((await response.json()) as ShareStatus);
        } catch {
          // keep the last known state; try again shortly
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

  function pickPort(next: number) {
    setPortText(String(next));
    const match = matching(next);
    if (match) {
      setChoice("existing");
      setProjectId(match.id);
      setMode(match.accessMode);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-tint/[0.02] px-4 py-3 text-[13px] leading-relaxed text-fg-2">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden="true" />
        Your app stays on your computer. This page prepares the command — it can&apos;t run anything on your computer for you.
      </p>

      <ol className="flex flex-col">
        {/* ------------------------------------------------------------ 1. Choose port */}
        <Step n={1} done={connected} title="Choose your port" last={false}>
          <p>
            Start your app as usual (for example <code className="font-mono text-[12.5px] text-fg">npm run dev</code>), then pick the port it shows.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={ids.port} className="text-[13px] font-medium text-fg">
                Port
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] text-fg-3">localhost:</span>
                <input
                  id={ids.port}
                  inputMode="numeric"
                  autoComplete="off"
                  value={portText}
                  onChange={(e) => setPortText(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  onBlur={() => port && pickPort(port)}
                  aria-invalid={!portValid}
                  aria-describedby={`${ids.port}-hint`}
                  className={cn(inputClasses, "h-10 max-w-28 font-mono")}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Common ports" role="group">
              {PRESETS.map((p) => (
                <button
                  key={p.port}
                  type="button"
                  onClick={() => pickPort(p.port)}
                  aria-pressed={port === p.port}
                  className={cn(
                    "h-10 rounded-full border px-3 text-[12.5px] transition-colors",
                    port === p.port ? "border-accent/40 bg-accent/[0.06] text-fg" : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                  )}
                >
                  {p.label} <span className="font-mono text-fg-3">{p.port}</span>
                </button>
              ))}
            </div>
          </div>
          <p id={`${ids.port}-hint`} className={cn("text-[12.5px]", portValid ? "text-fg-3" : "text-danger")}>
            {portValid ? (
              <>
                Ready if{" "}
                <a href={`http://localhost:${port}`} target="_blank" rel="noopener noreferrer" className="font-mono text-fg-2 underline underline-offset-2">
                  http://localhost:{port}
                </a>{" "}
                opens in your browser.
              </>
            ) : (
              "Enter the port number your dev server printed (1–65535)."
            )}
          </p>

          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg" id={`${ids.project}-label`}>
                Project
              </span>
              <div role="radiogroup" aria-labelledby={`${ids.project}-label`} className="flex w-fit rounded-lg border border-line-strong bg-tint/[0.03] p-0.5 text-[12.5px]">
                {(["new", "existing"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={choice === value}
                    disabled={value === "existing" && !active.length}
                    onClick={() => setChoice(value)}
                    className={cn("rounded-md px-2.5 py-1 disabled:opacity-40", choice === value ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg")}
                  >
                    {value === "new" ? "New project" : "Existing"}
                  </button>
                ))}
              </div>
              {choice === "new" ? (
                <>
                  <label htmlFor={ids.name} className="sr-only">
                    Project name (optional)
                  </label>
                  <input
                    id={ids.name}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value.slice(0, 80))}
                    placeholder="Project name (optional)"
                    autoComplete="off"
                    className={cn(inputClasses, "h-10 text-[13.5px]")}
                  />
                  <p className="text-[12px] text-fg-3">Leave empty to name it after your app&apos;s folder.</p>
                </>
              ) : (
                <>
                  <label htmlFor={ids.project} className="sr-only">
                    Existing project
                  </label>
                  <select
                    id={ids.project}
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      const p = active.find((x) => x.id === e.target.value);
                      if (p) setMode(p.accessMode);
                    }}
                    className={cn(inputClasses, "h-10 text-[13.5px]")}
                  >
                    {active.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.defaultPort ? ` (port ${p.defaultPort})` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg" id={`${ids.password}-label`}>
                Who can open it
              </span>
              <div role="radiogroup" aria-labelledby={`${ids.password}-label`} className="flex w-fit rounded-lg border border-line-strong bg-tint/[0.03] p-0.5 text-[12.5px]">
                {(
                  [
                    { value: "PUBLIC", icon: Globe, label: "Anyone with the link" },
                    { value: "PASSWORD", icon: Lock, label: "Password" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.value}
                    onClick={() => setMode(o.value)}
                    className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1", mode === o.value ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg")}
                  >
                    <o.icon className="size-3.5" aria-hidden="true" />
                    {o.label}
                  </button>
                ))}
              </div>
              {mode === "PASSWORD" ? (
                <>
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
                  <p className={cn("text-[12px]", passwordTooShort ? "text-danger" : "text-fg-3")}>
                    {passwordTooShort ? "Use at least 8 characters." : "Send it to your client separately from the link."}
                  </p>
                </>
              ) : (
                <p className="text-[12px] leading-relaxed text-fg-3">
                  Public previews can be opened by anyone with the link. Enable password protection to restrict access.
                </p>
              )}
            </div>
          </div>
        </Step>

        {/* ------------------------------------------------------------ 2. Run command */}
        <Step n={2} done={connected} title="Run this command" last={false}>
          <p>Open another terminal in your project folder and run:</p>
          <div className={cn("flex flex-col gap-3 rounded-xl border border-line-strong bg-bg-2 p-3 sm:flex-row sm:items-center sm:p-2 sm:pl-4", !ready && "opacity-60")}>
            <code className="min-w-0 flex-1 break-all font-mono text-[14.5px] text-fg" data-testid="share-command">
              <span aria-hidden="true" className="select-none text-accent-ink">
                ${" "}
              </span>
              {command}
            </code>
            {ready ? <CopyLabelButton value={command} label="Copy Command" /> : null}
          </div>
          <p className="text-[12.5px] text-fg-3" aria-live="polite" data-testid="setup-state">
            {!portValid
              ? "Choose a valid port first."
              : mode === "PASSWORD" && !passwordReady
                ? "Enter a password (8+ characters) to get the command."
                : save.state === "error"
                  ? save.message
                  : save.state === "saving"
                    ? "Saving your choices…"
                    : "The command remembers your project and access choice. It works once, for the next 30 minutes."}
          </p>
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            {status.cliLoggedIn ? (
              "If this computer is already signed in, sharing starts right away."
            ) : (
              <>
                First time on this computer? Your browser opens once — approve it for <strong className="font-medium text-fg-2">{workspaceName}</strong> and
                sharing continues by itself.
              </>
            )}
          </p>
          {published ? null : <InstallBeta localGateway={localGateway} />}
        </Step>

        {/* ------------------------------------------------------------ 3. Share link */}
        <Step n={3} done={connected} title="Share your link" last>
          <div aria-live="polite" data-testid="share-result">
            {preview && preview.active && preview.publicUrl ? (
              <ConnectedPreview preview={preview} selectedPort={port} />
            ) : preview && !preview.active && !preview.startedBeforeWizard ? (
              <div className="rounded-xl border border-line-strong bg-tint/[0.03] p-4 text-[13.5px] leading-relaxed text-fg-2">
                <div className="flex items-center gap-2">
                  <PreviewStatusBadge status={preview.status} />
                  <span className="font-medium text-fg">{preview.project.name}</span>
                </div>
                <p className="mt-2">
                  Sharing has stopped{preview.endReason ? ` (${preview.endReason.toLowerCase()})` : ""}, so that link no longer works. Reload this page for
                  a fresh command to share again.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong p-4">
                <p className="flex items-center gap-2.5 text-[14px] text-fg">
                  <Loader2 className="size-4 animate-spin text-accent-ink motion-reduce:animate-none" aria-hidden="true" />
                  Waiting for your local app to connect...
                </p>
                <p className="text-[12.5px] text-fg-3">Your preview link appears here as soon as the command connects.</p>
                {waitingLong ? <WaitingHelp port={port} /> : null}
              </div>
            )}
          </div>
          <ul className="grid gap-1.5 text-[12px] leading-relaxed text-fg-3 sm:grid-cols-3">
            <li>Keep your app and the Localians command running while you share.</li>
            <li>Stopping sharing disables the link immediately.</li>
            <li>Don&apos;t share apps with real customer data or secrets.</li>
          </ul>
        </Step>
      </ol>
    </div>
  );
}

function ConnectedPreview({ preview, selectedPort }: { preview: SharePreview; selectedPort: number | null }) {
  const url = preview.publicUrl!;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent/30 bg-accent/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <PreviewStatusBadge status={preview.status} />
        <AccessBadge access={preview.project.access} />
        <span className="text-[13.5px] font-medium text-fg">{preview.project.name}</span>
        <span className="font-mono text-[12px] text-fg-3">localhost:{preview.localPort}</span>
      </div>
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3">Preview link</p>
        <p className="mt-1 break-all font-mono text-[16px] text-fg sm:text-[17px]" data-testid="share-preview-url">
          {url}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyLabelButton value={url} label="Copy Link" />
        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm", className: "h-10" })}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          Open Preview
        </a>
        {preview.canStop ? (
          <StopPreviewButton preview={{ id: preview.id, publicUrl: url, active: preview.active, canStop: preview.canStop, projectName: preview.project.name }} size="sm" />
        ) : null}
      </div>
      <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-fg-3">
        {preview.status !== "CONNECTED" ? <li className="text-warn">The connection dropped. Localians is reconnecting — keep the command running.</li> : null}
        {selectedPort && selectedPort !== preview.localPort ? <li>This preview shares port {preview.localPort}, not {selectedPort}.</li> : null}
        {preview.startedBeforeWizard ? <li>This preview was already running when you opened this page.</li> : null}
        <li>
          {preview.project.access === "PASSWORD" ? "Visitors enter the project password before they see your app." : "Anyone with this link can open your app while sharing is on."}{" "}
          <Link href={`/dashboard/projects/${preview.project.id}#access`} className="text-fg-2 underline underline-offset-2">
            {preview.project.access === "PASSWORD" ? "Change password" : "Add a password"}
          </Link>
        </li>
      </ul>
    </div>
  );
}

function WaitingHelp({ port }: { port: number | null }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 text-[13px] leading-relaxed text-fg-2">
      <p className="flex items-center gap-2 font-medium text-fg">
        <HelpCircle className="size-4 text-fg-3" aria-hidden="true" />
        Taking a while? Check these:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your app is running: {port ? <code className="font-mono text-[12px]">http://localhost:{port}</code> : "check its port"} opens in your browser.</li>
        <li>The command is still running in your terminal, and shows no error.</li>
        <li>First time? Approve the request that opened in your browser (Authorize CLI).</li>
        <li>&ldquo;Command not found&rdquo;? Do the one-time setup in step 2.</li>
      </ul>
      <Link href="/docs/troubleshooting" className="w-fit text-[13px] font-medium text-accent-ink underline underline-offset-4">
        Connection Help
      </Link>
    </div>
  );
}

function Step({ n, title, done, last, children }: { n: number; title: string; done: boolean; last: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {last ? null : <span aria-hidden="true" className="absolute bottom-1 left-[15px] top-9 w-px bg-line" />}
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[13px]",
          done ? "border-accent/50 bg-accent text-[#070907]" : "border-line-strong bg-card text-fg",
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <section className="flex min-w-0 flex-1 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-card p-5 text-[14px] leading-relaxed text-fg-2 sm:p-6" aria-label={`Step ${n}: ${title}`}>
        <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-fg">{title}</h2>
        {children}
      </section>
    </li>
  );
}
