"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Prevents closing (Escape / backdrop) while an action is in flight. */
  busy?: boolean;
};

/**
 * Modal built on the native <dialog>: focus is trapped and restored by the
 * browser, Escape closes it, and the rest of the page becomes inert.
 */
export function Dialog({ open, onClose, title, description, children, className, busy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first control; let content pick a safer one (e.g. Cancel on destructive dialogs).
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-32px)] max-w-[480px] rounded-[18px] border border-line-strong bg-card p-0 text-fg shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] backdrop:bg-overlay backdrop:backdrop-blur-[2px] open:animate-[dialog-in_180ms_ease-out]",
        className,
      )}
    >
      {open ? (
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.02em] text-fg">
                {title}
              </h2>
              {description ? (
                <div id={descId} className="mt-1.5 text-[14px] leading-relaxed text-fg-2">
                  {description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close dialog"
              className="-mr-2 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:bg-tint/[0.06] hover:text-fg disabled:opacity-40"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
