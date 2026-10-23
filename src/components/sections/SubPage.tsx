import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";
import { Eyebrow } from "@/components/ui/SectionHeader";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

type SubPageProps = {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** Shown as a clear notice when the destination is not built yet. */
  notice?: ReactNode;
  back?: { href: string; label: string };
  /** "wide" leaves room for a side column (long legal pages with a table of contents). */
  width?: "narrow" | "wide";
  children?: ReactNode;
};

export function SubPage({ eyebrow, title, intro, notice, back = { href: "/", label: "Back to home" }, width = "narrow", children }: SubPageProps) {
  return (
    <>
      <Navbar />
      <main id="main" className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
          <div className="bg-grid mask-fade-y absolute inset-0" />
          <div className="absolute left-1/2 top-[-260px] h-[480px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.1),transparent)]" />
        </div>

        <div className={cn("container-x pb-24 pt-[calc(var(--header-h)+64px)] sm:pb-32 sm:pt-[calc(var(--header-h)+96px)]", width === "wide" ? "max-w-[1080px]" : "max-w-[820px]")}>
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 text-[13.5px] text-fg-3 transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {back.label}
          </Link>
          <div className="mt-8">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-5 text-balance text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[52px]">
              {title}
            </h1>
            <div className="mt-5 max-w-[60ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[17.5px]">{intro}</div>
          </div>

          {notice ? (
            <div role="note" className="mt-10 flex gap-3 rounded-[var(--radius-card)] border border-warn/25 bg-warn/[0.05] p-5">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
              <div className="text-[14.5px] leading-relaxed text-fg-2">{notice}</div>
            </div>
          ) : null}

          {children ? <div className="mt-12">{children}</div> : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** A shell command with a copy button. `label` names the shell/OS when commands differ. */
export function CodeLine({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-black/40">
      {label ? <div className="border-b border-line px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-fg-3">{label}</div> : null}
      <div className="flex items-start gap-3 px-4 py-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px] leading-relaxed text-fg">
          {children.split("\n").map((line, i) => (
            <span key={i} className="block">
              <span className="select-none text-accent">$ </span>
              {line}
            </span>
          ))}
        </code>
        <CopyButton value={children} label="Copy command" />
      </div>
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5 text-[15.5px] leading-relaxed text-fg-2 [&_h2]:mt-12 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-fg [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_code]:[overflow-wrap:anywhere] [&_strong]:font-medium [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
      {children}
    </div>
  );
}
