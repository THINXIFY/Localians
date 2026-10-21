"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Field, FormError, FormNotice, PasswordInput, PasswordStrength, TextInput } from "@/components/app/Field";
import { Button, buttonClasses } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { forgotPasswordSchema, PASSWORD_MIN, resetPasswordSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) {
      setError(authErrorMessage(error, "We couldn't send a reset link. Please try again."));
      return;
    }
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <FormNotice tone="success">
          If an account exists for <strong className="font-medium">{sentTo}</strong>, a password reset link is on its way. The link
          expires in 1 hour.
        </FormNotice>
        <Link href="/login" className="text-center text-[14px] text-fg-2 underline underline-offset-4 hover:text-fg">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label="Email" error={errors.email?.message}>
        {(p) => <TextInput {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setError(authErrorMessage(error, "We couldn't reset your password. Request a new link and try again."));
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormNotice tone="success">Your password has been updated and other sessions were signed out.</FormNotice>
        <Link href="/login" className={buttonClasses({ size: "lg", className: "w-full" })}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label="New password" error={errors.password?.message} hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}>
        {(p) => (
          <div>
            <PasswordInput {...p} {...register("password")} autoComplete="new-password" />
            <PasswordStrength value={password} />
          </div>
        )}
      </Field>
      <Field label="Confirm new password" error={errors.confirmPassword?.message}>
        {(p) => <PasswordInput {...p} {...register("confirmPassword")} autoComplete="new-password" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Update password
      </Button>
    </form>
  );
}

export function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="secondary"
        className="w-full"
        loading={state === "sending"}
        onClick={async () => {
          setState("sending");
          const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/verify-email?verified=1" });
          setState(error ? "error" : "sent");
        }}
      >
        Resend verification email
      </Button>
      <p role="status" className="min-h-5 text-[12.5px] text-fg-3">
        {state === "sent" ? "If this address needs verifying, a new link is on its way." : null}
        {state === "error" ? "Couldn't resend right now. Please wait a minute and try again." : null}
      </p>
    </div>
  );
}
