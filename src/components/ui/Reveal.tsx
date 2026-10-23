"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

/**
 * Fades content up once when it scrolls into view: a CSS transition started by an IntersectionObserver (no animation
 * library to hydrate). Content is only hidden while JavaScript runs (`html[data-js]`), so it's always in the HTML and
 * readable without JavaScript. Reduced motion: no movement (see globals.css).
 */
export function Reveal({ children, className, delay = 0, y = 18 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn("reveal", shown && "is-in", className)} style={{ "--reveal-delay": `${delay}s`, "--reveal-y": `${y}px` } as CSSProperties}>
      {children}
    </div>
  );
}
