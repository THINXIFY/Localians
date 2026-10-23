import { Skeleton } from "@/components/app/Primitives";

export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading analytics">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[112px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
