"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, PasswordInput, TextInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { adminSignInAction } from "@/server/actions/admin";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const result = await adminSignInAction({ email, password }).catch(() => ({ ok: false as const, error: "Couldn't sign in. Try again." }));
        setBusy(false);
        if (!result.ok) {
          setPassword("");
          return setError(result.error);
        }
        router.replace("/admin");
        router.refresh();
      }}
    >
      <FormError message={error} />
      <Field label="Email">{(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />}</Field>
      <Field label="Password">{(p) => <PasswordInput {...p} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}</Field>
      <Button type="submit" size="lg" className="mt-1 w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}
