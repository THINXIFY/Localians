"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { type AccessInput, AccessError, signOutVisitors, updateProjectAccess } from "../access";
import { ForbiddenError, NotFoundError } from "../errors";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { type ActionResult, fieldErrorsFrom, SESSION_EXPIRED } from "./result";

type Applied = { previews: number; pushed: number };

function failure(error: unknown, context: string): ActionResult<never> {
  if (error instanceof ZodError) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(error) };
  if (error instanceof AccessError) return { ok: false, error: error.message, fieldErrors: { password: error.message } };
  if (error instanceof NotFoundError) return { ok: false, error: "That project doesn't exist or you don't have access to it." };
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  console.error(`[action:${context}]`, error instanceof Error ? error.message : "Unknown error");
  return { ok: false, error: "Couldn't save. Please try again." };
}

export async function updateAccessAction(projectId: string, input: AccessInput): Promise<ActionResult<Applied>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`project-access:${session.user.id}`, 20, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a minute and try again." };
  try {
    const applied = await updateProjectAccess(session.user.id, projectId, input);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: applied };
  } catch (error) {
    return failure(error, "updateAccess");
  }
}

export async function signOutVisitorsAction(projectId: string): Promise<ActionResult<Applied>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`project-access:${session.user.id}`, 20, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a minute and try again." };
  try {
    const applied = await signOutVisitors(session.user.id, projectId);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: applied };
  } catch (error) {
    return failure(error, "signOutVisitors");
  }
}
