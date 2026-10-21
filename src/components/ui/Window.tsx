import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type WindowProps = {
  children: ReactNode;
  title?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Neutral app-window frame used by the terminal, browser and dashboard mockups. */
export function Window({ children, title, right, className, bodyClassName }: WindowProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[14px] border border-line-strong bg-[#0a0d0a] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line bg-white/[0.02] px-3.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="min-w-0 flex-1 truncate text-center font-mono text-[11.5px] text-fg-3">{title}</div>
        <div className="flex min-w-[42px] justify-end">{right}</div>
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function StatusDot({ state = "live", className }: { state?: "live" | "offline" | "idle"; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        state === "live" && "animate-pulse-dot bg-accent",
        state === "offline" && "bg-white/25",
        state === "idle" && "bg-warn",
        className,
      )}
    />
  );
}

export function DemoTag({ children = "Illustrative demo", className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-3",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1 rounded-full bg-fg-3" />
      {children}
    </span>
  );
}
