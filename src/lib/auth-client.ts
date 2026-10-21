import { createAuthClient } from "better-auth/react";

/** Browser auth client. Talks to /api/auth on the same origin with httpOnly cookies — no tokens in JS storage. */
export const authClient = createAuthClient();

/** Maps Better Auth error codes/statuses to user-facing messages that don't leak account details. */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password combination is incorrect.";
    case "EMAIL_NOT_VERIFIED":
      return "Please verify your email first. We've sent you a new verification link.";
    case "PASSWORD_TOO_SHORT":
      return "That password is too short.";
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    case "INVALID_TOKEN":
      return "This link is invalid or has expired. Request a new one.";
    case "INVALID_PASSWORD":
      return "Your current password is incorrect.";
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "This account signs in with GitHub and has no password yet.";
    default:
      return fallback;
  }
}

/** Messages for `?error=` codes Better Auth appends on OAuth / verification redirects. */
export function callbackErrorMessage(code: string | undefined | null) {
  if (!code) return null;
  const normalized = code.toLowerCase();
  if (normalized.includes("account_not_linked") || normalized.includes("unable_to_link")) {
    return "An account with this email already exists. Sign in with your password first, then connect GitHub from Settings → Security.";
  }
  if (normalized.includes("email_not_found") || normalized.includes("email_doesn't_match")) {
    return "GitHub didn't share a verified email address. Add a verified email on GitHub and try again.";
  }
  if (normalized.includes("access_denied")) return "GitHub sign-in was cancelled.";
  if (normalized.includes("state") || normalized.includes("invalid_code")) return "The sign-in attempt expired or was interrupted. Please try again.";
  if (normalized.includes("token_expired") || normalized.includes("invalid_token")) return "This link is invalid or has expired. Request a new one.";
  return "Sign-in failed. Please try again.";
}
