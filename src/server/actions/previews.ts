"use server";

import { revalidatePath } from "next/cache";
import { ForbiddenError, NotFoundError } from "../errors";
import { type StopOutcome, stopPreview } from "../previews";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { type ActionResult, SESSION_EXPIRED } from "./result";

export async function stopPreviewAction(sessionId: string): Promise<ActionResult<StopOutcome>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`preview-stop:${session.user.id}`, 20, 60_000)).allowed) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  try {
    const outcome = await stopPreview(session.user.id, sessionId);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: outcome };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "That preview doesn't exist or you don't have access to it." };
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    console.error("[action:stopPreview]", error instanceof Error ? error.message : "Unknown error");
    return { ok: false, error: "Couldn't stop the preview. Please try again." };
  }
}
