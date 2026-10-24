import { Terminal } from "lucide-react";
import Link from "next/link";
import { DisclosureChevron, summaryClasses } from "@/components/ui/Disclosure";
import { cn } from "@/lib/cn";
import { Command } from "./Command";

export type CliConnectStatus = {
  /** Computers (CLI or VS Code) signed in to this workspace right now. */
  computers: number;
  /** "2 hours ago", or null when none has been used yet. */
  lastUsed: string | null;
};

const TITLE = "Connect Localians CLI";
const SUBTITLE = "Login, manage your account and share apps from your terminal.";

/**
 * "Connect Localians CLI": the commands that exist (login, share, whoami, logout, --help), one aligned row each with a
 * copy button, plus whether a computer is connected and which account the commands sign in to. Never shows tokens,
 * setup secrets or passwords. `compact` (Share App) is a closed-by-default disclosure so it doesn't compete with the
 * main workflow; Settings → CLI shows it open as a panel.
 */
export function CliConnect({
  run,
  account,
  status,
  compact = false,
  className,
}: {
  run: string;
  account: { username: string | null; email: string };
  status: CliConnectStatus;
  compact?: boolean;
  className?: string;
}) {
  const connected = status.computers > 0;
  const who = account.username ? `@${account.username}` : account.email;
  const commands: { title: string; hint: string; command: string }[] = [
    { title: "Login", hint: "Approve a one-time code in your browser", command: `${run} login` },
    { title: "Share an app", hint: "Use its port · one terminal per app", command: `${run} share 3000` },
    { title: "Who am I", hint: "Show the signed-in account", command: `${run} whoami` },
    { title: "Logout", hint: "Sign out · then login to switch", command: `${run} logout` },
    { title: "Help", hint: "Every command and option", command: `${run} --help` },
  ];

  const statusLine = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3" data-testid="cli-account">
      <span
        className={cn("inline-flex items-center gap-1.5 font-medium", connected ? "text-accent-ink" : "text-fg-2")}
        data-testid="cli-status"
      >
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", connected ? "bg-accent" : "bg-fg-3")} />
        {connected ? `Connected on ${status.computers} ${status.computers === 1 ? "computer" : "computers"}` : "No computer connected yet"}
      </span>
      <span aria-hidden="true" className="hidden sm:inline">·</span>
      <span>
        {connected ? "Signed in as " : "Approve the login as "}
        <span className="text-fg-2">{who}</span>
        {connected && status.lastUsed ? `, last used ${status.lastUsed}` : ""}
      </span>
    </p>
  );

  const rows = (
    <ul className="divide-y divide-line" data-testid="cli-commands">
      {commands.map((c) => (
        <li key={c.command} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-fg">{c.title}</p>
            <p className="text-[12px] leading-snug text-fg-3">{c.hint}</p>
          </div>
          <Command value={c.command} label={`Copy: ${c.command}`} dense />
        </li>
      ))}
    </ul>
  );

  const footnote = (
    <p className="text-[12px] leading-relaxed text-fg-3">
      Same commands in Windows CMD, PowerShell, macOS and Linux (Node.js 20+). Tokens stay on your computer and are never shown here.{" "}
      {compact ? (
        <Link href="/dashboard/settings/cli" className="text-fg-2 underline underline-offset-4 hover:text-fg">
          Manage computers
        </Link>
      ) : null}
    </p>
  );

  if (compact) {
    return (
      <details className={cn("rounded-[var(--radius-card)] border border-line bg-card transition-colors open:border-line-strong", className)} data-testid="cli-connect">
        <summary className={cn(summaryClasses, "flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 transition-colors hover:bg-tint/[0.025] sm:px-5")}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-tint/[0.04]" aria-hidden="true">
            <Terminal className="size-4 text-accent-ink" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[14px] font-semibold text-fg">{TITLE}</span>
              <span className="hidden rounded-full border border-line-strong px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-3 sm:inline-block">CLI Commands</span>
            </span>
            <span className="block text-[12.5px] leading-snug text-fg-3">{SUBTITLE}</span>
          </span>
          <DisclosureChevron />
        </summary>
        <div className="flex flex-col gap-3.5 border-t border-line px-4 pb-4 pt-3.5 sm:px-5">
          {statusLine}
          {rows}
          {footnote}
        </div>
      </details>
    );
  }
  return (
    <section aria-labelledby="cli-connect-title" className={cn("flex flex-col gap-3.5 rounded-[var(--radius-card)] border border-line bg-card p-4 sm:p-5", className)} data-testid="cli-connect">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-tint/[0.04]" aria-hidden="true">
          <Terminal className="size-4 text-accent-ink" />
        </span>
        <div className="min-w-0">
          <h2 id="cli-connect-title" className="text-[14.5px] font-semibold text-fg">
            {TITLE}
          </h2>
          <p className="text-[12.5px] text-fg-3">{SUBTITLE}</p>
        </div>
      </div>
      {statusLine}
      {rows}
      {footnote}
    </section>
  );
}
