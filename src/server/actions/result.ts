import "server-only";
import type { ZodError } from "zod";
import { ForbiddenError, NotFoundError } from "../errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

export const SESSION_EXPIRED: ActionResult<never> = { ok: false, error: "Your session has expired. Sign in again to continue." };

/** Maps known errors to safe messages; unexpected errors are logged server-side only. */
export function toActionError(error: unknown, context: string): ActionResult<never> {
  if (error instanceof NotFoundError) return { ok: false, error: "That project doesn't exist or you don't have access to it." };
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
  console.error(`[action:${context}]`, error instanceof Error ? error.message : "Unknown error");
  return { ok: false, error: "Something went wrong. Please try again." };
}
