"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Field, FormError, FormNotice, PasswordInput, TextInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { loginSchema } from "@/lib/validation/auth";

type Values = z.infer<typeof loginSchema>;

export function LoginForm({ next, notice, initialError }: { next: string; notice?: string | null; initialError?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { error } = await authClient.signIn.email({ ...values, rememberMe: true, callbackURL: next });
    if (error) {
      setError(authErrorMessage(error, "We couldn't sign you in. Please try again."));
      return;
    }
    router.replace(next);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {notice ? <FormNotice>{notice}</FormNotice> : null}
      <FormError message={error} />
      <Field label="Email" error={errors.email?.message}>
        {(p) => <TextInput {...p} {...register("email")} type="email" autoComplete="email" inputMode="email" placeholder="you@company.com" />}
      </Field>
      <Field
        label="Password"
        error={errors.password?.message}
        hint={
          <Link href="/forgot-password" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
            Forgot your password?
          </Link>
        }
      >
        {(p) => <PasswordInput {...p} {...register("password")} autoComplete="current-password" />}
      </Field>
      <Button type="submit" size="lg" className="mt-1 w-full" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
