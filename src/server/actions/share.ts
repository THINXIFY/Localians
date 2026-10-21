"use server";

import { ZodError } from "zod";
import { NotFoundError } from "../errors";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { type SetupInput, SetupError, updateShareSetup } from "../share-setup";
import { type ActionResult, fieldErrorsFrom, SESSION_EXPIRED } from "./result";

/** Saves the Share App wizard's project and protection choices for its setup code. */
export async function saveShareSetupAction(setupId: string, input: SetupInput): Promise<ActionResult<{ passwordSaved: boolean }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`share-setup:${session.user.id}`, 120, 60_000)).allowed) return { ok: false, error: "Too many changes. Wait a moment and try again." };
  try {
    return { ok: true, data: await updateShareSetup(session.user.id, setupId, input) };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(error) };
    if (error instanceof SetupError) return { ok: false, error: error.message };
    if (error instanceof NotFoundError) return { ok: false, error: "That project doesn't exist or you don't have access to it." };
    console.error("[action:saveShareSetup]", error instanceof Error ? error.message : "Unknown error");
    return { ok: false, error: "Couldn't save. Please try again." };
  }
}
