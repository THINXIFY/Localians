"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Field, FormError, PasswordInput, PasswordStrength, TextInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MIN, signupSchema } from "@/lib/validation/auth";

type Values = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", username: "", email: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control, name: "password" });

  const onSubmit = handleSubmit(async ({ name, username, email, password }) => {
    setError(null);
    // username is an additional field of the user (validated and checked for uniqueness on the server).
    const { error } = await authClient.signUp.email({ name, email, password, username, callbackURL: "/verify-email?verified=1" } as Parameters<typeof authClient.signUp.email>[0]);
    if (error) {
      setError(authErrorMessage(error, "We couldn't create your account. Please try again."));
      return;
    }
    // Same outcome whether or not the email already had an account (prevents enumeration).
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={error} />
      <Field label="Full name" error={errors.name?.message}>
        {(p) => <TextInput {...p} {...register("name")} autoComplete="name" placeholder="Ada Lovelace" />}
      </Field>
      <Field label="Username" error={errors.username?.message} hint="Lowercase letters, numbers and underscores. Shown to support, not on your previews.">
        {(p) => <TextInput {...p} {...register("username")} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ada_l" />}
      </Field>
      <Field label="Email" error={errors.email?.message}>
        {(p) => <TextInput {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" />}
      </Field>
      <Field label="Password" error={errors.password?.message} hint={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}>
        {(p) => (
          <div>
            <PasswordInput {...p} {...register("password")} autoComplete="new-password" />
            <PasswordStrength value={password} />
          </div>
        )}
      </Field>
      <Field label="Confirm password" error={errors.confirmPassword?.message}>
        {(p) => <PasswordInput {...p} {...register("confirmPassword")} autoComplete="new-password" />}
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" loading={isSubmitting}>
        Create account
      </Button>
      <p className="text-center text-[12.5px] leading-relaxed text-fg-3">
        By creating an account you agree to our{" "}
        <a href="/terms" className="underline underline-offset-4 hover:text-fg">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-4 hover:text-fg">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
