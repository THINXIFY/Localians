import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { TunnelEventType } from "@/generated/prisma/enums";
import { nameSchema } from "@/lib/validation/auth";
import { usernameSchema } from "@/lib/validation/username";
import { audit } from "./audit";
import { auth } from "./auth";
import { terminateOnGateway } from "./cli/gateway-control";
import { ACTIVE_STATES, endSessions } from "./cli/lifecycle";
import { prisma } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";
import { log } from "./log";
import { getSession } from "./session";

/**
 * The administration area (/admin). Every page and action checks, on the server, that the signed-in account has the
 * ADMIN role, is active, and signed in recently (ADMIN_SESSION_MAX_AGE): a stolen long-lived session can't be used
 * for admin work. Admin accounts are only created by scripts/create-admin.ts.
 */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type AdminUser = { id: string; email: string; name: string; publicId: string };

export async function getAdmin(): Promise<AdminUser | null> {
  const session = await getSession();
  if (!session) return null;
  if (Date.now() - new Date(session.session.createdAt).getTime() > ADMIN_SESSION_MAX_AGE_MS) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true, publicId: true, role: true, status: true } });
  if (!user || user.role !== "ADMIN" || user.status !== "ACTIVE") return null;
  return { id: user.id, email: user.email, name: user.name, publicId: user.publicId };
}

/** For admin pages: the admin, or a redirect to the admin sign-in. */
export async function requireAdminPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For admin actions and API routes: the admin, or ForbiddenError. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) throw new ForbiddenError("Administrator sign-in required.");
  return admin;
}

/** Signs the current session out (admin logout). */
export async function signOutCurrent() {
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
}

// ------------------------------------------------------------------ overview

export async function getAdminOverview() {
  const [users, activePreviews, recentUsers] = await Promise.all([
    prisma.user.count({ where: { status: { not: "DELETED" }, role: "USER" } }),
    prisma.tunnelSession.count({ where: { status: { in: ACTIVE_STATES }, expiresAt: { gt: new Date() } } }),
    prisma.user.findMany({
      where: { role: "USER", status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, publicId: true, username: true, name: true, email: true, createdAt: true, status: true },
    }),
  ]);
  return { users, activePreviews, recentUsers };
}

// ------------------------------------------------------------------ users

/** "7-Day Pass" while any of the user's workspace projects has an active pass, else "Free". */
async function planLabels(userIds: string[]) {
  const now = new Date();
  const rows = await prisma.previewPass.findMany({
    where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now }, project: { workspace: { members: { some: { userId: { in: userIds } } } } } },
    select: { project: { select: { workspace: { select: { members: { select: { userId: true } } } } } } },
  });
  const paid = new Set(rows.flatMap((r) => r.project.workspace.members.map((m) => m.userId)));
  return (id: string) => (paid.has(id) ? "Preview Pass" : "Free");
}

const PAGE = 50;

export async function listUsers({ q, page = 1 }: { q?: string; page?: number }) {
  const query = (q ?? "").trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    role: "USER",
    ...(query
      ? {
          OR: [
            { publicId: { contains: query, mode: "insensitive" } },
            { username: { contains: query.toLowerCase() } },
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * PAGE,
      take: PAGE,
      select: { id: true, publicId: true, username: true, name: true, email: true, status: true, createdAt: true },
    }),
  ]);
  const plan = await planLabels(rows.map((r) => r.id));
  return { total, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / PAGE)), users: rows.map((r) => ({ ...r, plan: plan(r.id) })) };
}

/** A user's profile, projects (with plan state) and recent previews. Never credentials or tokens. */
export async function getUserDetail(publicId: string) {
  const user = await prisma.user.findUnique({
    where: { publicId },
    select: { id: true, publicId: true, username: true, name: true, email: true, emailVerified: true, status: true, role: true, createdAt: true, suspendedAt: true, deletedAt: true },
  });
  if (!user || user.role !== "USER") throw new NotFoundError("User not found.");
  const now = new Date();
  const [projects, sessions, cliLogins] = await Promise.all([
    prisma.project.findMany({
      where: { workspace: { members: { some: { userId: user.id } } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        defaultPort: true,
        status: true,
        accessMode: true,
        createdAt: true,
        freeGrant: { select: { startedAt: true, endsAt: true } },
        passes: { where: { status: "ACTIVE", endsAt: { gt: now } }, orderBy: { endsAt: "desc" }, take: 1, select: { startsAt: true, endsAt: true } },
        previewName: { select: { name: true, status: true } },
      },
    }),
    prisma.tunnelSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, hostname: true, customName: true, localPort: true, status: true, planTier: true, createdAt: true, expiresAt: true, project: { select: { name: true } } },
    }),
    prisma.cliCredential.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } } }),
  ]);
  const plan = await planLabels([user.id]);
  return { user: { ...user, plan: plan(user.id) }, projects, sessions, cliLogins };
}

export class AdminInputError extends Error {}

async function targetUser(userId: string, admin: AdminUser) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, publicId: true, role: true, status: true } });
  if (!user) throw new NotFoundError("User not found.");
  if (user.role !== "USER" || user.id === admin.id) throw new ForbiddenError("Administrator accounts can't be changed here.");
  return user;
}

/** Edits the profile fields an admin may change (name, username). */
export async function adminUpdateUser(admin: AdminUser, userId: string, input: { name: string; username: string }) {
  const user = await targetUser(userId, admin);
  const name = nameSchema.safeParse(input.name);
  if (!name.success) throw new AdminInputError(name.error.issues[0]?.message ?? "Invalid name.");
  const username = usernameSchema.safeParse(input.username);
  if (!username.success) throw new AdminInputError(username.error.issues[0]?.message ?? "Invalid username.");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name: name.data, username: username.data } });
      await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "user.updated", subject: { type: "user", id: user.id }, detail: { publicId: user.publicId, username: username.data } });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new AdminInputError("That username is taken.");
    throw error;
  }
}

/** Signs the user out everywhere: sessions, CLI logins, and live previews (which stop at the gateway). */
async function cutAccess(userId: string, reason: string) {
  const now = new Date();
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.cliCredential.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  const ended = await endSessions({ userId }, { status: "REVOKED", reason, event: TunnelEventType.REVOKED });
  await Promise.all(ended.map((s) => terminateOnGateway(s.id, s.gatewayId)));
}

export async function suspendUser(admin: AdminUser, userId: string, reason: string) {
  const user = await targetUser(userId, admin);
  if (user.status === "DELETED") throw new AdminInputError("This account was deleted.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "user.suspended", subject: { type: "user", id: user.id }, detail: { publicId: user.publicId, reason: reason.slice(0, 200) } });
  });
  await cutAccess(user.id, "Account suspended");
  log("info", "user suspended", { publicId: user.publicId });
}

export async function reactivateUser(admin: AdminUser, userId: string) {
  const user = await targetUser(userId, admin);
  if (user.status !== "SUSPENDED") throw new AdminInputError("Only suspended accounts can be reactivated.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: "ACTIVE", suspendedAt: null } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "user.reactivated", subject: { type: "user", id: user.id }, detail: { publicId: user.publicId } });
  });
}

/**
 * "Delete" an account safely: it's deactivated and anonymised (name, email, username, sign-in methods removed) and all
 * access is cut, but the row stays so payments, passes and the audit trail keep referring to a real record.
 * `confirm` must repeat the user's public ID.
 */
export async function deleteUser(admin: AdminUser, userId: string, confirm: string) {
  const user = await targetUser(userId, admin);
  if (confirm.trim().toUpperCase() !== user.publicId) throw new AdminInputError(`Type ${user.publicId} to confirm.`);
  if (user.status === "DELETED") return;
  await cutAccess(user.id, "Account deleted");
  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId: user.id } }); // password hashes and OAuth links
    await tx.user.update({
      where: { id: user.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        name: "Deleted user",
        email: `deleted-${user.publicId.toLowerCase()}@users.localians.invalid`,
        username: null,
        image: null,
        emailVerified: false,
      },
    });
    await tx.project.updateMany({ where: { workspace: { ownerId: user.id }, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await audit(tx, { actor: { type: "ADMIN", id: admin.id }, action: "user.deleted", subject: { type: "user", id: user.id }, detail: { publicId: user.publicId } });
  });
  log("info", "user deleted (anonymised)", { publicId: user.publicId });
}
