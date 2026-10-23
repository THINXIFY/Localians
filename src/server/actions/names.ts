"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "../errors";
import { claimName, NameError, releaseName } from "../preview-names";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { type ActionResult, SESSION_EXPIRED } from "./result";

function failure(error: unknown, context: string): ActionResult<never> {
  if (error instanceof NameError) return { ok: false, error: error.message, fieldErrors: { name: error.message } };
  if (error instanceof NotFoundError) return { ok: false, error: "That project doesn't exist or you don't have access to it." };
  console.error(`[action:${context}]`, error instanceof Error ? error.message : "Unknown error");
  return { ok: false, error: "Couldn't save. Please try again." };
}

/** Claims or changes the project's custom preview URL (Preview Pass). */
export async function claimNameAction(projectId: string, name: string): Promise<ActionResult<{ name: string }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`preview-name:${session.user.id}`, 10, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a minute and try again." };
  try {
    const row = await claimName(session.user.id, projectId, String(name ?? ""));
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { name: row.name } };
  } catch (error) {
    return failure(error, "claimName");
  }
}

/** Releases the project's custom URL (typed confirmation). Its live preview stops; the name is quarantined. */
export async function releaseNameAction(projectId: string, confirm: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`preview-name:${session.user.id}`, 10, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a minute and try again." };
  try {
    await releaseName(session.user.id, projectId, String(confirm ?? ""));
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "releaseName");
  }
}
