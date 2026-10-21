"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type MenuItem =
  | { type: "link"; label: string; href: string; icon?: ReactNode }
  | { type: "action"; label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean }
  | { type: "separator" };

type MenuProps = {
  trigger: (props: { open: boolean }) => ReactNode;
  triggerLabel: string;
  items: MenuItem[];
  header?: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  triggerClassName?: string;
};

/** Accessible dropdown menu (menu button pattern): arrows, Home/End, Escape, outside click. */
export function Menu({ trigger, triggerLabel, items, header, align = "end", side = "bottom", triggerClassName }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) buttonRef.current?.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const els = itemRefs.current.filter(Boolean) as HTMLElement[];
    const index = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(index + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(index - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  let actionIndex = -1;
  const itemClass = (danger?: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] outline-none transition-colors focus-visible:bg-tint/[0.07] hover:bg-tint/[0.05]",
      danger ? "text-danger" : "text-fg",
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger({ open })}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-[60] min-w-[220px] animate-[menu-in_140ms_ease-out] rounded-xl border border-line-strong bg-elevated p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]",
            align === "end" ? "right-0" : "left-0",
            side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          )}
        >
          {header ? <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">{header}</div> : null}
          <div className={header ? "pt-1.5" : undefined}>
            {items.map((item, i) => {
              if (item.type === "separator") return <div key={`sep-${i}`} role="separator" className="my-1.5 h-px bg-line" />;
              actionIndex++;
              const idx = actionIndex;
              if (item.type === "link") {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onClick={() => close(false)}
                    className={itemClass()}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onClick={() => {
                    close(false);
                    item.onSelect();
                  }}
                  className={itemClass(item.danger)}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
