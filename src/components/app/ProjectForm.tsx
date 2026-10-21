"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { FRAMEWORKS, projectInputSchema, type ProjectFormValues } from "@/lib/validation/project";
import { Field, FormError, Select, TextArea, TextInput } from "./Field";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const emptyProject: ProjectFormValues = { name: "", description: "", framework: "", defaultPort: "" };

export function ProjectForm({
  initialValues = emptyProject,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  initialValues?: ProjectFormValues;
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => Promise<Result>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues, unknown, ProjectFormValues>({
    // Validate with the shared schema but submit the raw form values; the server parses them again.
    resolver: async (values, context, options) => {
      const result = await zodResolver(projectInputSchema)(values, context, options);
      return Object.keys(result.errors).length ? { values: {}, errors: result.errors } : { values, errors: {} };
    },
    defaultValues: initialValues,
  });

  const framework = useWatch({ control, name: "framework" });
  const suggestedPort = FRAMEWORKS.find((f) => f.value === framework)?.port;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await onSubmit(values);
    if (!result.ok) {
      setFormError(result.error);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        if (field in emptyProject) setError(field as keyof ProjectFormValues, { message });
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormError message={formError} />
      <Field label="Project name" error={errors.name?.message}>
        {(p) => <TextInput {...p} {...register("name")} autoFocus={autoFocus} maxLength={80} placeholder="E-commerce Website" />}
      </Field>
      <Field label="Description" optional error={errors.description?.message}>
        {(p) => <TextArea {...p} {...register("description")} maxLength={500} placeholder="What is this app, and who will review it?" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Framework" optional error={errors.framework?.message}>
          {(p) => (
            <Select {...p} {...register("framework")}>
              <option value="">Not specified</option>
              {FRAMEWORKS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Default local port"
          optional
          error={errors.defaultPort?.message}
          hint={suggestedPort ? `Usually ${suggestedPort} for this framework.` : "Between 1 and 65535."}
        >
          {(p) => (
            <TextInput
              {...p}
              {...register("defaultPort")}
              inputMode="numeric"
              autoComplete="off"
              placeholder={suggestedPort ? String(suggestedPort) : "3000"}
              className="font-mono"
            />
          )}
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
