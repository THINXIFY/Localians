import { cn } from "@/lib/cn";

export const DEVELOPER = { name: "Thinxify Technologies", url: "https://thinxify.com" } as const;

/** "Developed by: Thinxify Technologies" credit, linking to thinxify.com. */
export function DevelopedBy({ className }: { className?: string }) {
  return (
    <p className={cn("text-[12.5px] text-fg-3", className)}>
      Developed by:{" "}
      <a href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline-offset-4 transition-colors hover:text-fg hover:underline">
        {DEVELOPER.name}
      </a>
    </p>
  );
}
