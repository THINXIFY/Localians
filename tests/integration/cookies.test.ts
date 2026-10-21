import { describe, expect, it, vi } from "vitest";

// Run this file's auth instance exactly as production does: served from https://localians.com,
// with previews on *.preview.localians.com (same registrable domain).
vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = "https://localians.com";
  process.env.NEXT_PUBLIC_SITE_URL = "https://localians.com";
});

import { stripLocaliansCookies } from "@tunnel/shared/headers";
import { authCookiePrefix, sessionCookieName } from "@/lib/auth-cookies";
import { auth } from "@/server/auth";
import { createVerifiedUser, PASSWORD } from "./helpers";

const PREVIEW_ORIGIN = "https://abcdefghijkl.preview.localians.com";

function signInRequest(origin: string, email: string) {
  return auth.handler(
    new Request("https://localians.com/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin, "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
}

describe("auth cookies on https://localians.com (previews share the parent domain)", () => {
  it("are host-only __Host- cookies: Secure, HttpOnly, SameSite=Lax, Path=/, never a Domain attribute", async () => {
    expect(authCookiePrefix()).toBe("__Host-localians");
    const { email } = await createVerifiedUser("Cookie Checker");
    const response = await signInRequest("https://localians.com", email);
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith(`${sessionCookieName()}=`));
    expect(session).toBeDefined();
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Host-localians\./); // the browser rejects __Host- cookies that carry a Domain
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/;\s*Path=\/(;|$)/i);
      expect(cookie).not.toMatch(/;\s*Domain=/i);
    }
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
  });

  it("rejects sign-in requests made from a preview page (same-site, but a different origin)", async () => {
    const { email } = await createVerifiedUser("Cross Origin");
    const fromPreview = await signInRequest(PREVIEW_ORIGIN, email);
    expect(fromPreview.status).toBe(403);
    expect(fromPreview.headers.getSetCookie()).toHaveLength(0);
  });

  it("never forwards dashboard cookies to a preview app, whatever their prefix", () => {
    expect(stripLocaliansCookies("__Host-localians.session_token=s; __Secure-localians.session_data=d; localians.dont_remember=x; app=1")).toBe("app=1");
  });
});
