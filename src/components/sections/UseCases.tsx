import { GitBranch, Lock, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DemoTag, StatusDot } from "@/components/ui/Window";
import { cn } from "@/lib/cn";

const cases = [
  {
    audience: "Freelancers",
    title: "Show progress. Not deployment logs.",
    description: "Give clients an easy way to review work while you keep building.",
    visual: <FreelancerVisual />,
  },
  {
    audience: "Agencies",
    title: "Keep client previews organized.",
    description: "Manage development projects and share polished previews from one workspace.",
    visual: <AgencyVisual />,
  },
  {
    audience: "Development Teams",
    title: "Review together. Build faster.",
    description: "Let teammates explore locally running applications without setting up staging environments.",
    visual: <TeamVisual />,
  },
];

export function UseCases() {
  return (
    <section id="use-cases" aria-labelledby="use-cases-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="use-cases-title"
          eyebrow="Made for builders"
          title="Built for everyone who ships."
          description="From solo developers to growing agencies, Localians makes sharing unfinished work feel effortless."
        />

        <div className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {cases.map((c, i) => (
            <Reveal
              key={c.audience}
              delay={i * 0.07}
              className={cn(
                "group surface hairline-top flex flex-col overflow-hidden transition-colors duration-300 hover:border-line-strong",
                i === 2 && "md:col-span-2 lg:col-span-1",
              )}
            >
              <div className="relative flex h-[300px] items-center justify-center overflow-hidden border-b border-line bg-[radial-gradient(100%_80%_at_50%_100%,rgba(184,255,59,0.05),transparent)] px-5">
                <div aria-hidden="true" className="w-full max-w-[320px] transition-transform duration-500 group-hover:-translate-y-1">
                  {c.visual}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-6 sm:p-7">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">{c.audience}</p>
                <h3 className="mt-3 text-[21px] font-semibold leading-snug tracking-[-0.025em] text-fg">{c.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{c.description}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <DemoTag>Illustrations · names are fictional</DemoTag>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Visuals -------------------------------- */

function Avatar({ initials, tone = "neutral" }: { initials: string; tone?: "neutral" | "accent" | "warm" }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-[#0a0d0a]",
        tone === "neutral" && "bg-[#2a312a] text-fg-2",
        tone === "accent" && "bg-accent text-[#070907]",
        tone === "warm" && "bg-[#3a3326] text-[#e9d9b4]",
      )}
    >
      {initials}
    </span>
  );
}

function LinkChip({ host }: { host: string }) {
  return (
    <span className="flex items-center justify-between gap-2 rounded-lg border border-accent/25 bg-black/50 px-2.5 py-2">
      <span className="flex min-w-0 items-center gap-1.5">
        <Lock className="size-3 shrink-0 text-accent" />
        <span className="truncate font-mono text-[11px] text-fg">{host}</span>
      </span>
      <span className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-accent">
        <StatusDot />
        Live
      </span>
    </span>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line-strong bg-[#0a0d0a] shadow-[0_24px_50px_-28px_rgba(0,0,0,0.9)]", className)}>{children}</div>;
}

function FreelancerVisual() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2">
        <Avatar initials="YO" tone="accent" />
        <Panel className="rounded-bl-sm p-3">
          <p className="text-[12px] leading-snug text-fg-2">Today&apos;s progress is up — have a look when you can.</p>
          <div className="mt-2">
            <LinkChip host="demo.localians.com" />
          </div>
        </Panel>
      </div>
      <div className="flex items-end justify-end gap-2">
        <div className="max-w-[78%] rounded-xl rounded-br-sm border border-line bg-[#171c17] px-3 py-2.5">
          <p className="text-[12px] leading-snug text-fg-2">Love the new checkout. Can we try the darker header?</p>
        </div>
        <Avatar initials="MK" tone="warm" />
      </div>
      <p className="pl-9 font-mono text-[10px] text-fg-3">Client · opened in browser</p>
    </div>
  );
}

const clients = [
  { name: "Fernwood Studio", initials: "FS", previews: 2, live: true },
  { name: "Atlas Coffee", initials: "AC", previews: 1, live: true },
  { name: "Northpine Health", initials: "NH", previews: 3, live: false },
];

function AgencyVisual() {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className="text-[12px] font-medium text-fg">Clients</span>
        <span className="font-mono text-[10px] text-fg-3">6 previews</span>
      </div>
      <ul className="divide-y divide-line">
        {clients.map((c, i) => (
          <li key={c.name} className={cn("flex items-center gap-3 px-3.5 py-2.5", i === 0 && "bg-white/[0.025]")}>
            <span className="flex size-7 items-center justify-center rounded-md border border-line bg-white/[0.04] text-[10px] font-semibold text-fg-2">
              {c.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-fg">{c.name}</span>
              <span className="block font-mono text-[10px] text-fg-3">
                {c.previews} preview{c.previews > 1 ? "s" : ""}
              </span>
            </span>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
                c.live ? "border-accent/25 text-accent" : "border-line text-fg-3",
              )}
            >
              <StatusDot state={c.live ? "live" : "offline"} />
              {c.live ? "Live" : "Paused"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TeamVisual() {
  return (
    <Panel className="p-3.5">
      <div className="flex items-center gap-2">
        <GitBranch className="size-3.5 text-fg-3" />
        <span className="font-mono text-[11px] text-fg-2">feat/checkout-flow</span>
        <span className="ml-auto rounded-full border border-line px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-3">
          In review
        </span>
      </div>
      <div className="mt-3">
        <LinkChip host="checkout.localians.com" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Avatar initials="RS" />
          <p className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-2">Tested on my phone — totals update correctly.</p>
        </div>
        <div className="flex gap-2">
          <Avatar initials="DL" tone="warm" />
          <p className="rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-2">Looks good. Ship it after copy review.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-fg-3">
        <MessageSquare className="size-3.5" />
        <span className="font-mono text-[10px]">No staging server needed</span>
      </div>
    </Panel>
  );
}
