"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { emailSchema } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/settings";
import { updateProfileAction } from "@/server/actions/settings";
import { Avatar } from "../Avatar";
import { Field, FormError, FormNotice, TextInput } from "../Field";
import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";

type ProfileValues = z.input<typeof profileSchema>;

export function ProfileForm({ name, image }: { name: string; image: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues, unknown, ProfileValues>({
    resolver: async (values, ctx, opts) => {
      const r = await zodResolver(profileSchema)(values, ctx, opts);
      return Object.keys(r.errors).length ? { values: {}, errors: r.errors } : { values, errors: {} };
    },
    defaultValues: { name, image: image ?? "" },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    const result = await updateProfileAction({ name: values.name, image: values.image });
    if (!result.ok) {
      setError(result.error);
      for (const [k, m] of Object.entries(result.fieldErrors ?? {})) if (k === "name" || k === "image") setFieldError(k, { message: m });
      return;
    }
    reset(values);
    toast.success("Profile saved.");
    router.refresh();
  });

  const preview = useWatch({ control, name: "image" });
  const currentName = useWatch({ control, name: "name" });
  return (
    <form onSubmit={submit} noValidate>
      <SettingsPanel
        title="Profile"
        description="How you appear across Localians."
        footer={
          <>
            <p className="text-[12.5px] text-fg-3">Avatars use an https:// image URL. Uploads are coming later.</p>
            <Button type="submit" size="sm" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormError message={error} />
          <div className="flex items-center gap-4">
            <Avatar name={currentName || name} image={/^https:\/\//.test(preview) ? preview : null} size={56} />
            <p className="text-[13px] text-fg-3">Shown in the dashboard and to future teammates.</p>
          </div>
          <Field label="Display name" error={errors.name?.message}>
            {(p) => <TextInput {...p} {...register("name")} autoComplete="name" maxLength={80} />}
          </Field>
          <Field label="Avatar URL" optional error={errors.image?.message}>
            {(p) => <TextInput {...p} {...register("image")} type="url" inputMode="url" placeholder="https://…" />}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  );
}

const changeEmailSchema = z.object({ newEmail: emailSchema });

export function EmailForm({ email, verified }: { email: string; verified: boolean }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof changeEmailSchema>>({ resolver: zodResolver(changeEmailSchema), defaultValues: { newEmail: "" } });

  const submit = handleSubmit(async ({ newEmail }) => {
    setError(null);
    if (newEmail.toLowerCase() === email.toLowerCase()) {
      setFieldError("newEmail", { message: "That's already your email address." });
      return;
    }
    const { error } = await authClient.changeEmail({ newEmail, callbackURL: "/dashboard/settings/profile?email=updated" });
    if (error) {
      setError(authErrorMessage(error, "We couldn't start the email change. Please try again."));
      return;
    }
    setSent(newEmail);
  });

  return (
    <form onSubmit={submit} noValidate>
      <SettingsPanel
        title="Email address"
        description={
          <>
            Currently <strong className="font-medium text-fg">{email}</strong>
            {verified ? " · verified" : " · not verified"}.
          </>
        }
        footer={
          <>
            <p className="text-[12.5px] text-fg-3">Changes must be approved from your current inbox, then the new address verified.</p>
            <Button type="submit" size="sm" variant="secondary" loading={isSubmitting}>
              Change email
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormError message={error} />
          {sent ? (
            <FormNotice tone="success">
              Check <strong className="font-medium">{email}</strong> to approve the change to <strong className="font-medium">{sent}</strong>.
            </FormNotice>
          ) : null}
          <Field label="New email address" error={errors.newEmail?.message}>
            {(p) => <TextInput {...p} {...register("newEmail")} type="email" autoComplete="email" inputMode="email" />}
          </Field>
        </div>
      </SettingsPanel>
    </form>
  );
}
