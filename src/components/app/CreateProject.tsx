"use client";

import { useRouter } from "next/navigation";
import { createProjectAction } from "@/server/actions/projects";
import { ProjectForm } from "./ProjectForm";
import { useToast } from "./Toast";

export function CreateProject() {
  const router = useRouter();
  const toast = useToast();
  return (
    <ProjectForm
      autoFocus
      submitLabel="Create project"
      onCancel={() => router.push("/dashboard/projects")}
      onSubmit={async (values) => {
        const result = await createProjectAction(values);
        if (!result.ok) return result;
        toast.success("Project created.");
        router.push(`/dashboard/projects/${result.data.id}`);
        return { ok: true };
      }}
    />
  );
}
