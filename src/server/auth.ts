import "server-only";
import { authCookiePrefix, authCookiesSecure } from "@/lib/auth-cookies";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { usernameSchema } from "@/lib/validation/username";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { sendEmail } from "./email/send";
import { changeEmailMessage, existingAccountMessage, resetPasswordMessage, verifyEmailMessage } from "./email/templates";
import { createPersonalWorkspace } from "./workspaces";
import { isDeployedProduction } from "./deployment";

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export const githubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

export const PASSWORD_MIN_LENGTH = 10;

export const auth = betterAuth({
  appName: "Localians",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: Array.from(new Set([baseURL, process.env.NEXT_PUBLIC_SITE_URL].filter(Boolean) as string[])),
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordMessage({ to: user.email, name: user.name, url }));
    },
    // Duplicate sign-ups get the same response as new ones (no account enumeration);
    // the real owner is told by email instead.
    onExistingUserSignUp: async ({ user }) => {
      await sendEmail(existingAccountMessage({ to: user.email, name: user.name, url: `${baseURL}/login` }));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmailMessage({ to: user.email, name: user.name, url }));
    },
  },

  socialProviders: githubConfigured
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      }
    : undefined,

  account: {
    // OAuth tokens are encrypted at rest.
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      // No trusted providers: implicit linking requires the provider to report a
      // verified email AND the local account to be verified (requireLocalEmailVerified
      // defaults to true), so an unverified matching email never merges accounts.
      trustedProviders: [],
      allowDifferentEmails: false,
    },
  },

  user: {
    // Chosen at sign-up (unique, lowercase). role / status / publicId are never accepted from clients.
    additionalFields: {
      username: { type: "string", required: false, input: true },
    },
    changeEmail: {
      enabled: true,
      // Approval link goes to the *current* address; the new address is then verified.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendEmail(changeEmailMessage({ to: user.email, name: user.name, newEmail, url }));
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 12,
  },

  rateLimit: {
    // Can only be switched off outside a real deployment (local tests).
    enabled: isDeployedProduction() || process.env.AUTH_RATE_LIMIT !== "off",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60 * 5, max: 3 },
      "/reset-password": { window: 60 * 5, max: 5 },
      "/send-verification-email": { window: 60 * 5, max: 3 },
      "/change-password": { window: 60, max: 5 },
      "/change-email": { window: 60 * 5, max: 3 },
    },
  },

  advanced: {
    // Host-only auth cookies: `__Host-` names over https, never a Domain attribute (src/lib/auth-cookies.ts).
    cookiePrefix: authCookiePrefix(),
    // Better Auth would prepend `__Secure-` to the name; the `__Host-` prefix already implies Secure.
    useSecureCookies: false,
    defaultCookieAttributes: { secure: authCookiesSecure(), path: "/", sameSite: "lax", httpOnly: true },
    crossSubDomainCookies: { enabled: false },
    // Better Auth skips origin/CSRF checks when NODE_ENV=test or TEST is set.
    // Pin them on so a stray env var can never disable CSRF protection.
    disableOriginCheck: false,
    disableCSRFCheck: false,
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Only a valid, free username is stored (the database also enforces format and uniqueness).
          const raw = (user as { username?: unknown }).username;
          if (raw === undefined || raw === null || raw === "") return { data: { ...user, username: null } };
          const parsed = usernameSchema.safeParse(raw);
          if (!parsed.success) throw new APIError("BAD_REQUEST", { message: parsed.error.issues[0]?.message ?? "Choose another username." });
          if (await prisma.user.findUnique({ where: { username: parsed.data }, select: { id: true } })) {
            throw new APIError("BAD_REQUEST", { message: "That username is taken. Try another." });
          }
          return { data: { ...user, username: parsed.data } };
        },
        after: async (user) => {
          await createPersonalWorkspace(user);
        },
      },
    },
    session: {
      create: {
        // Suspended or deactivated accounts can't sign in (existing sessions are removed when an admin suspends).
        before: async (session) => {
          const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true } });
          if (!user || user.status !== "ACTIVE") throw new APIError("FORBIDDEN", { message: "This account is suspended. Contact hello@thinxify.com." });
        },
      },
    },
  },

  // Must be last: lets server actions set auth cookies through next/headers.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
