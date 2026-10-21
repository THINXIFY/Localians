"use client";

import { useEffect } from "react";

const IDLE_MS = 900;

/**
 * Marks whichever element is scrolling with `data-scrolling` (the page, the dashboard sidebar, a code block, ...)
 * so its scrollbar can light up (see globals.css), and clears it shortly after scrolling stops.
 * One passive, capturing listener; the attribute is only written when it changes.
 */
export function ScrollbarGlow() {
  useEffect(() => {
    const timers = new WeakMap<Element, number>();
    const onScroll = (event: Event) => {
      const target = event.target;
      const el = target === document ? document.documentElement : target instanceof Element ? target : null;
      if (!el) return;
      if (!el.hasAttribute("data-scrolling")) el.setAttribute("data-scrolling", "");
      window.clearTimeout(timers.get(el));
      timers.set(
        el,
        window.setTimeout(() => {
          el.removeAttribute("data-scrolling");
          timers.delete(el);
        }, IDLE_MS),
      );
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.documentElement.removeAttribute("data-scrolling");
    };
  }, []);
  return null;
}
