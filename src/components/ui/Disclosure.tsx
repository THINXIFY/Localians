import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared look for the dashboard's native <details> sections (keyboard and screen-reader support come with the element;
 * browsers never restore it as open after a reload). Put `summaryClasses` on the <summary> and a <DisclosureChevron>
 * inside it.
 */
export const summaryClasses =
  "cursor-pointer list-none select-none outline-none marker:hidden [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-inset";

/**
 * Points down when closed and turns up when its own section opens. Keyed to the nearest open <details> above the
 * summary (not a Tailwind group), so sections nested inside other sections rotate independently.
 */
export function DisclosureChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 text-fg-3 transition-transform duration-200 ease-out motion-reduce:transition-none [details[open]>summary_&]:rotate-180",
        className,
      )}
    />
  );
}
