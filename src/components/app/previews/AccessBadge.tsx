import { Globe, Lock } from "lucide-react";
import { cn } from "@/lib/cn";

/** Protected (password) or Public — always with an icon and text, never colour alone. */
export function AccessBadge({ access, className }: { access: "PUBLIC" | "PASSWORD"; className?: string }) {
  const locked = access === "PASSWORD";
  return (
    <span
      data-access={locked ? "protected" : "public"}
      title={locked ? "Visitors must enter the project password." : "Anyone with the link can open it."}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]",
        locked ? "border-accent/30 text-accent-ink" : "border-line-strong text-fg-3",
        className,
      )}
    >
      {locked ? <Lock className="size-3" aria-hidden="true" /> : <Globe className="size-3" aria-hidden="true" />}
      {locked ? "Protected" : "Public"}
    </span>
  );
}
