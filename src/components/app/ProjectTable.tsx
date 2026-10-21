import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateTime, timeAgo } from "@/lib/format";
import { frameworkLabel } from "@/lib/validation/project";
import { StatusBadge } from "./Primitives";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  defaultPort: number | null;
  status: "ACTIVE" | "ARCHIVED";
  updatedAt: Date;
};

/** Table on wide screens, stacked rows on small screens — one markup, no duplicated content. */
export function ProjectTable({ projects, compact = false }: { projects: ProjectRow[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
      {/* Visual column labels; each row link reads as a complete sentence on its own. */}
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_90px_minmax(0,1fr)_100px_20px] gap-4 border-b border-line px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3 md:grid"
      >
        <span>Project</span>
        <span>Framework</span>
        <span>Port</span>
        <span>Updated</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="divide-y divide-line" aria-label="Projects">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/dashboard/projects/${p.id}`}
              className={cn(
                "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 transition-colors hover:bg-tint/[0.025] focus-visible:bg-tint/[0.04] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_90px_minmax(0,1fr)_100px_20px]",
                compact ? "py-3.5" : "py-4",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-medium text-fg">{p.name}</span>
                <span className="mt-0.5 block truncate text-[13px] text-fg-3">{p.description || "No description"}</span>
              </span>
              <span className="justify-self-end md:hidden">
                <StatusBadge status={p.status} />
              </span>
              <span className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-3 md:contents md:text-[13.5px]">
                <span className="truncate md:text-fg-2">{frameworkLabel(p.framework) ?? "—"}</span>
                <span className="font-mono md:text-fg-2">{p.defaultPort ? `:${p.defaultPort}` : "—"}</span>
                <span className="md:text-fg-2">
                  <time dateTime={p.updatedAt.toISOString()} title={formatDateTime(p.updatedAt)}>
                    <span className="md:hidden">Updated </span>
                    {timeAgo(p.updatedAt)}
                  </time>
                </span>
              </span>
              <span className="hidden md:block">
                <StatusBadge status={p.status} />
              </span>
              <ChevronRight className="hidden size-4 text-fg-3 transition-transform group-hover:translate-x-0.5 md:block" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
