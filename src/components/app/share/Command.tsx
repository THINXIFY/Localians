"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { cn } from "@/lib/cn";

/** A terminal command with a copy button. `size="lg"` is the wizard's main command; `dense` centres a one-line command in a list row. */
export function Command({ value, label, size = "md", dense = false, className }: { value: string; label?: string; size?: "md" | "lg"; dense?: boolean; className?: string }) {
  if (size === "md") {
    return (
      <div className={cn("flex min-w-0 gap-2 rounded-lg border border-line bg-bg-2 px-3", dense ? "items-center py-1" : "items-start py-2", className)}>
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12.5px] leading-relaxed text-fg">{value}</code>
        <CopyButton value={value} label={label ?? "Copy command"} className="hover:bg-tint/[0.05]" />
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-line-strong bg-bg-2 p-3 sm:flex-row sm:items-center sm:p-2 sm:pl-4", className)}>
      <code className="min-w-0 flex-1 break-all font-mono text-[15px] text-fg" data-testid="share-command">
        <span aria-hidden="true" className="select-none text-accent-ink">
          ${" "}
        </span>
        {value}
      </code>
      <CopyLabelButton value={value} label={label ?? "Copy Command"} />
    </div>
  );
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

/** Prominent copy button with a visible label ("Copy Command", "Copy Link"). */
export function CopyLabelButton({
  value,
  label,
  variant = "primary",
  size = "md",
  ariaLabel,
  onCopied,
}: {
  value: string;
  label: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  /** Accessible name when the visible label needs context (e.g. which project). */
  ariaLabel?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await writeClipboard(value);
          setCopied(true);
          onCopied?.();
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-colors",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-[13.5px]",
        variant === "primary" ? "bg-accent text-[#070907] hover:bg-accent-hover" : "border border-line-strong bg-tint/[0.04] text-fg hover:bg-tint/[0.08]",
      )}
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {copied ? "Copied" : label}
      <span className="sr-only" role="status">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}
