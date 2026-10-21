"use client";

import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

type Item = { question: string; answer: string };

export function Accordion({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item, i) => {
        const expanded = open === i;
        const buttonId = `${baseId}-q-${i}`;
        const panelId = `${baseId}-a-${i}`;
        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : i)}
                className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[16px] font-medium tracking-[-0.01em] text-fg transition-colors hover:text-white sm:text-[17px]"
              >
                {item.question}
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border transition-[transform,border-color,background-color,color] duration-300",
                    expanded ? "rotate-45 border-accent/40 bg-accent/10 text-accent" : "border-line text-fg-2 group-hover:border-line-strong",
                  )}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
              inert={!expanded}
            >
              <div className="overflow-hidden">
                <p className="max-w-[62ch] pb-6 pr-12 text-[15px] leading-relaxed text-fg-2">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
