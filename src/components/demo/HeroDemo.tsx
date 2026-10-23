"use client";

import { AnimatePresence, m, useInView, useReducedMotion } from "motion/react";
import { Globe, Laptop, Lock, RotateCcw, Shuffle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { DemoTag, StatusDot, Window } from "@/components/ui/Window";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/*
 * Phases of the scripted demo:
 * 0 idle · 1 typing · 2 connected · 3 tunnel · 4 live (output) · 5 browser loaded
 */
const FINAL = 5;
const OUTPUT = ["Connected to localhost:3000", "Secure tunnel established", "Your preview is live"];
const REQUESTS = [
  { method: "GET", path: "/", status: 200 },
  { method: "GET", path: "/_next/static/css/app.css", status: 200 },
  { method: "GET", path: "/api/products?featured=1", status: 200 },
];

export function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();

  const [animPhase, setPhase] = useState(0);
  const [animTyped, setTyped] = useState(0);
  const [run, setRun] = useState(0);

  // Reduced motion: show the finished state immediately instead of scripting it.
  const phase = reduce ? FINAL : animPhase;
  const typed = reduce ? site.command.length : animTyped;

  const play = useCallback(() => {
    setPhase(0);
    setTyped(0);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!inView || reduce) return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const start = 500;
    const perChar = 42;
    at(start, () => setPhase(1));
    for (let i = 1; i <= site.command.length; i++) at(start + i * perChar, () => setTyped(i));
    const done = start + site.command.length * perChar + 380;
    at(done, () => setPhase(2));
    at(done + 520, () => setPhase(3));
    at(done + 1040, () => setPhase(4));
    at(done + 1500, () => setPhase(5));
    return () => timers.forEach(window.clearTimeout);
  }, [inView, reduce, run]);

  const live = phase >= 4;

  return (
    <div ref={ref} className="relative mx-auto max-w-[1120px]">
      {/* Accent floor glow under the stage */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-[10%] -bottom-10 h-40 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.16),transparent)] blur-2xl transition-opacity duration-1000",
          live ? "opacity-100" : "opacity-30",
        )}
      />

      <FlowRail phase={phase} />

      <div className="relative mt-5 grid gap-4 lg:mt-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-5">
        <Terminal phase={phase} typed={typed} onReplay={play} />
        <BrowserPreview loaded={phase >= FINAL} connecting={phase >= 2 && phase < FINAL} />
      </div>

      <div className="mt-5 flex justify-center">
        <DemoTag>Illustrative demo · not a live tunnel</DemoTag>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FlowRail({ phase }: { phase: number }) {
  const nodes = [
    { label: "Localhost", sub: ":3000", icon: Laptop, on: phase >= 2 },
    { label: "Localians", sub: "tunnel", icon: Shuffle, on: phase >= 3 },
    { label: "Client", sub: "browser", icon: Globe, on: phase >= 5 },
  ];
  return (
    <ol aria-label="Connection flow" className="mx-auto flex max-w-[760px] items-center justify-between gap-1.5 sm:gap-2 sm:px-1">
      {nodes.map((node, i) => (
        <li key={node.label} className={cn("flex items-center gap-1.5 sm:gap-2", i < nodes.length - 1 && "flex-1")}>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition-colors duration-500 sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-3",
              node.on ? "border-accent/35 bg-accent/[0.06]" : "border-line bg-white/[0.02]",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full transition-colors duration-500",
                node.on ? "bg-accent text-[#070907]" : "bg-white/[0.06] text-fg-3",
              )}
            >
              <node.icon className="size-3.5" aria-hidden="true" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg sm:text-[11px] sm:tracking-[0.14em]">
              {node.label}
              <span className="ml-1.5 hidden normal-case tracking-normal text-fg-3 sm:inline">{node.sub}</span>
            </span>
          </div>
          {i < nodes.length - 1 ? <Connector active={nodes[i + 1].on} /> : null}
        </li>
      ))}
    </ol>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <span aria-hidden="true" className="relative h-px min-w-3 flex-1 overflow-hidden bg-white/10">
      <span
        className={cn(
          "absolute inset-0 origin-left bg-accent/40 transition-transform duration-700 ease-out",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
      {active ? (
        <span className="animate-travel absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent" />
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function Terminal({ phase, typed, onReplay }: { phase: number; typed: number; onReplay: () => void }) {
  const done = phase >= 2;
  return (
    <Window
      className="flex flex-col"
      title="~/projects/storefront — zsh"
      right={
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10.5px] text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg"
          aria-label="Replay terminal demo"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          <span className="hidden sm:inline">Replay</span>
        </button>
      }
      bodyClassName="flex flex-1 flex-col"
    >
      <div className="flex-1 px-4 py-5 font-mono text-[12.5px] leading-[1.85] sm:px-5 sm:text-[13px]" aria-live="off">
        <p className="text-fg-3">
          <span className="text-fg-3">➜</span> <span className="text-fg-2">storefront</span>{" "}
          <span className="text-fg-3">git:(</span>
          <span className="text-fg-2">main</span>
          <span className="text-fg-3">)</span>
        </p>
        <p className="whitespace-pre-wrap break-all text-fg">
          <span className="select-none text-accent">$ </span>
          {site.command.slice(0, typed)}
          {!done ? <span aria-hidden="true" className="animate-blink ml-px inline-block h-[1.05em] w-[0.55em] translate-y-[3px] bg-fg/80" /> : null}
        </p>

        <div className="mt-2 min-h-[118px]">
          {OUTPUT.map((line, i) =>
            phase >= i + 2 ? (
              <m.p
                key={line}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex gap-2.5 text-fg-2"
              >
                <span className="text-accent">✓</span>
                {line}
              </m.p>
            ) : null,
          )}
          <AnimatePresence>
            {phase >= 4 ? (
              <m.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/[0.05] py-1.5 pl-3 pr-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Lock className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="truncate text-accent">{site.demoUrl}</span>
                </span>
                <CopyButton value={site.demoUrl} label="Copy demo preview link" showText className="border-accent/20 bg-black/30" />
              </m.div>
            ) : null}
          </AnimatePresence>
          {phase >= FINAL ? (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-4 space-y-0.5 text-[11.5px] text-fg-3 sm:text-[12px]"
            >
              {REQUESTS.map((r) => (
                <p key={r.path} className="flex gap-3">
                  <span className="w-9 text-fg-2">{r.method}</span>
                  <span className="min-w-0 flex-1 truncate">{r.path}</span>
                  <span className="text-accent/80">{r.status}</span>
                </p>
              ))}
            </m.div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 font-mono text-[11px] sm:px-5">
        <span className="flex items-center gap-2">
          <StatusDot state={phase >= 4 ? "live" : phase >= 1 ? "idle" : "offline"} />
          <span className={phase >= 4 ? "text-accent" : "text-fg-3"}>
            {phase >= 4 ? "Connected" : phase >= 1 ? "Connecting…" : "Waiting"}
          </span>
        </span>
        <span className="truncate text-fg-3">localhost:3000 → https</span>
      </div>
    </Window>
  );
}

/* ------------------------------------------------------------------ */

function BrowserPreview({ loaded, connecting }: { loaded: boolean; connecting: boolean }) {
  return (
    <Window
      title={
        <span className="mx-auto flex max-w-[320px] items-center justify-center gap-1.5 rounded-md border border-line bg-black/40 px-3 py-1 text-fg-2">
          <Lock className={cn("size-3 shrink-0", loaded ? "text-accent" : "text-fg-3")} aria-hidden="true" />
          <span className="truncate">demo.localians.com</span>
        </span>
      }
      right={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
            loaded ? "bg-accent/10 text-accent" : "text-fg-3",
          )}
        >
          <StatusDot state={loaded ? "live" : "offline"} />
          {loaded ? "Live" : "—"}
        </span>
      }
      bodyClassName="relative"
    >
      <div className="@container relative aspect-[16/11] overflow-hidden sm:aspect-[16/10]">
        <AnimatePresence initial={false} mode="wait">
          {loaded ? (
            <m.div
              key="app"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0"
            >
              <MockStorefront />
            </m.div>
          ) : (
            <m.div key="wait" exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
              <div className="w-full max-w-[420px] space-y-3 opacity-60" aria-hidden="true">
                {[90, 70, 80].map((w, i) => (
                  <div
                    key={i}
                    style={{ width: `${w}%` }}
                    className={cn(
                      "h-3 rounded bg-white/[0.05]",
                      connecting && "animate-shimmer bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.09),rgba(255,255,255,0.03))] bg-[length:200%_100%]",
                    )}
                  />
                ))}
              </div>
              <p className="font-mono text-[11.5px] text-fg-3">
                {connecting ? "Opening secure tunnel…" : "Waiting for a shared link"}
              </p>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Window>
  );
}

/** A believable client web app, drawn entirely with CSS. */
function MockStorefront() {
  return (
    <div className="flex h-full flex-col bg-[#f3f1ea] text-[#16180f]" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-black/[0.07] px-[5%] py-[2.4%]">
        <span className="text-[clamp(10px,2.6cqw,14px)] font-semibold tracking-[0.2em]">HALDEN</span>
        <span className="hidden gap-[clamp(10px,4cqw,22px)] text-[clamp(8px,1.9cqw,11px)] text-black/60 sm:flex">
          <span>Shop</span>
          <span>Journal</span>
          <span>About</span>
        </span>
        <span className="rounded-full bg-[#16180f] px-[clamp(8px,2cqw,12px)] py-[3px] text-[clamp(8px,1.8cqw,10.5px)] text-[#f3f1ea]">
          Cart · 2
        </span>
      </div>
      <div className="grid flex-1 grid-cols-[1.1fr_1fr] gap-[4%] px-[5%] py-[4.5%]">
        <div className="flex flex-col justify-center">
          <span className="text-[clamp(7.5px,1.7cqw,10px)] uppercase tracking-[0.2em] text-black/70">Spring collection</span>
          <span className="mt-[6%] text-[clamp(15px,5.4cqw,32px)] font-semibold leading-[1.02] tracking-[-0.03em]">
            Objects for slower mornings.
          </span>
          <span className="mt-[6%] max-w-[30ch] text-[clamp(8px,1.9cqw,11.5px)] leading-snug text-black/55">
            Hand-thrown ceramics and linen goods, made in small batches.
          </span>
          <span className="mt-[8%] inline-flex w-fit rounded-full bg-[#16180f] px-[clamp(10px,2.8cqw,16px)] py-[clamp(4px,1.2cqw,7px)] text-[clamp(8px,1.9cqw,11px)] text-[#f3f1ea]">
            Shop the edit
          </span>
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-[6%]">
          <div className="row-span-2 rounded-[clamp(6px,1.8cqw,12px)] bg-[radial-gradient(circle_at_50%_62%,#c9b89a_0_28%,#ddd2bd_29%_100%)]" />
          <div className="rounded-[clamp(6px,1.8cqw,12px)] bg-[radial-gradient(ellipse_at_50%_70%,#8a9a7b_0_30%,#cfd6c3_31%_100%)]" />
          <div className="rounded-[clamp(6px,1.8cqw,12px)] bg-[linear-gradient(160deg,#e6dfd0,#d1c4ad)]" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-black/[0.07] px-[5%] py-[2.2%] text-[clamp(7.5px,1.7cqw,10px)] text-black/70">
        <span className="size-1.5 rounded-full bg-[#5c8f1d]" />
        Served from localhost:3000 via a Localians preview link
      </div>
    </div>
  );
}
