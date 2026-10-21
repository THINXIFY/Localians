import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.16em] text-fg-2",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-[2px] bg-accent" />
      {children}
    </p>
  );
}

type SectionHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  id?: string;
  className?: string;
};

export function SectionHeader({ eyebrow, title, description, align = "center", id, className }: SectionHeaderProps) {
  const centered = align === "center";
  return (
    <Reveal className={cn("flex flex-col gap-5", centered ? "mx-auto items-center text-center" : "items-start", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className={cn(
          "text-balance text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] text-fg sm:text-[42px] lg:text-[50px]",
          centered && "max-w-[20ch]",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "text-pretty text-[16px] leading-relaxed text-fg-2 sm:text-[17px]",
            centered ? "max-w-[56ch]" : "max-w-[48ch]",
          )}
        >
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
