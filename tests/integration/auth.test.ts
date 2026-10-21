import { describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { readOutbox, waitForEmailLink } from "../setup/outbox";
import { authRequest, createVerifiedUser, PASSWORD, signIn, tokenFromUrl, uniqueEmail } from "./helpers";

describe("registration", () => {
  it("creates an unverified user, hashes the password, sends a verification email and provisions a personal workspace", async () => {
    const email = uniqueEmail("signup");
    await auth.api.signUpEmail({ body: { name: "Ada Lovelace", email, password: PASSWORD } });

    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true, memberships: { include: { workspace: true } } } });
    expect(user.emailVerified).toBe(false);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0].providerId).toBe("credential");
    expect(user.accounts[0].password).toBeTruthy();
    expect(user.accounts[0].password).not.toContain(PASSWORD); // stored as a hash, never plaintext

    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0].role).toBe("OWNER");
    expect(user.memberships[0].workspace.ownerId).toBe(user.id);
    expect(user.memberships[0].workspace.name).toBe("Ada's Workspace");

    expect(readOutbox(email, "verify-email")).toHaveLength(1);
  });

  it("treats a duplicate sign-up like a new one (no enumeration) and notifies the real owner", async () => {
    const { email } = await createVerifiedUser("Grace Hopper");
    const res = await authRequest("/sign-up/email", { body: { name: "Impostor", email, password: "another-pass-99" }, ip: "198.51.100.7" });
    expect(res.status).toBe(200);

    expect(await prisma.user.count({ where: { email } })).toBe(1);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(owner.name).toBe("Grace Hopper");
    expect(readOutbox(email, "existing-account")).toHaveLength(1);
  });

  it("rejects passwords below the minimum length", async () => {
    const res = await authRequest("/sign-up/email", { body: { name: "Short", email: uniqueEmail("short"), password: "abc12" }, ip: "198.51.100.8" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PASSWORD_TOO_SHORT");
  });

  it("rejects invalid email addresses", async () => {
    const res = await authRequest("/sign-up/email", { body: { name: "Bad", email: "not-an-email", password: PASSWORD }, ip: "198.51.100.9" });
    expect(res.status).toBe(400);
  });
});

describe("email verification", () => {
  it("blocks sign-in until the email is verified, then allows it", async () => {
    const email = uniqueEmail("verify");
    await auth.api.signUpEmail({ body: { name: "Verify Me", email, password: PASSWORD } });

    const blocked = await authRequest("/sign-in/email", { body: { email, password: PASSWORD }, ip: "198.51.100.20" });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");

    const link = await waitForEmailLink(email, "verify-email");
    await auth.api.verifyEmail({ query: { token: tokenFromUrl(link) } });
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);

    const ok = await authRequest("/sign-in/email", { body: { email, password: PASSWORD }, ip: "198.51.100.21" });
    expect(ok.status).toBe(200);
  });

  it("rejects a tampered verification token", async () => {
    await expect(auth.api.verifyEmail({ query: { token: "not-a-real-token" } })).rejects.toThrow();
  });
});

describe("sign in / sessions", () => {
  it("issues an httpOnly session cookie and resolves the session server-side", async () => {
    const { email, user } = await createVerifiedUser();
    const { response, headers } = await signIn(email);
    const setCookie = response.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/localians\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const session = await auth.api.getSession({ headers });
    expect(session?.user.id).toBe(user.id);
  });

  it("rejects a wrong password without revealing whether the account exists", async () => {
    const { email } = await createVerifiedUser();
    const wrong = await authRequest("/sign-in/email", { body: { email, password: "wrong-password-1" }, ip: "198.51.100.30" });
    const unknown = await authRequest("/sign-in/email", { body: { email: uniqueEmail("ghost"), password: "wrong-password-1" }, ip: "198.51.100.31" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).code).toBe((await unknown.json()).code);
  });

  it("invalidates the session on sign-out", async () => {
    const { email } = await createVerifiedUser();
    const { headers } = await signIn(email);
    expect(await auth.api.getSession({ headers })).not.toBeNull();
    await auth.api.signOut({ headers });
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    const { email, user } = await createVerifiedUser();
    const { headers } = await signIn(email);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("rate-limits repeated sign-in attempts from the same client", async () => {
    const { email } = await createVerifiedUser();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await authRequest("/sign-in/email", { body: { email, password: `wrong-${i}-password` }, ip: "192.0.2.77" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toContain(429);
  });

  it("rejects cross-site POSTs that carry a session cookie (CSRF protection)", async () => {
    const { email } = await createVerifiedUser();
    const { headers } = await signIn(email);
    const res = await authRequest("/update-user", {
      body: { name: "Hacked" },
      ip: "192.0.2.90",
      headers: { origin: "https://evil.example", cookie: headers.get("cookie")!, "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).name).not.toBe("Hacked");
  });
});

describe("password recovery", () => {
  it("resets the password with a one-time token and revokes existing sessions", async () => {
    const { email } = await createVerifiedUser();
    const { headers: oldSession } = await signIn(email);

    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    const link = await waitForEmailLink(email, "reset-password");
    const token = tokenFromUrl(link);

    await auth.api.resetPassword({ body: { newPassword: "brand-new-pass-77", token } });

    expect(await auth.api.getSession({ headers: oldSession })).toBeNull(); // old sessions revoked
    expect((await signIn(email, PASSWORD)).response.status).toBe(401); // old password rejected
    expect((await signIn(email, "brand-new-pass-77")).response.status).toBe(200);

    // Token is single use.
    await expect(auth.api.resetPassword({ body: { newPassword: "third-password-88", token } })).rejects.toThrow();
  });

  it("rejects expired reset tokens", async () => {
    const { email } = await createVerifiedUser();
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    const token = tokenFromUrl(await waitForEmailLink(email, "reset-password"));
    await prisma.verification.updateMany({ where: { identifier: { contains: token } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(auth.api.resetPassword({ body: { newPassword: "brand-new-pass-77", token } })).rejects.toThrow();
  });

  it("responds identically for unknown emails and never emails them", async () => {
    const email = uniqueEmail("nobody");
    const res = await authRequest("/request-password-reset", { body: { email, redirectTo: "/reset-password" }, ip: "198.51.100.40" });
    expect(res.status).toBe(200);
    expect(readOutbox(email)).toHaveLength(0);
  });

  it("does not expose reset tokens in API responses", async () => {
    const { email } = await createVerifiedUser();
    const res = await authRequest("/request-password-reset", { body: { email, redirectTo: "/reset-password" }, ip: "198.51.100.41" });
    const body = await res.text();
    const token = tokenFromUrl(await waitForEmailLink(email, "reset-password"));
    expect(body).not.toContain(token);
  });
});
