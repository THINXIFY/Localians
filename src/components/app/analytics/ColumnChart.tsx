"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DisclosureChevron, summaryClasses } from "@/components/ui/Disclosure";
import { cn } from "@/lib/cn";
import { formatBytes, formatCount, formatNumber } from "@/lib/format";

export type ColumnPoint = { start: string; value: number };

const HOUR = 3_600_000;
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

const fmtTime = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const fmtDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function binLabel(start: Date, binMs: number) {
  if (binMs >= 24 * HOUR) return fmtDay.format(start);
  const end = new Date(start.getTime() + binMs);
  const day = binMs > HOUR || start.getUTCHours() === 0 ? `${fmtDay.format(start)}, ` : "";
  return `${day}${fmtTime.format(start)}–${fmtTime.format(end)}`;
}

function tickLabel(start: Date, binMs: number) {
  return binMs >= 6 * HOUR ? fmtDay.format(start) : fmtTime.format(start);
}

/** Round axis maximum and 3–4 clean ticks. Byte axes step in powers of 1024. */
function niceTicks(max: number, unit: "count" | "bytes") {
  if (max <= 0) return [0, 1];
  const base = unit === "bytes" ? 1024 ** Math.max(0, Math.floor(Math.log(max) / Math.log(1024))) : 1;
  const scaled = max / base;
  const magnitude = 10 ** Math.floor(Math.log10(scaled));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => scaled / s <= 4) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= scaled + step * 0.001; v += step) ticks.push(v * base);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step * base);
  return unit === "count" ? ticks.map((t) => Math.round(t)).filter((t, i, a) => a.indexOf(t) === i) : ticks;
}

/**
 * Single-series column chart over time (one hue, so no legend — the heading names it).
 * Hover or focus a column for its value; arrow keys move between columns; the data table
 * below carries every value without hovering.
 */
export function ColumnChart({ title, points, binMs, unit }: { title: string; points: ColumnPoint[]; binMs: number; unit: "count" | "bytes" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const format = (v: number) => (unit === "bytes" ? formatBytes(v) : formatNumber(v));
  const axis = (v: number) => (unit === "bytes" ? formatBytes(v) : formatCount(v));
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max, unit);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = points.length ? innerW / points.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 72))));
  const total = points.reduce((n, p) => n + p.value, 0);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!points.length) return;
    const current = active ?? -1;
    const next =
      e.key === "ArrowRight" ? Math.min(points.length - 1, current + 1) : e.key === "ArrowLeft" ? Math.max(0, current <= 0 ? 0 : current - 1) : e.key === "Home" ? 0 : e.key === "End" ? points.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  }

  const activePoint = active !== null ? points[active] : null;
  const tipLeft = active !== null ? PAD.left + band * active + band / 2 : 0;

  return (
    <figure className="flex flex-col gap-3">
      <div
        ref={ref}
        className="relative w-full rounded-lg outline-offset-4"
        tabIndex={points.length ? 0 : -1}
        role="group"
        aria-label={`${title}. ${points.length} periods, total ${format(total)}. Use the left and right arrow keys to read each period.`}
        aria-describedby={`${id}-live`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="presentation" className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-3 font-mono text-[10.5px] tabular-nums">
                  {axis(t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const x = PAD.left + band * i + (band - barW) / 2;
              const h = Math.max(0, PAD.top + innerH - y(p.value));
              const r = Math.min(4, barW / 2, h);
              const base = PAD.top + innerH;
              // Rounded data-end, square at the baseline.
              const d = h > 0 ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z` : "";
              return (
                <g key={p.start} onPointerEnter={() => setActive(i)} onPointerMove={() => active !== i && setActive(i)}>
                  {/* Hit target: the whole band, not just the painted column. */}
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                  {d ? <path d={d} fill="var(--accent-ink)" opacity={active === null || active === i ? 1 : 0.55} /> : null}
                  {i % labelEvery === 0 ? (
                    <text x={PAD.left + band * i + band / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-fg-3 font-mono text-[10.5px]">
                      {tickLabel(new Date(p.start), binMs)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
        {activePoint ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-elevated px-2.5 py-1.5 shadow-lg"
            style={{ left: Math.min(Math.max(tipLeft, 70), Math.max(70, width - 70)) }}
          >
            <p className="text-[13px] font-semibold text-fg">{format(activePoint.value)}</p>
            <p className="font-mono text-[10.5px] text-fg-3">{binLabel(new Date(activePoint.start), binMs)} UTC</p>
          </div>
        ) : null}
        <span id={`${id}-live`} className="sr-only" aria-live="polite">
          {activePoint ? `${binLabel(new Date(activePoint.start), binMs)} UTC: ${format(activePoint.value)}` : ""}
        </span>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
      <details className="text-[12.5px] text-fg-2">
        <summary className={cn(summaryClasses, "flex w-fit items-center gap-1 rounded text-fg-3 transition-colors hover:text-fg")}>
          Show data table
          <DisclosureChevron className="size-3.5" />
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left">
            <caption className="sr-only">{title} by period (UTC)</caption>
            <thead className="sticky top-0 bg-card font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-3">
              <tr>
                <th scope="col" className="px-3 py-2 font-normal">
                  Period (UTC)
                </th>
                <th scope="col" className="px-3 py-2 text-right font-normal">
                  {unit === "bytes" ? "Bandwidth" : "Requests"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((p) => (
                <tr key={p.start}>
                  <td className="px-3 py-1.5">{binLabel(new Date(p.start), binMs)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
