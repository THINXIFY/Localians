"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ThemePreference } from "@/generated/prisma/enums";
import { profileSchema, themeSchema, workspaceSchema } from "@/lib/validation/settings";
import { auth } from "../auth";
import { getSession } from "../session";
import { revokeOtherSessions, revokeUserSession } from "../sessions";
import { setThemePreference } from "../users";
import { getCurrentWorkspace, updateWorkspace } from "../workspaces";
import { type ActionResult, fieldErrorsFrom, SESSION_EXPIRED, toActionError } from "./result";

export async function updateProfileAction(values: { name: string; image: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    // Through Better Auth so its session/cookie cache stays consistent.
    await auth.api.updateUser({ headers: await headers(), body: { name: parsed.data.name, image: parsed.data.image } });
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "updateProfile");
  }
}

export async function setThemeAction(value: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = themeSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "Unknown theme." };
  await setThemePreference(session.user.id, ThemePreference[parsed.data]);
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (sessionId === session.session.id) return { ok: false, error: "Use Sign out to end your current session." };
  const revoked = await revokeUserSession(session.user.id, sessionId);
  revalidatePath("/dashboard/settings/security");
  return revoked ? { ok: true, data: undefined } : { ok: false, error: "That session no longer exists." };
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const count = await revokeOtherSessions(session.user.id, session.session.id);
  revalidatePath("/dashboard/settings/security");
  return { ok: true, data: { count } };
}

export async function updateWorkspaceAction(values: { name: string; slug: string }): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const parsed = workspaceSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const workspace = await getCurrentWorkspace(session.user.id);
    const result = await updateWorkspace(session.user.id, workspace.id, parsed.data);
    if (!result.ok) return { ok: false, error: result.error, fieldErrors: { [result.field]: result.error } };
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error, "updateWorkspace");
  }
}
