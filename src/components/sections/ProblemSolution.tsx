import { Check, Clock, Hammer, Link2, RefreshCcw, Server, Terminal, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusDot } from "@/components/ui/Window";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const slowSteps: { text: string; icon: LucideIcon; tag: string }[] = [
  { text: "Build locally.", icon: Hammer, tag: "manual" },
  { text: "Deploy to a staging server.", icon: Upload, tag: "push" },
  { text: "Wait for the build.", icon: Clock, tag: "waiting…" },
  { text: "Share the URL.", icon: Link2, tag: "manual" },
  { text: "Repeat after every change.", icon: RefreshCcw, tag: "again" },
];

const fastSteps: { text: string; code?: string }[] = [
  { text: "Start your local app.", code: "npm run dev" },
  { text: "Run one command.", code: site.command },
  { text: "Share your secure link." },
  { text: "Keep building while they browse." },
];

export function ProblemSolution() {
  return (
    <section aria-labelledby="better-way-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="better-way-title"
          eyebrow="A better way to share"
          title="Stop deploying just to show progress."
          description="Your development workflow shouldn't slow down every time someone needs a preview."
        />

        <div className="mt-14 grid gap-4 sm:mt-16 lg:grid-cols-2 lg:gap-5">
          {/* ---------------- Without Localians ---------------- */}
          <Reveal className="surface flex flex-col p-6 sm:p-8">
            <CardLabel>Without Localians</CardLabel>
            <h3 className="mt-4 text-[26px] font-semibold tracking-[-0.03em] text-fg-2 sm:text-[30px]">The slow way.</h3>

            <div className="relative mt-8 flex-1">
              <span aria-hidden="true" className="absolute bottom-5 left-[15px] top-5 w-px border-l border-dashed border-white/15" />
              <ol>
              {slowSteps.map((step, i) => (
                <li key={step.text} className="relative flex items-center gap-4 py-2.5">
                  <span className="relative z-10 flex size-[31px] shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-fg-3">
                    <step.icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-[15.5px] text-fg-2">{step.text}</span>
                  <span
                    className={cn(
                      "hidden rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-fg-3 sm:inline-block",
                      i === 2 && "border-warn/25 text-warn/80",
                    )}
                  >
                    {step.tag}
                  </span>
                </li>
              ))}
              </ol>
            </div>

            <p className="mt-8 flex items-center gap-2.5 border-t border-line pt-5 text-[14.5px] text-fg-3">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-white/25" />
              Too many steps for a simple preview.
            </p>
          </Reveal>

          {/* ---------------- With Localians ---------------- */}
          <Reveal
            delay={0.08}
            className="relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-accent/25 bg-[linear-gradient(180deg,#131a10_0%,var(--card)_55%)] p-6 shadow-[0_0_0_1px_rgba(184,255,59,0.04),0_30px_80px_-40px_rgba(184,255,59,0.35)] sm:p-8"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(184,255,59,0.14),transparent)]" />
            <CardLabel accent>With Localians</CardLabel>
            <h3 className="mt-4 text-[26px] font-semibold tracking-[-0.03em] text-fg sm:text-[30px]">The instant way.</h3>

            <div className="relative mt-8 flex-1">
              <span aria-hidden="true" className="absolute bottom-6 left-[15px] top-5 w-px bg-gradient-to-b from-accent/60 via-accent/40 to-accent/10" />
              <ol>
              {fastSteps.map((step, i) => (
                <li key={step.text} className="relative flex items-center gap-4 py-2.5">
                  <span className="relative z-10 flex size-[31px] shrink-0 items-center justify-center rounded-full border border-accent/40 bg-[#18210f] font-mono text-[11px] text-accent">
                    {i === 1 ? <Terminal className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[15.5px] text-fg">{step.text}</span>
                    {step.code ? (
                      <code className="truncate rounded-md border border-line bg-black/40 px-2 py-0.5 font-mono text-[11.5px] text-fg-2">
                        {step.code}
                      </code>
                    ) : null}
                  </span>
                </li>
              ))}
              </ol>
            </div>

            {/* Highlighted live state */}
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-black/40 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <StatusDot />
                <span className="truncate font-mono text-[12.5px] text-fg">{site.demoUrl.replace("https://", "")}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">
                <Server className="size-3.5" aria-hidden="true" />
                Live
              </span>
            </div>

            <p className="mt-6 flex items-center gap-2.5 border-t border-accent/15 pt-5 text-[14.5px] font-medium text-fg">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              From localhost to live preview in seconds.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CardLabel({ children, accent }: { children: string; accent?: boolean }) {
  return (
    <span
      className={cn(
        "w-fit rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.16em]",
        accent ? "border-accent/30 bg-accent/[0.08] text-accent" : "border-line bg-white/[0.03] text-fg-3",
      )}
    >
      {children}
    </span>
  );
}
