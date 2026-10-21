import { Skeleton } from "@/components/app/Primitives";

export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading projects">
      <div className="flex items-end justify-between">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-40 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
