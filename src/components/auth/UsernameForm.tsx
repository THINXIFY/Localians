"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, TextInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { chooseUsernameAction } from "@/server/actions/username";

export function UsernameForm({ next }: { next: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const result = await chooseUsernameAction(value);
        setSaving(false);
        if (!result.ok) return setError(result.error);
        router.replace(next);
        router.refresh();
      }}
    >
      <FormError message={error} />
      <Field label="Username" hint="3–24 characters: lowercase letters, numbers and underscores, starting with a letter.">
        {(p) => <TextInput {...p} value={value} onChange={(e) => setValue(e.target.value.toLowerCase())} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="ada_l" />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={saving}>
        Continue
      </Button>
    </form>
  );
}
