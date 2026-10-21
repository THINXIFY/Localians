import { cn } from "@/lib/cn";
import { type PreviewStatusValue, STATUS_HELP, STATUS_LABEL, STATUS_TONE } from "@/lib/previews";

/** Status pill: always a text label (never colour alone), with the explanation as a tooltip. */
export function PreviewStatusBadge({ status, className }: { status: PreviewStatusValue; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      title={STATUS_HELP[status]}
      data-status={status}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]",
        tone === "live" && "border-accent/30 bg-accent/[0.08] text-accent-ink",
        tone === "warn" && "border-warn/30 bg-warn/[0.08] text-warn",
        tone === "off" && "border-line-strong text-fg-3",
        tone === "bad" && "border-danger/30 bg-danger/[0.06] text-danger",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          tone === "live" && "animate-pulse-dot bg-accent",
          tone === "warn" && "border border-warn bg-transparent",
          tone === "off" && "bg-fg-3/60",
          tone === "bad" && "bg-danger",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
