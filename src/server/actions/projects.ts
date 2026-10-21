"use server";

import { revalidatePath } from "next/cache";
import { projectInputSchema, type ProjectFormValues } from "@/lib/validation/project";
import * as projects from "../projects";
import { getSession } from "../session";
import { type ActionResult, fieldErrorsFrom, SESSION_EXPIRED, toActionError } from "./result";

function refresh(projectId?: string) {
  revalidatePath("/dashboard", "layout");
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function createProjectAction(values: ProjectFormValues): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = projectInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const project = await projects.createProject(session.user.id, parsed.data);
    refresh();
    return { ok: true, data: { id: project.id } };
  } catch (error) {
    return toActionError(error, "createProject");
  }
}

export async function updateProjectAction(projectId: string, values: ProjectFormValues): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = projectInputSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    await projects.updateProject(session.user.id, projectId, parsed.data);
    refresh(projectId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "updateProject");
  }
}

export async function archiveProjectAction(projectId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  try {
    await projects.archiveProject(session.user.id, projectId);
    refresh(projectId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "archiveProject");
  }
}

export async function restoreProjectAction(projectId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  try {
    await projects.restoreProject(session.user.id, projectId);
    refresh(projectId);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "restoreProject");
  }
}

/** `confirmName` must match the project name exactly — guards against accidental deletes. */
export async function deleteProjectAction(projectId: string, confirmName: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  try {
    const project = await projects.getProjectForUser(session.user.id, projectId);
    if (confirmName.trim() !== project.name) return { ok: false, error: "Type the project name exactly to confirm deletion." };
    await projects.deleteProject(session.user.id, projectId);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "deleteProject");
  }
}
