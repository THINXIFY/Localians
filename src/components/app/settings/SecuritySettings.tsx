"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogOut, Monitor } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MIN, changePasswordSchema } from "@/lib/validation/auth";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/actions/settings";
import { Field, FormError, PasswordInput, PasswordStrength } from "../Field";

import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "", revokeOtherSessions: true },
  });

  const newPassword = useWatch({ control, name: "newPassword" });

  if (!hasPassword) {
    return (
      <SettingsPanel title="Password" description="Your account signs in with GitHub and has no password.">
        <p className="text-[13.5px] text-fg-2">
          To add one, use{" "}
          <Link href="/forgot-password" className="text-fg underline underline-offset-4">
            reset password
          </Link>{" "}
          with your account email.
        </p>
      </SettingsPanel>
    );
  }

  const submit = handleSubmit(async ({ currentPassword, newPassword, revokeOtherSessions }) => {
    setError(null);
    // Re-authenticates with the current password before the change is applied.
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions });
    if (error) {
      setError(authErrorMessage(error, "We couldn't change your password. Please try again."));
      return;
    }
    reset();
    toast.success(revokeOtherSessions ? "Password changed. Other sessions were signed out." : "Password changed.");
    router.refresh();
  });

  return (
    <form onSubmit={submit} noValidate>
      <SettingsPanel
        title="Change password"
        description="You'll need your current password."
        footer={
          <>
            <label className="flex items-center gap-2.5 text-[13px] text-fg-2">
              <input type="checkbox" {...register("revokeOtherSessions")} className="size-4 accent-[var(--accent)]" />
              Sign out of other devices
            </label>
            <Button type="submit" size="sm" loading={isSubmitting}>
              Update password
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormError message={error} />
          <Field label="Current password" error={errors.currentPassword?.message}>
            {(p) => <PasswordInput {...p} {...register("currentPassword")} autoComplete="current-password" />}
          </Field>
          <Field label="New password" error={errors.newPassword?.message} hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}>
            {(p) => (
              <div>
                <PasswordInput {...p} {...register("newPassword")} autoComplete="new-password" />
                <PasswordStrength value={newPassword} />
              </div>
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword?.message}>
            {(p) => <PasswordInput {...p} {...register("confirmPassword")} autoComplete="new-password" />}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  );
}

type SessionRow = { id: string; device: string; ipAddress: string | null; lastActive: string; current: boolean };

export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  async function revoke(id: string) {
    setPending(id);
    const result = await revokeSessionAction(id);
    setPending(null);
    if (!result.ok) return toast.error(result.error);
    toast.success("Session signed out.");
    router.refresh();
  }

  async function revokeAll() {
    setPending("all");
    const result = await revokeOtherSessionsAction();
    setPending(null);
    if (!result.ok) return toast.error(result.error);
    toast.success(`Signed out of ${result.data.count} other session${result.data.count === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <SettingsPanel
      title="Active sessions"
      description="Devices currently signed in to your account."
      footer={
        <>
          <p className="text-[12.5px] text-fg-3">Sign out anywhere you don&apos;t recognise.</p>
          <Button variant="secondary" size="sm" onClick={revokeAll} loading={pending === "all"} disabled={!others}>
            Sign out other sessions
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line rounded-xl border border-line">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <Monitor className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-fg">
                {s.device}
                {s.current ? (
                  <span className="rounded-full border border-accent/30 bg-accent/[0.08] px-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-accent-ink">
                    This device
                  </span>
                ) : null}
              </p>
              <p className="truncate text-[12px] text-fg-3">
                {s.ipAddress ? `${s.ipAddress} · ` : ""}Active {s.lastActive}
              </p>
            </div>
            {s.current ? null : (
              <Button variant="ghost" size="sm" onClick={() => revoke(s.id)} loading={pending === s.id} aria-label={`Sign out ${s.device}`}>
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsPanel>
  );
}

export function ProvidersPanel({
  githubConfigured,
  githubAccountId,
  canUnlink,
}: {
  githubConfigured: boolean;
  /** Account row id of the linked GitHub identity, if any. */
  githubAccountId: string | null;
  canUnlink: boolean;
}) {
  const githubLinked = githubAccountId !== null;
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <SettingsPanel title="Connected sign-in methods" description="Ways you can sign in to Localians.">
      <ul className="divide-y divide-line rounded-xl border border-line">
        <li className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[13.5px] font-medium text-fg">GitHub</p>
            <p className="text-[12px] text-fg-3">
              {githubLinked ? "Connected" : githubConfigured ? "Not connected" : "Not available on this server"}
            </p>
          </div>
          {githubLinked ? (
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              disabled={!canUnlink}
              title={canUnlink ? undefined : "Add a password before disconnecting your only sign-in method."}
              onClick={async () => {
                setPending(true);
                const { error } = await authClient.unlinkAccount({ accountId: githubAccountId! });
                setPending(false);
                if (error) return toast.error(authErrorMessage(error, "Couldn't disconnect GitHub."));
                toast.success("GitHub disconnected.");
                router.refresh();
              }}
            >
              Disconnect
            </Button>
          ) : githubConfigured ? (
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const { error } = await authClient.linkSocial({ provider: "github", callbackURL: "/dashboard/settings/security" });
                if (error) {
                  setPending(false);
                  toast.error(authErrorMessage(error, "Couldn't connect GitHub."));
                }
              }}
            >
              Connect
            </Button>
          ) : null}
        </li>
      </ul>
    </SettingsPanel>
  );
}

export function SignOutPanel() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <SettingsPanel title="Sign out" description="End your session on this device.">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={async () => {
          setPending(true);
          await authClient.signOut();
          router.replace("/login?reason=signed-out");
          router.refresh();
        }}
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Sign out
      </Button>
    </SettingsPanel>
  );
}
