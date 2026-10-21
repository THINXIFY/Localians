"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { inputClasses } from "../Field";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "connected", label: "Connected" },
  { value: "offline", label: "Offline" },
  { value: "historical", label: "Historical" },
] as const;

const selectClasses = cn(inputClasses, "h-10 w-full appearance-auto pr-8 text-[13.5px] sm:w-auto");

/** Status, project, search and sort — all in the URL so views are shareable and survive refresh. */
export function PreviewFilters({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounce = useRef<number | undefined>(undefined);
  const filter = params.get("filter") ?? "all";

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || (k === "filter" && v === "all") || (k === "sort" && v === "activity")) sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("cursor");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  useEffect(() => () => window.clearTimeout(debounce.current), []);

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div role="group" aria-label="Filter by connection" className="flex w-fit max-w-full flex-wrap rounded-xl border border-line-strong bg-tint/[0.03] p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => update({ filter: f.value })}
            className={cn("rounded-lg px-3 py-1.5 text-[13px] transition-colors", filter === f.value ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg")}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <label htmlFor="preview-search" className="sr-only">
            Search by project name or preview URL
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input
            id="preview-search"
            type="search"
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              window.clearTimeout(debounce.current);
              debounce.current = window.setTimeout(() => update({ q: value.trim() }), 250);
            }}
            placeholder="Search project or preview URL…"
            maxLength={100}
            className={cn(inputClasses, "h-10 pl-10")}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex">
          <label className="sr-only" htmlFor="preview-project">
            Project
          </label>
          <select id="preview-project" value={params.get("project") ?? ""} onChange={(e) => update({ project: e.target.value })} className={selectClasses}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="preview-sort">
            Sort
          </label>
          <select id="preview-sort" value={params.get("sort") ?? "activity"} onChange={(e) => update({ sort: e.target.value })} className={selectClasses}>
            <option value="activity">Latest activity</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </div>
    </div>
  );
}
