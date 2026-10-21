"use server";

import { revalidatePath } from "next/cache";
import { projectInputSchema, type ProjectFormValues } from "@/lib/validation/project";
import { workspaceSchema } from "@/lib/validation/settings";
import { createProject } from "../projects";
import { getSession } from "../session";
import { completeOnboarding } from "../users";
import { getCurrentWorkspace, updateWorkspace } from "../workspaces";
import { type ActionResult, fieldErrorsFrom, SESSION_EXPIRED, toActionError } from "./result";

export async function finishOnboardingAction(input: {
  workspaceName: string;
  project: ProjectFormValues | null;
}): Promise<ActionResult<{ projectId: string | null }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;

  try {
    const workspace = await getCurrentWorkspace(session.user.id);

    const name = input.workspaceName.trim();
    if (name !== workspace.name) {
      // Renaming keeps the existing workspace slug; it can be changed later in settings.
      const parsed = workspaceSchema.safeParse({ name, slug: workspace.slug });
      if (!parsed.success) {
        return { ok: false, error: "Check the workspace name.", fieldErrors: { workspaceName: fieldErrorsFrom(parsed.error).name ?? "Invalid name." } };
      }
      const result = await updateWorkspace(session.user.id, workspace.id, parsed.data);
      if (!result.ok) return { ok: false, error: result.error };
    }

    let projectId: string | null = null;
    if (input.project) {
      const parsed = projectInputSchema.safeParse(input.project);
      if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
      projectId = (await createProject(session.user.id, parsed.data)).id;
    }

    await completeOnboarding(session.user.id);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { projectId } };
  } catch (error) {
    return toActionError(error, "finishOnboarding");
  }
}
