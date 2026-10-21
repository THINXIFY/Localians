"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { inputClasses } from "./Field";

const STATUSES = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

/** Search + status filter kept in the URL so results are shareable and survive refresh. */
export function ProjectFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "all";
  const debounce = useRef<number | undefined>(undefined);

  function update(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v || (k === "status" && v === "all")) sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false }));
  }

  useEffect(() => () => window.clearTimeout(debounce.current), []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center" aria-busy={pending}>
      <div className="relative flex-1">
        <label htmlFor="project-search" className="sr-only">
          Search projects by name
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden="true" />
        <input
          id="project-search"
          type="search"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            window.clearTimeout(debounce.current);
            debounce.current = window.setTimeout(() => update({ q: value.trim() }), 250);
          }}
          placeholder="Search projects…"
          maxLength={80}
          className={cn(inputClasses, "h-10 pl-10")}
        />
      </div>
      <div className="flex items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex rounded-xl border border-line-strong bg-tint/[0.03] p-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={status === s.value}
              onClick={() => update({ status: s.value })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                status === s.value ? "bg-tint/[0.09] font-medium text-fg" : "text-fg-2 hover:text-fg",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="hidden whitespace-nowrap text-[12.5px] text-fg-3 md:inline">Sorted by recently updated</span>
      </div>
    </div>
  );
}
