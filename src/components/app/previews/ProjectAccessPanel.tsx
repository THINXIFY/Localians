"use client";

import { Globe, Lock, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { signOutVisitorsAction, updateAccessAction } from "@/server/actions/access";
import { Field, FormError, PasswordInput, Select } from "../Field";
import { useToast } from "../Toast";

const DURATIONS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 480, label: "8 hours" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 10080, label: "7 days" },
];

type Access = { mode: "PUBLIC" | "PASSWORD"; ttlMinutes: number; hasPassword: boolean };

/**
 * Preview access for a project: public, or password protected. Applies to every preview of the
 * project, including ones already live (the gateway is updated immediately).
 */
export function ProjectAccessPanel({ projectId, initial, livePreviews }: { projectId: string; initial: Access; livePreviews: number }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState(initial.mode);
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState(initial.ttlMinutes);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const needsPassword = mode === "PASSWORD" && !initial.hasPassword;
  const dirty = mode !== initial.mode || ttl !== initial.ttlMinutes || password.length > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    if (mode === "PASSWORD" && (needsPassword || password) && password.length < 8) {
      setFieldError("Use at least 8 characters.");
      return;
    }
    setSaving(true);
    const result = await updateAccessAction(projectId, { mode, ttlMinutes: ttl, ...(mode === "PASSWORD" && password ? { password } : {}) });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      setFieldError(result.fieldErrors?.password);
      return;
    }
    setPassword("");
    const live = result.data.previews ? ` Applied to ${result.data.previews} live preview${result.data.previews === 1 ? "" : "s"}.` : "";
    toast.success(mode === "PASSWORD" ? `Password protection saved.${live}` : `Previews are public.${live}`);
    router.refresh();
  }

  async function signOut() {
    setSigningOut(true);
    const result = await signOutVisitorsAction(projectId);
    setSigningOut(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("All visitors were signed out. They need the password again.");
    router.refresh();
  }

  return (
    <section id="access" aria-labelledby="access-title" className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-card">
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4 sm:px-6">
        <h2 id="access-title" className="text-[15px] font-semibold text-fg">
          Preview access
        </h2>
        <p className="text-[13px] leading-relaxed text-fg-2">
          Applies to every preview link of this project{livePreviews ? `, including the ${livePreviews} live now` : ""}. Changes take effect immediately.
        </p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-5 px-5 py-5 sm:px-6">
        <div role="radiogroup" aria-label="Who can open previews" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "PUBLIC", icon: Globe, title: "Public", body: "Anyone with the link can open it." },
              { value: "PASSWORD", icon: Lock, title: "Password protected", body: "Visitors enter a password first." },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                mode === o.value ? "border-accent/40 bg-accent/[0.05]" : "border-line hover:border-line-strong",
              )}
            >
              <input type="radio" name="access-mode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="sr-only" />
              <o.icon className={cn("mt-0.5 size-4 shrink-0", mode === o.value ? "text-accent-ink" : "text-fg-3")} aria-hidden="true" />
              <span>
                <span className="block text-[14px] font-medium text-fg">{o.title}</span>
                <span className="block text-[12.5px] text-fg-3">{o.body}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "PASSWORD" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={initial.hasPassword ? "New password" : "Password"}
              optional={initial.hasPassword}
              error={fieldError}
              hint={initial.hasPassword ? "Leave empty to keep the current password." : "At least 8 characters. Share it with your client separately."}
            >
              {(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" maxLength={128} />}
            </Field>
            <Field label="Visitors stay signed in for" hint="After that they enter the password again.">
              {(p) => (
                <Select {...p} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : (
          <p className="rounded-xl border border-warn/25 bg-warn/[0.05] px-4 py-3 text-[13px] leading-relaxed text-fg-2">
            Public previews can be opened by anyone with the link. Enable password protection to restrict access.
          </p>
        )}

        <FormError message={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {initial.mode === "PASSWORD" ? (
            <Button variant="secondary" size="sm" onClick={signOut} loading={signingOut} disabled={saving}>
              {signingOut ? null : <LogOut className="size-3.5" aria-hidden="true" />}
              Sign out all visitors
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" loading={saving} disabled={!dirty || signingOut}>
            Save access
          </Button>
        </div>
      </form>
    </section>
  );
}
