import { ArrowLeftRight, Eye, EyeOff, Folder, KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DemoTag, StatusDot } from "@/components/ui/Window";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="features-title"
          eyebrow="Everything you need"
          title="Built for the way developers work."
          description="A simpler way to share, manage, and protect your development previews."
        />

        <div className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          <FeatureCard
            className="lg:col-span-4"
            title="One Command. Instant Preview."
            description="Turn any running local web app into a shareable HTTPS link with a single command."
            visual={<CommandVisual />}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="Secure by Default."
            description="Protect unfinished projects with access controls and password-protected previews."
            visual={<AccessVisual />}
            delay={0.06}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="All Projects. One Place."
            description="Organize development projects and manage active previews from a clean dashboard."
            visual={<ProjectsVisual />}
          />
          <FeatureCard
            className="lg:col-span-4"
            title="Changes Without Redeploying."
            description="Keep developing locally while your shared preview reflects updates from your development server."
            visual={<SyncVisual />}
            delay={0.06}
          />
          <FeatureCard
            className="lg:col-span-3"
            title="Know What's Live."
            description="Monitor tunnel connections and instantly see which previews are online or offline."
            visual={<StatusVisual />}
          />
          <FeatureCard
            className="lg:col-span-3"
            title="Useful Insights. No Noise."
            description="View basic preview activity and bandwidth usage without unnecessary complexity."
            visual={<InsightsVisual />}
            delay={0.06}
          />
        </div>

        <div className="mt-6 flex justify-center">
          <DemoTag>Product visuals use sample data</DemoTag>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  description,
  visual,
  className,
  delay = 0,
}: {
  title: string;
  description: string;
  visual: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={cn("group surface hairline-top flex flex-col overflow-hidden transition-colors duration-300 hover:border-line-strong", className)}>
      <div className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden border-b border-line bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.03),transparent)] p-5 sm:p-6">
        <div aria-hidden="true" className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]" />
        <div className="relative w-full" aria-hidden="true">
          {visual}
        </div>
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-fg">{title}</h3>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">{description}</p>
      </div>
    </Reveal>
  );
}

/* -------------------------------- Visuals -------------------------------- */

function MiniPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line-strong bg-[#0a0d0a]/95 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.9)]", className)}>
      {children}
    </div>
  );
}

function CommandVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[560px] overflow-hidden transition-transform duration-500 group-hover:-translate-y-1">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[10.5px] text-fg-3">terminal</span>
      </div>
      <div className="space-y-1.5 px-4 py-4 font-mono text-[12px] leading-relaxed sm:text-[12.5px]">
        <p className="text-fg">
          <span className="text-accent">$ </span>
          {site.command}
        </p>
        <p className="text-fg-3">
          <span className="text-accent">✓</span> Secure tunnel established
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/[0.07] px-2 py-1 text-accent">
            <Lock className="size-3" />
            {site.demoUrl}
          </span>
          <span className="rounded-md border border-line px-2 py-1 text-[10.5px] text-fg-3">⌘C copy</span>
          <span className="animate-blink inline-block h-3.5 w-[7px] bg-fg/70" />
        </div>
      </div>
    </MiniPanel>
  );
}

function AccessVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[280px] p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.08] text-accent">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-fg">Protected preview</p>
          <p className="font-mono text-[10.5px] text-fg-3">storefront · :3000</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-white/[0.02] px-3 py-2">
        <span className="flex items-center gap-2 text-[12px] text-fg-2">
          <KeyRound className="size-3.5 text-fg-3" />
          Require password
        </span>
        <span className="relative h-[18px] w-8 rounded-full bg-accent">
          <span className="absolute right-0.5 top-0.5 size-3.5 rounded-full bg-[#070907]" />
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-black/40 px-3 py-2">
        <span className="font-mono text-[13px] tracking-[0.25em] text-fg-2">••••••••</span>
        <EyeOff className="size-3.5 text-fg-3" />
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-white/[0.02] px-3 py-2 opacity-70">
        <span className="flex items-center gap-2 text-[12px] text-fg-2">
          <Eye className="size-3.5 text-fg-3" />
          Public link
        </span>
        <span className="relative h-[18px] w-8 rounded-full bg-white/10">
          <span className="absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white/40" />
        </span>
      </div>
    </MiniPanel>
  );
}

const projects = [
  { name: "storefront", port: "3000", live: true },
  { name: "client-portal", port: "5173", live: true },
  { name: "portfolio-v2", port: "8080", live: false },
];

function ProjectsVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[300px] overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className="text-[12px] font-medium text-fg">Projects</span>
        <span className="font-mono text-[10px] text-fg-3">3 total</span>
      </div>
      <ul className="divide-y divide-line">
        {projects.map((p, i) => (
          <li key={p.name} className={cn("flex items-center gap-3 px-3.5 py-2.5", i === 0 && "bg-white/[0.025]")}>
            <Folder className="size-3.5 shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">{p.name}</span>
            <span className="font-mono text-[10.5px] text-fg-3">:{p.port}</span>
            <StatusDot state={p.live ? "live" : "offline"} />
          </li>
        ))}
      </ul>
    </MiniPanel>
  );
}

function SyncVisual() {
  return (
    <div className="mx-auto grid max-w-[600px] grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
      <MiniPanel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="font-mono text-[10.5px] text-fg-3">Hero.tsx</span>
          <span className="size-1.5 rounded-full bg-fg-3" />
        </div>
        <div className="space-y-1 px-3 py-3 font-mono text-[10px] leading-relaxed sm:text-[11px]">
          <p className="text-fg-3">
            <span className="mr-2 text-white/20">12</span>
            {"<h1>"}
          </p>
          <p className="-mx-3 border-l-2 border-accent bg-accent/[0.08] px-3 text-fg">
            <span className="mr-2 text-white/25">13</span>
            {"  Spring edit"}
          </p>
          <p className="text-fg-3">
            <span className="mr-2 text-white/20">14</span>
            {"</h1>"}
          </p>
          <p className="text-fg-3">
            <span className="mr-2 text-white/20">15</span>
            {"<Button />"}
          </p>
        </div>
      </MiniPanel>

      <div className="flex flex-col items-center gap-1.5">
        <span className="flex size-8 items-center justify-center rounded-full border border-accent/30 bg-accent/[0.08] text-accent transition-transform duration-500 group-hover:rotate-180">
          <ArrowLeftRight className="size-3.5" />
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-fg-3">sync</span>
      </div>

      <MiniPanel className="overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
          <Lock className="size-2.5 text-accent" />
          <span className="truncate font-mono text-[10.5px] text-fg-3">demo.localians.com</span>
        </div>
        <div className="space-y-2 bg-[#f3f1ea] px-3 py-3">
          <p className="text-[13px] font-semibold tracking-tight text-[#16180f] sm:text-[15px]">Spring edit</p>
          <div className="h-1.5 w-3/4 rounded bg-black/10" />
          <div className="h-1.5 w-1/2 rounded bg-black/10" />
          <div className="h-4 w-14 rounded-full bg-[#16180f]" />
        </div>
      </MiniPanel>
    </div>
  );
}

const tunnels = [
  { name: "storefront", port: "3000", state: "live" as const, bars: "111111111111111111" },
  { name: "client-portal", port: "5173", state: "live" as const, bars: "000111111111111111" },
  { name: "portfolio-v2", port: "8080", state: "offline" as const, bars: "111111110000000000" },
];

function StatusVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[440px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-fg">Connections</span>
        <span className="font-mono text-[10px] text-fg-3">last 30 min</span>
      </div>
      <ul className="mt-3 space-y-3">
        {tunnels.map((t) => (
          <li key={t.name}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <StatusDot state={t.state} />
                <span className="truncate text-[12px] text-fg-2">{t.name}</span>
                <span className="font-mono text-[10.5px] text-fg-3">:{t.port}</span>
              </span>
              <span className={cn("font-mono text-[10px] uppercase tracking-[0.12em]", t.state === "live" ? "text-accent" : "text-fg-3")}>
                {t.state === "live" ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-1.5 flex gap-[3px]">
              {t.bars.split("").map((b, i) => (
                <span key={i} className={cn("h-4 flex-1 rounded-[2px]", b === "1" ? "bg-accent/45" : "bg-white/10")} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </MiniPanel>
  );
}

const activity = [22, 30, 18, 42, 38, 51, 34, 60, 48, 72, 56, 64, 80, 68];

function InsightsVisual() {
  const max = Math.max(...activity);
  return (
    <MiniPanel className="mx-auto max-w-[440px] p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-fg-3">Preview visits</p>
          <p className="mt-0.5 text-[22px] font-semibold tracking-tight text-fg">684</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-fg-3">Bandwidth</p>
          <p className="mt-0.5 font-mono text-[13px] text-fg-2">1.4 GB</p>
        </div>
      </div>
      <div className="mt-4 flex h-24 items-end gap-1.5">
        {activity.map((v, i) => (
          <span
            key={i}
            style={{ height: `${(v / max) * 100}%` }}
            className={cn(
              "flex-1 origin-bottom rounded-t-[3px] transition-transform duration-500 group-hover:scale-y-105",
              i === activity.length - 2 ? "bg-accent" : "bg-white/[0.14]",
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9.5px] text-fg-3">
        <span>14 days ago</span>
        <span>Today</span>
      </div>
    </MiniPanel>
  );
}
