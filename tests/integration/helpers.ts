import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { waitForEmailLink } from "../setup/outbox";

let counter = 0;
export const uniqueEmail = (label = "user") => `${label}-${Date.now()}-${++counter}@example.test`;
export const PASSWORD = "correct-horse-42";

/** Builds a Cookie header from a Better Auth response's Set-Cookie headers. */
export function cookieHeaderFrom(response: Response) {
  const cookies = response.headers.getSetCookie().map((c) => c.split(";")[0]);
  return new Headers({ cookie: cookies.join("; ") });
}

export function tokenFromUrl(url: string) {
  const token = new URL(url).searchParams.get("token") ?? new URL(url).pathname.split("/").pop();
  if (!token) throw new Error(`No token in ${url}`);
  return token;
}

/** Signs up through Better Auth and verifies the email using the link from the (test) outbox. */
export async function createVerifiedUser(name = "Test User", email = uniqueEmail()) {
  await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  const link = await waitForEmailLink(email, "verify-email");
  await auth.api.verifyEmail({ query: { token: tokenFromUrl(link) } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { user, email };
}

export async function signIn(email: string, password = PASSWORD) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return { response, headers: cookieHeaderFrom(response) };
}

/** Calls the real HTTP auth handler (includes origin checks and rate limiting). */
export function authRequest(path: string, init: { method?: string; body?: unknown; ip?: string; headers?: Record<string, string> } = {}) {
  const base = process.env.BETTER_AUTH_URL!;
  return auth.handler(
    new Request(`${base}/api/auth${path}`, {
      method: init.method ?? "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        "x-forwarded-for": init.ip ?? "203.0.113.10",
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
}
