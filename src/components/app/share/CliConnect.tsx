import { ChevronRight, Terminal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Command } from "./Command";

export type CliConnectStatus = {
  /** Computers (CLI or VS Code) signed in to this workspace right now. */
  computers: number;
  /** "2 hours ago", or null when none has been used yet. */
  lastUsed: string | null;
};

/**
 * "Connect Localians CLI": the commands that exist (login, whoami, share, logout, --help), each with a copy button and
 * a one-line explanation, plus whether a computer is connected and which account the commands sign in to. Never shows
 * tokens, setup secrets or passwords. `compact` folds it into a disclosure (Share App), open while nothing is connected.
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
  const commands: { title: string; command: string; text: string }[] = [
    { title: "Sign in", command: `${run} login`, text: "Opens your browser with a one-time code. Approve it once per computer." },
    { title: "Share a local app", command: `${run} share 3000`, text: "Use your app's port. Run it again in another terminal to share another app at the same time." },
    { title: "Check who's signed in", command: `${run} whoami`, text: "Shows the account this computer is connected to." },
    { title: "Sign out", command: `${run} logout`, text: "Revokes this computer's access. Sign in again to switch accounts." },
    { title: "All commands", command: `${run} --help`, text: "Every option: durations, projects, status and more." },
  ];

  const pill = (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium",
        connected ? "border-accent/30 bg-accent/10 text-accent-ink" : "border-line-strong text-fg-3",
      )}
      data-testid="cli-status"
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", connected ? "bg-accent" : "bg-fg-3")} />
      {connected ? `Connected on ${status.computers} ${status.computers === 1 ? "computer" : "computers"}` : "No computer connected yet"}
    </span>
  );

  const body = (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        {connected ? (
          <>
            Signed in as <span className="font-medium text-fg">{who}</span>
            {status.lastUsed ? <>, last used {status.lastUsed}</> : null}. To use a different account on a computer, sign out there first.
          </>
        ) : (
          <>
            Run the sign-in command in a terminal, then approve the code in your browser while signed in as <span className="font-medium text-fg">{who}</span>.
          </>
        )}
      </p>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="cli-commands">
        {commands.map((c) => (
          <li key={c.command} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">{c.title}</span>
            <Command value={c.command} label={`Copy: ${c.command}`} />
            <span className="text-[12px] leading-relaxed text-fg-3">{c.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-fg-3">
        The same commands work in Windows Command Prompt, PowerShell, and macOS or Linux terminals (Node.js 20 or newer). Your login is stored only on your computer;
        tokens are never shown here. Manage signed-in computers in{" "}
        <Link href="/dashboard/settings/cli" className="text-fg-2 underline underline-offset-4 hover:text-fg">
          Settings → CLI
        </Link>
        .
      </p>
    </div>
  );

  if (compact) {
    return (
      <details open={!connected} className={cn("group rounded-[var(--radius-card)] border border-line bg-card", className)} data-testid="cli-connect">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 marker:hidden sm:px-5">
          <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-90" aria-hidden="true" />
          <Terminal className="size-4 shrink-0 text-accent-ink" aria-hidden="true" />
          <span className="flex-1 text-[14.5px] font-semibold text-fg">Connect Localians CLI</span>
          {pill}
        </summary>
        <div className="border-t border-line px-4 py-4 sm:px-5">{body}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby="cli-connect-title" className={cn("flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-card p-4 sm:p-5", className)} data-testid="cli-connect">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cli-connect-title" className="flex items-center gap-2 text-[15px] font-semibold text-fg">
          <Terminal className="size-4 text-accent-ink" aria-hidden="true" />
          Connect Localians CLI
        </h2>
        {pill}
      </div>
      {body}
    </section>
  );
}
