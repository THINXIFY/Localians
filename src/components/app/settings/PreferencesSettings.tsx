"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { setThemeAction } from "@/server/actions/settings";
import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";

const OPTIONS = [
  { value: "DARK", label: "Dark", icon: Moon, hint: "The Localians default" },
  { value: "LIGHT", label: "Light", icon: Sun, hint: "Bright surfaces" },
  { value: "SYSTEM", label: "System", icon: Monitor, hint: "Match your OS" },
] as const;

export function ThemePicker({ current }: { current: "DARK" | "LIGHT" | "SYSTEM" }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState(current);
  const [pending, startTransition] = useTransition();

  function choose(value: (typeof OPTIONS)[number]["value"]) {
    if (value === selected) return;
    const previous = selected;
    setSelected(value);
    // Apply immediately to the page; the saved preference is rendered server-side on every load.
    document.querySelector(".theme-scope")?.setAttribute("data-theme", value.toLowerCase());
    startTransition(async () => {
      const result = await setThemeAction(value);
      if (!result.ok) {
        setSelected(previous);
        document.querySelector(".theme-scope")?.setAttribute("data-theme", previous.toLowerCase());
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <SettingsPanel title="Theme" description="Choose how the dashboard looks. Saved to your account.">
      <fieldset aria-busy={pending}>
        <legend className="sr-only">Theme</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const active = selected === o.value;
            return (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  active ? "border-accent/50 bg-accent/[0.06]" : "border-line-strong hover:bg-tint/[0.03]",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  value={o.value}
                  checked={active}
                  onChange={() => choose(o.value)}
                  className="sr-only"
                />
                <o.icon className={cn("size-5", active ? "text-accent-ink" : "text-fg-3")} aria-hidden="true" />
                <span>
                  <span className="block text-[14px] font-medium text-fg">{o.label}</span>
                  <span className="block text-[12.5px] text-fg-3">{o.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </SettingsPanel>
  );
}
