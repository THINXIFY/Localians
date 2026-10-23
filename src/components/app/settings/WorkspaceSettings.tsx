"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { workspaceSchema } from "@/lib/validation/settings";
import { removeWorkspaceAvatarAction, updateWorkspaceAction, uploadWorkspaceAvatarAction } from "@/server/actions/settings";
import { Field, FormError, TextInput } from "../Field";
import { SettingsPanel } from "../Primitives";
import { useToast } from "../Toast";
import { WorkspaceAvatar } from "../WorkspaceAvatar";

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

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FAILED = { ok: false as const, error: "Couldn't reach Localians. Check your connection and try again." };

/** Workspace avatar: choose an image, preview it, save; or remove it to go back to the generated initial. */
export function WorkspaceAvatarForm({ name, avatarUrl, canEdit }: { name: string; avatarUrl: string | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function clear() {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  }
  function choose(f: File | null) {
    setError(null);
    if (!f) return;
    if (!AVATAR_TYPES.includes(f.type)) return setError("Choose a PNG, JPEG or WebP image.");
    if (f.size > 2 * 1024 * 1024) return setError("Images can be up to 2 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }
  async function save() {
    if (!file) return;
    setBusy("save");
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadWorkspaceAvatarAction(form).catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    clear();
    toast.success("Workspace image updated.");
    router.refresh();
  }
  async function remove() {
    setBusy("remove");
    setError(null);
    const result = await removeWorkspaceAvatarAction().catch(() => FAILED);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    toast.success("Workspace image removed.");
    router.refresh();
  }

  return (
    <SettingsPanel title="Workspace image" description={canEdit ? "Shown next to your workspace name in the dashboard." : "Only the workspace owner can change the workspace image."}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5" data-testid="workspace-avatar-form">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file (blob URL)
          <img src={preview} alt="Preview of the new workspace image" className="size-16 shrink-0 rounded-xl border border-accent/40 object-cover" data-testid="workspace-avatar-preview" />
        ) : (
          <WorkspaceAvatar name={name} url={avatarUrl} size={64} className="rounded-xl" />
        )}
        <div className="flex min-w-0 flex-col gap-2">
          {canEdit ? (
            <>
              <input ref={input} id="workspace-avatar-file" type="file" accept={AVATAR_TYPES.join(",")} className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} data-testid="workspace-avatar-file" />
              <div className="flex flex-wrap gap-2">
                {preview ? (
                  <>
                    <Button size="sm" loading={busy === "save"} disabled={busy !== null} onClick={save}>
                      Save image
                    </Button>
                    <Button variant="secondary" size="sm" disabled={busy !== null} onClick={clear}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <label
                      htmlFor="workspace-avatar-file"
                      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-tint/[0.04] px-4 text-[13.5px] font-medium text-fg transition-colors hover:border-tint/25 hover:bg-tint/[0.08] has-[:focus-visible]:shadow-[0_0_0_3px_var(--accent-glow)]"
                    >
                      <ImageUp className="size-4" aria-hidden="true" />
                      {avatarUrl ? "Replace image" : "Upload image"}
                    </label>
                    {avatarUrl ? (
                      <Button variant="ghost" size="sm" loading={busy === "remove"} disabled={busy !== null} onClick={remove}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        Remove
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
              <p className="text-[12px] text-fg-3">PNG, JPEG or WebP, up to 2 MB. Cropped to a square.</p>
            </>
          ) : null}
          <FormError message={error} />
        </div>
      </div>
    </SettingsPanel>
  );
}
