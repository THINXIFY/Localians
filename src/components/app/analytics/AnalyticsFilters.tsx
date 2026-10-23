"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { inputClasses, Select } from "../Field";

const RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
] as const;

/** One row above the charts: date range first, then project. Everything below follows it. */
export function AnalyticsFilters({
  range,
  from,
  to,
  minDate,
  maxDate,
  projects,
  projectId,
  error,
}: {
  range: string;
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
  projects: { id: string; name: string }[];
  projectId: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(range === "custom");
  const [dates, setDates] = useState({ from, to });

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || (k === "range" && v === "7d")) sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Time range" className="flex w-fit max-w-full flex-wrap rounded-xl border border-line-strong bg-tint/[0.03] p-1">
          {RANGES.map((r) => {
            const selected = r.value === "custom" ? showCustom || range === "custom" : !showCustom && range === r.value;
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (r.value === "custom") return setShowCustom(true);
                  setShowCustom(false);
                  update({ range: r.value, from: null, to: null });
                }}
                className={cn("rounded-lg px-3 py-1.5 text-[13px] transition-colors", selected ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg")}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="analytics-project" className="sr-only">
            Project
          </label>
          <Select id="analytics-project" value={projectId ?? ""} onChange={(e) => update({ project: e.target.value || null })} density="sm" wrapperClassName="md:w-64">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {showCustom ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            update({ range: "custom", from: dates.from, to: dates.to });
          }}
        >
          <label className="flex flex-col gap-1 text-[12.5px] text-fg-2">
            From (UTC)
            <input type="date" required min={minDate} max={maxDate} value={dates.from} onChange={(e) => setDates((d) => ({ ...d, from: e.target.value }))} className={cn(inputClasses, "h-10")} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-fg-2">
            To (UTC)
            <input type="date" required min={minDate} max={maxDate} value={dates.to} onChange={(e) => setDates((d) => ({ ...d, to: e.target.value }))} className={cn(inputClasses, "h-10")} />
          </label>
          <Button type="submit" size="sm" loading={pending}>
            Apply
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error} Showing the last 7 days instead.
        </p>
      ) : null}
    </div>
  );
}
