import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./db";

/** Server-validated session for the current request (null when signed out or expired). */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

function hasSessionCookie(cookieHeader: string | null) {
  return !!cookieHeader && /(?:^|;\s*)(?:__Secure-|__Host-)?localians\.session_token=/.test(cookieHeader);
}

/**
 * Requires a signed-in user for a page. Redirects to /login (keeping the
 * destination) and tells the user when an existing session has expired.
 */
export async function requireUser(fallbackPath = "/dashboard") {
  const session = await getSession();
  if (!session) {
    const h = await headers();
    const requested = h.get("x-localians-path");
    const nextPath = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : fallbackPath;
    const params = new URLSearchParams({ next: nextPath });
    if (hasSessionCookie(h.get("cookie"))) params.set("reason", "expired");
    redirect(`/login?${params.toString()}`);
  }
  return session;
}

/** Profile fields Localians manages itself (not part of the Better Auth session). */
export const getUserProfile = cache(async (userId: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, emailVerified: true, themePreference: true, onboardedAt: true, createdAt: true },
  }),
);
