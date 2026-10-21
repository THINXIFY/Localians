"use server";

import { revalidatePath } from "next/cache";
import { revokeCliCredential } from "../cli/credentials";
import { decideDeviceAuthorization, findPendingDeviceAuthorization } from "../cli/device";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { type ActionResult, SESSION_EXPIRED } from "./result";

export async function lookupDeviceCodeAction(code: string): Promise<ActionResult<{ userCode: string; clientName: string }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  // Codes are short: limit guesses per user.
  if (!(await rateLimit(`device-lookup:${session.user.id}`, 10, 60_000)).allowed) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  const request = await findPendingDeviceAuthorization(code);
  if (!request) return { ok: false, error: "That code is invalid or has expired. Run `localians login` again for a new one." };
  return { ok: true, data: { userCode: request.userCode, clientName: request.clientName } };
}

export async function decideDeviceAction(code: string, approve: boolean, workspaceId?: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`device-decide:${session.user.id}`, 10, 60_000)).allowed) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  if (workspaceId !== undefined && (typeof workspaceId !== "string" || workspaceId.length > 64)) return { ok: false, error: "Choose a workspace." };
  let ok: boolean;
  try {
    ok = await decideDeviceAuthorization(session.user.id, code, approve, workspaceId);
  } catch {
    return { ok: false, error: "You don't have access to that workspace." };
  }
  if (!ok) return { ok: false, error: "That code is invalid or has expired. Run `localians login` again for a new one." };
  revalidatePath("/dashboard/settings/cli");
  return { ok: true, data: undefined };
}

export async function revokeCliCredentialAction(credentialId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  const ok = await revokeCliCredential(session.user.id, credentialId);
  revalidatePath("/dashboard", "layout");
  return ok ? { ok: true, data: undefined } : { ok: false, error: "That CLI login no longer exists." };
}
