"use server";

import { ZodError } from "zod";
import { usernameSchema } from "@/lib/validation/username";
import { rateLimit } from "../rate-limit";
import { getSession } from "../session";
import { setUsername, UsernameError } from "../users";
import { type ActionResult, SESSION_EXPIRED } from "./result";

export async function chooseUsernameAction(raw: string): Promise<ActionResult<{ username: string }>> {
  const session = await getSession();
  if (!session) return SESSION_EXPIRED;
  if (!(await rateLimit(`username:${session.user.id}`, 20, 60_000)).allowed) return { ok: false, error: "Too many attempts. Wait a minute." };
  try {
    const username = usernameSchema.parse(raw);
    await setUsername(session.user.id, username);
    return { ok: true, data: { username } };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Choose another username.", fieldErrors: { username: error.issues[0]?.message ?? "" } };
    if (error instanceof UsernameError) return { ok: false, error: error.message, fieldErrors: { username: error.message } };
    console.error("[action:chooseUsername]", error instanceof Error ? error.message : "Unknown error");
    return { ok: false, error: "Couldn't save. Please try again." };
  }
}
