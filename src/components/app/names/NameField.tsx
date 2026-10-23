"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { checkNameFormat, NAME_MAX } from "@/lib/preview-names";

export type NameCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; name: string }
  | { state: "yours"; name: string }
  | { state: "unavailable"; reason: string }
  | { state: "error" };

/**
 * Custom preview name input with live availability: format rules are checked instantly in the browser, availability
 * by the server (debounced, rate limited). The server checks everything again when the name is claimed.
 */
export function NameField({
  value,
  onChange,
  onCheck,
  previewDomain,
  label = "Custom URL",
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onCheck?: (check: NameCheck) => void;
  previewDomain: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const local = value ? checkNameFormat(value) : null;
  // Only the server's answer is state; everything else is derived from the value.
  const [server, setServer] = useState<{ name: string; check: NameCheck } | null>(null);
  const check: NameCheck = !local
    ? { state: "idle" }
    : !local.ok
      ? { state: "unavailable", reason: local.reason }
      : server?.name === local.name
        ? server.check
        : { state: "checking" };
  const format = local;

  const pending = local?.ok ? local.name : null;
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      let result: NameCheck;
      try {
        const response = await fetch(`/api/dashboard/names/check?name=${encodeURIComponent(pending)}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 429) result = { state: "unavailable", reason: "Too many checks. Wait a moment, then try again." };
        else if (!response.ok) throw new Error(String(response.status));
        else {
          const body = (await response.json()) as { status: string; name?: string; reason?: string };
          result =
            body.status === "available"
              ? { state: "available", name: body.name! }
              : body.status === "yours"
                ? { state: "yours", name: body.name! }
                : { state: "unavailable", reason: body.reason ?? "That name isn't available." };
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        result = { state: "error" };
      }
      setServer({ name: pending, check: result });
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [pending]);

  const checkKey = JSON.stringify(check);
  useEffect(() => {
    onCheck?.(JSON.parse(checkKey) as NameCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report changes of the derived result only
  }, [checkKey]);

  const ok = check.state === "available" || check.state === "yours";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 min-w-0 items-center rounded-xl border bg-tint/[0.03] pl-3.5 transition-colors focus-within:shadow-[0_0_0_3px_var(--accent-glow)]",
          check.state === "unavailable" ? "border-danger/60" : ok ? "border-accent/50" : "border-line-strong focus-within:border-accent/70",
        )}
      >
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, NAME_MAX))}
          placeholder="your-app"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={check.state === "unavailable"}
          aria-describedby={`${id}-status`}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14.5px] text-fg outline-none placeholder:text-fg-3"
          data-testid="name-input"
        />
        <span className="max-w-[55%] shrink-0 truncate pr-3.5 font-mono text-[13px] text-fg-3">.{previewDomain}</span>
      </div>
      <p id={`${id}-status`} aria-live="polite" className={cn("flex min-h-5 items-center gap-1.5 text-[12.5px]", check.state === "unavailable" ? "text-danger" : ok ? "text-accent-ink" : "text-fg-3")} data-testid="name-status">
        {check.state === "checking" ? (
          <>
            <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" /> Checking…
          </>
        ) : check.state === "available" ? (
          <>
            <Check className="size-3.5" aria-hidden="true" /> {check.name}.{previewDomain} is available
          </>
        ) : check.state === "yours" ? (
          <>
            <Check className="size-3.5" aria-hidden="true" /> Already yours
          </>
        ) : check.state === "unavailable" ? (
          <>
            <X className="size-3.5" aria-hidden="true" /> {check.reason}
          </>
        ) : check.state === "error" ? (
          "Couldn't check right now. You can still try to claim it."
        ) : format === null ? (
          "Lowercase letters, numbers and hyphens, 3–32 characters."
        ) : null}
      </p>
    </div>
  );
}
