import { Clock, Code2, Eye, EyeOff, KeyRound, Link2, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DemoTag, StatusDot } from "@/components/ui/Window";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** Product capabilities. Anything not live in this environment carries a "Coming soon" badge (see launchFlags). */
export function Features({ customUrls, vscode }: { customUrls: boolean; vscode: boolean }) {
  return (
    <section id="features" aria-labelledby="features-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="features-title"
          eyebrow="Everything you need"
          title="Built for showing work in progress."
          description="One command to share, and the controls you need to keep previews private, on time and on brand."
        />

        <div className="mt-14 grid gap-4 sm:mt-16 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          <FeatureCard
            className="md:col-span-2 lg:col-span-4"
            title="One command. Instant preview."
            description={`Run ${site.command} next to your app and get a shareable link in seconds. Hot reload keeps working.`}
            visual={<CommandVisual />}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="Password-protected sharing."
            description="Visitors enter a password before they see anything. Change it and everyone is signed out."
            visual={<AccessVisual />}
            delay={0.06}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="Custom preview URLs."
            description="Reserve a memorable link like agentaxio.preview.localians.com with the Preview Pass."
            badge={customUrls ? undefined : "Coming soon"}
            visual={<CustomUrlVisual />}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="Flexible preview timers."
            description="Every link has an end time, with optional auto-stops from 5 minutes. Enforced on the server."
            visual={<TimerVisual />}
            delay={0.06}
          />
          <FeatureCard
            className="lg:col-span-2"
            title="Secure HTTPS links."
            description="Encrypted, unguessable preview links. See what is online and stop any preview instantly."
            visual={<StatusVisual />}
            delay={0.12}
          />
          <FeatureCard
            className="lg:col-span-3"
            title="Projects and analytics."
            description="Organize previews by project and see visits and bandwidth without the noise."
            visual={<InsightsVisual />}
          />
          <FeatureCard
            className="lg:col-span-3"
            title="Share from VS Code."
            description="Pick your running app in the sidebar and share it without opening a terminal."
            badge={vscode ? undefined : "Coming soon"}
            visual={<VsCodeVisual />}
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
  badge,
  delay = 0,
}: {
  title: string;
  description: string;
  visual: ReactNode;
  className?: string;
  badge?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={cn("group surface hairline-top flex flex-col overflow-hidden transition-colors duration-300 hover:border-line-strong", className)}>
      <div className="relative flex min-h-[200px] flex-1 items-center justify-center overflow-hidden border-b border-line bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.03),transparent)] p-5 sm:p-6">
        <div aria-hidden="true" className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_70%_at_50%_50%,#000,transparent)]" />
        <div className={cn("relative w-full", badge && "opacity-70")} aria-hidden="true">
          {visual}
        </div>
      </div>
      <div className="p-6 sm:p-7">
        <h3 className="flex flex-wrap items-center gap-2 text-[18px] font-semibold tracking-[-0.02em] text-fg">
          {title}
          {badge ? <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-fg-3">{badge}</span> : null}
        </h3>
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
          <p className="font-mono text-[10.5px] text-fg-3">storefront · :5173</p>
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

const tunnels = [
  { name: "storefront", port: "5173", state: "live" as const, bars: "111111111111111111" },
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

function CustomUrlVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[300px] p-4">
      <p className="text-[11px] text-fg-3">Preview link</p>
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.07] px-2.5 py-2 font-mono text-[11.5px]">
        <Lock className="size-3 shrink-0 text-accent" />
        <span className="truncate">
          <span className="text-accent">agentaxio</span>
          <span className="text-fg-3">.preview.localians.com</span>
        </span>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-fg-3">
        <Link2 className="size-3" /> Same link every time you share
      </p>
    </MiniPanel>
  );
}

function TimerVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[300px] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
          <Clock className="size-3.5 text-accent" /> Expires in
        </span>
        <span className="font-mono text-[10px] text-fg-3">auto-stop</span>
      </div>
      <p className="mt-2 font-mono text-[26px] font-semibold tabular-nums tracking-tight text-fg">
        23<span className="text-fg-3">h</span> 41<span className="text-fg-3">m</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full w-[86%] rounded-full bg-accent/70 transition-[width] duration-700 group-hover:w-[80%]" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {["15m", "1h", "12h", "24h"].map((d) => (
          <span key={d} className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px]", d === "24h" ? "border-accent/40 text-accent" : "border-line text-fg-3")}>
            {d}
          </span>
        ))}
      </div>
    </MiniPanel>
  );
}

function VsCodeVisual() {
  return (
    <MiniPanel className="mx-auto max-w-[420px] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
        <Code2 className="size-3.5 text-fg-3" />
        <span className="font-mono text-[10.5px] text-fg-3">LOCALIANS</span>
      </div>
      <ul className="divide-y divide-line">
        {[
          { name: "storefront", port: "3000", live: true },
          { name: "docs-site", port: "5173", live: false },
        ].map((a) => (
          <li key={a.name} className="flex items-center gap-3 px-3.5 py-2.5">
            <StatusDot state={a.live ? "live" : "offline"} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">{a.name}</span>
            <span className="font-mono text-[10.5px] text-fg-3">:{a.port}</span>
            <span className={cn("rounded-md px-2 py-0.5 text-[10.5px]", a.live ? "bg-accent/15 text-accent" : "border border-line text-fg-3")}>{a.live ? "Shared" : "Share"}</span>
          </li>
        ))}
      </ul>
    </MiniPanel>
  );
}
