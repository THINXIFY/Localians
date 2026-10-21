"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ProjectFormValues } from "@/lib/validation/project";
import { finishOnboardingAction } from "@/server/actions/onboarding";
import { Field, FormError, TextInput } from "./Field";
import { ProjectForm } from "./ProjectForm";
import { useToast } from "./Toast";

export function OnboardingFlow({ firstName, workspaceName }: { firstName: string; workspaceName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(workspaceName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [withProject, setWithProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function finish(project: ProjectFormValues | null) {
    setError(null);
    setNameError(null);
    if (!name.trim()) {
      setNameError("Enter a workspace name.");
      return { ok: false as const, error: "Enter a workspace name." };
    }
    setPending(true);
    const result = await finishOnboardingAction({ workspaceName: name, project });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      if (result.fieldErrors?.workspaceName) setNameError(result.fieldErrors.workspaceName);
      return result;
    }
    toast.success("Your workspace is ready.");
    router.replace(result.data.projectId ? `/dashboard/projects/${result.data.projectId}` : "/dashboard");
    router.refresh();
    return { ok: true as const };
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-accent-ink">Hi {firstName}</p>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.035em] text-fg">Welcome to Localians.</h1>
        <p className="mt-2 text-[16px] text-fg-2">Let&apos;s get your workspace ready.</p>
      </div>

      <section aria-labelledby="ws-step" className="rounded-[18px] border border-line bg-card p-6">
        <h2 id="ws-step" className="flex items-center gap-2.5 text-[15px] font-semibold text-fg">
          <span className="flex size-6 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] text-fg-2">1</span>
          Confirm your workspace name
        </h2>
        <div className="mt-4">
          <Field label="Workspace name" error={nameError ?? undefined}>
            {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}
          </Field>
        </div>
      </section>

      <section aria-labelledby="project-step" className="rounded-[18px] border border-line bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="project-step" className="flex items-center gap-2.5 text-[15px] font-semibold text-fg">
            <span className="flex size-6 items-center justify-center rounded-full border border-line-strong font-mono text-[11px] text-fg-2">2</span>
            Create your first project
            <span className="text-[12px] font-normal text-fg-3">Optional</span>
          </h2>
        </div>
        {withProject ? (
          <div className="mt-5">
            <ProjectForm autoFocus submitLabel="Create project & continue" onCancel={() => setWithProject(false)} onSubmit={(values) => finish(values)} />
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-start gap-3">
            <p className="text-[14px] text-fg-2">Add the app you&apos;re working on now, or skip and do it later.</p>
            <Button variant="secondary" size="sm" onClick={() => setWithProject(true)}>
              <FolderPlus className="size-4" aria-hidden="true" />
              Add a project
            </Button>
          </div>
        )}
      </section>

      <FormError message={error} />

      {!withProject ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button size="lg" loading={pending} onClick={() => finish(null)}>
            Continue to dashboard
          </Button>
        </div>
      ) : null}
    </div>
  );
}
