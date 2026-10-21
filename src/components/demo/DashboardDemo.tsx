"use client";

import { AnimatePresence, m } from "motion/react";
import {
  Activity,
  BarChart3,
  ChevronRight,
  FolderKanban,
  LayoutGrid,
  Lock,
  Plus,
  Radio,
  Search,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { DemoTag, StatusDot, Window } from "@/components/ui/Window";
import { cn } from "@/lib/cn";

type Project = {
  id: string;
  name: string;
  live: boolean;
  local: string;
  url: string;
  visits: number[];
};

// Illustrative demo data only.
const projects: Project[] = [
  {
    id: "ecommerce",
    name: "E-commerce Website",
    live: true,
    local: "localhost:3000",
    url: "https://demo.localians.com",
    visits: [4, 6, 5, 9, 12, 8, 14, 18, 15, 22, 19, 26],
  },
  {
    id: "client-dashboard",
    name: "Client Dashboard",
    live: true,
    local: "localhost:5173",
    url: "https://client-dashboard.localians.com",
    visits: [2, 3, 3, 5, 4, 7, 6, 9, 8, 7, 11, 10],
  },
  {
    id: "portfolio",
    name: "Portfolio Redesign",
    live: false,
    local: "localhost:8080",
    url: "https://portfolio.localians.com",
    visits: [6, 8, 7, 5, 9, 6, 4, 3, 0, 0, 0, 0],
  },
];

const stats = [
  { label: "Total Projects", value: "3", note: "in workspace" },
  { label: "Active Previews", value: "2", note: "online now", live: true },
  { label: "Preview Visits", value: "1,284", note: "last 30 days" },
  { label: "Bandwidth Usage", value: "2.1 GB", note: "last 30 days" },
];

const nav = [
  { label: "Overview", icon: LayoutGrid, active: true },
  { label: "Projects", icon: FolderKanban },
  { label: "Live Previews", icon: Radio },
  { label: "Analytics", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

export function DashboardDemo() {
  const [selectedId, setSelectedId] = useState(projects[0].id);
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  return (
    <Window
      title="Localians — Overview"
      right={<DemoTag className="hidden sm:inline-flex">Demo data</DemoTag>}
      className="mx-auto max-w-[1160px]"
      bodyClassName="grid md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[216px_minmax(0,1fr)]"
    >
      {/* Sidebar */}
      <aside aria-label="Dashboard navigation (demo)" className="hidden border-r border-line bg-white/[0.012] p-3 md:block">
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-black/30 px-2.5 py-2 text-[12px] text-fg-3">
          <Search className="size-3.5" aria-hidden="true" />
          Search
          <kbd className="ml-auto rounded border border-line px-1 font-mono text-[10px]">/</kbd>
        </div>
        <ul className="space-y-0.5">
          {nav.map((item) => (
            <li
              key={item.label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]",
                item.active ? "bg-white/[0.06] text-fg" : "text-fg-2",
              )}
            >
              <item.icon className={cn("size-4", item.active ? "text-accent" : "text-fg-3")} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        <div className="mt-8 rounded-lg border border-line p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-3">Plan</p>
          <p className="mt-1 text-[12.5px] text-fg">Free Beta</p>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">Workspace</p>
            <p className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-fg">Overview</p>
          </div>
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[#070907] opacity-90"
          >
            <Plus className="size-3.5" />
            New preview
          </span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-white/[0.02] p-3.5">
              <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                {s.live ? <StatusDot /> : null}
                {s.label}
              </dt>
              <dd className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-fg sm:text-[24px]">{s.value}</dd>
              <dd className="mt-0.5 font-mono text-[10.5px] text-fg-3">{s.note}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Project list */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[13px] font-medium text-fg">Projects</p>
              <p className="font-mono text-[10.5px] text-fg-3">Select a row</p>
            </div>
            <ul aria-label="Demo projects" className="divide-y divide-line">
              {projects.map((p) => {
                const active = p.id === selected.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      aria-pressed={active}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors sm:grid-cols-[minmax(0,1.4fr)_96px_minmax(0,1fr)_16px]",
                        active ? "bg-white/[0.04]" : "hover:bg-white/[0.02]",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold",
                            active ? "border-accent/30 bg-accent/[0.08] text-accent" : "border-line bg-white/[0.03] text-fg-2",
                          )}
                        >
                          {p.name.charAt(0)}
                        </span>
                        <span className="truncate text-[13.5px] text-fg">{p.name}</span>
                      </span>
                      <StatusPill live={p.live} />
                      <span className="col-span-2 pl-11 font-mono text-[11.5px] text-fg-3 sm:col-span-1 sm:pl-0">{p.local}</span>
                      <ChevronRight
                        className={cn("hidden size-4 sm:block", active ? "text-fg-2" : "text-white/20")}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-white/[0.012] px-4 py-3 text-[11.5px] text-fg-3">
              Add a project from your terminal:
              <code className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                npx localians share &lt;port&gt;
              </code>
            </div>
          </div>

          {/* Active preview panel */}
          <AnimatePresence mode="wait" initial={false}>
            <m.section
              key={selected.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              aria-label={`${selected.name} preview details (demo)`}
              className={cn(
                "rounded-xl border p-4",
                selected.live ? "border-accent/20 bg-[linear-gradient(180deg,rgba(184,255,59,0.04),transparent_60%)]" : "border-line",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-3">Active preview</p>
                  <p className="mt-1 truncate text-[15px] font-semibold text-fg">{selected.name}</p>
                </div>
                <StatusPill live={selected.live} />
              </div>

              <dl className="mt-4 space-y-2.5 text-[12px]">
                <Row label="Local address">
                  <span className="font-mono text-fg-2">{selected.local}</span>
                </Row>
                <Row label="Status">
                  <span className={cn("font-mono", selected.live ? "text-accent" : "text-fg-3")}>
                    {selected.live ? "Tunnel connected" : "Tunnel offline"}
                  </span>
                </Row>
              </dl>

              <div className="mt-3 rounded-lg border border-line bg-black/40 p-2.5">
                <p className="text-[10.5px] text-fg-3">Preview link</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Lock className={cn("size-3 shrink-0", selected.live ? "text-accent" : "text-fg-3")} aria-hidden="true" />
                    <span className={cn("truncate font-mono text-[11.5px]", selected.live ? "text-fg" : "text-fg-3 line-through")}>
                      {selected.url.replace("https://", "")}
                    </span>
                  </span>
                  <CopyButton value={selected.url} label={`Copy demo URL for ${selected.name}`} showText />
                </div>
              </div>

              <ActivityChart values={selected.visits} live={selected.live} />
            </m.section>
          </AnimatePresence>
        </div>
      </div>
    </Window>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 justify-self-end rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] sm:justify-self-start",
        live ? "border-accent/25 bg-accent/[0.07] text-accent" : "border-line text-fg-3",
      )}
    >
      <StatusDot state={live ? "live" : "offline"} />
      {live ? "Live" : "Offline"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fg-3">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

/** Single-series bar chart with a per-bar hover/focus tooltip. */
function ActivityChart({ values, live }: { values: number[]; live: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <figure className="mt-4">
      <figcaption className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-fg-2">
          <Activity className="size-3.5 text-fg-3" aria-hidden="true" />
          Visits · last 12 hours
        </span>
        <span className="font-mono text-fg-3">{total} total</span>
      </figcaption>
      <div className="relative mt-3 flex h-[88px] items-end gap-[2px] border-b border-line" onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <span
            key={i}
            aria-hidden="true"
            onMouseEnter={() => setHover(i)}
            className="relative flex h-full flex-1 items-end"
          >
            <span
              style={{ height: `${Math.max((v / max) * 100, 3)}%` }}
              className={cn(
                "w-full rounded-t-[4px] transition-colors",
                !live && v === 0 ? "bg-white/[0.06]" : hover === i ? "bg-accent" : live ? "bg-accent/45" : "bg-white/20",
              )}
            />
          </span>
        ))}
        {hover !== null ? (
          <span
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line-strong bg-elevated px-2 py-1 font-mono text-[10.5px] text-fg shadow-lg"
            style={{ left: `${((hover + 0.5) / values.length) * 100}%` }}
          >
            {values[hover]} visits · {values.length - hover}h ago
          </span>
        ) : null}
      </div>
      <p className="sr-only">
        Sample hourly visits: {values.join(", ")}.
      </p>
    </figure>
  );
}
