"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { workspaceSchema } from "@/lib/validation/settings";
import { updateWorkspaceAction } from "@/server/actions/settings";
import { Field, FormError, TextInput } from "../Field";
import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";

type Values = z.input<typeof workspaceSchema>;

export function WorkspaceForm({ name, slug, canEdit }: { name: string; slug: string; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({ resolver: zodResolver(workspaceSchema), defaultValues: { name, slug } });

  const submit = handleSubmit(async (values) => {
    setError(null);
    const result = await updateWorkspaceAction(values);
    if (!result.ok) {
      setError(result.error);
      for (const [k, m] of Object.entries(result.fieldErrors ?? {})) if (k === "name" || k === "slug") setFieldError(k, { message: m });
      return;
    }
    reset(values);
    toast.success("Workspace updated.");
    router.refresh();
  });

  return (
    <form onSubmit={submit} noValidate>
      <SettingsPanel
        title="Workspace"
        description={canEdit ? "Rename your workspace or change its URL identifier." : "Only the workspace owner can change these settings."}
        footer={
          canEdit ? (
            <>
              <p className="text-[12.5px] text-fg-3">The slug identifies your workspace in future URLs.</p>
              <Button type="submit" size="sm" loading={isSubmitting} disabled={!isDirty}>
                Save changes
              </Button>
            </>
          ) : undefined
        }
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <FormError message={error} />
          <Field label="Workspace name" error={errors.name?.message}>
            {(p) => <TextInput {...p} {...register("name")} maxLength={60} />}
          </Field>
          <Field label="Workspace slug" error={errors.slug?.message} hint="Lowercase letters, numbers and hyphens.">
            {(p) => <TextInput {...p} {...register("slug")} maxLength={48} autoComplete="off" spellCheck={false} className="font-mono" />}
          </Field>
        </fieldset>
      </SettingsPanel>
    </form>
  );
}
