import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { authCookiePrefix } from "@/lib/auth-cookies";

/**
 * Optimistic gate only: bounces requests that carry no session cookie at all.
 * Every protected layout and server action still validates the session against
 * the database, so a forged or expired cookie never grants access.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname + request.nextUrl.search;
  const cookie = getSessionCookie(request, { cookiePrefix: authCookiePrefix() });
  if (!cookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  // Lets server layouts send users back here if their session turns out to be expired.
  const headers = new Headers(request.headers);
  headers.set("x-localians-path", path);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/cli/:path*"],
};
