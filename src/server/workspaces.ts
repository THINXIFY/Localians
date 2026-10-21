import "server-only";
import { cache } from "react";
import { WorkspaceRole } from "@/generated/prisma/enums";
import { uniqueSlug } from "@/lib/slug";
import { prisma } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";

/** Creates the personal workspace every new user gets (idempotent). */
export async function createPersonalWorkspace(user: { id: string; name: string; email: string }) {
  const existing = await prisma.workspaceMember.findFirst({ where: { userId: user.id }, select: { workspaceId: true } });
  if (existing) return existing.workspaceId;

  const firstName = user.name.trim().split(/\s+/)[0] || user.email.split("@")[0];
  const name = `${firstName}'s Workspace`;
  const slug = await uniqueSlug(firstName, async (s) => !!(await prisma.workspace.findUnique({ where: { slug: s }, select: { id: true } })), "workspace");

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      ownerId: user.id,
      members: { create: { userId: user.id, role: WorkspaceRole.OWNER } },
    },
    select: { id: true },
  });
  return workspace.id;
}

export type WorkspaceContext = {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  createdAt: Date;
};

/**
 * The workspace the user is working in. Stage 1 has one personal workspace per
 * user; the earliest membership is used so the choice is stable.
 */
export const getCurrentWorkspace = cache(async (userId: string): Promise<WorkspaceContext> => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true, createdAt: true } } },
  });
  if (!membership) throw new NotFoundError("No workspace found for this account.");
  return { ...membership.workspace, role: membership.role };
});

/** Throws unless `userId` belongs to `workspaceId` (optionally with a minimum role). */
export async function requireMembership(userId: string, workspaceId: string, role?: WorkspaceRole) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!membership) throw new NotFoundError("Workspace not found.");
  if (role === WorkspaceRole.OWNER && membership.role !== WorkspaceRole.OWNER) {
    throw new ForbiddenError("Only the workspace owner can do that.");
  }
  return membership;
}

export async function updateWorkspace(userId: string, workspaceId: string, input: { name: string; slug: string }) {
  await requireMembership(userId, workspaceId, WorkspaceRole.OWNER);
  const clash = await prisma.workspace.findFirst({ where: { slug: input.slug, NOT: { id: workspaceId } }, select: { id: true } });
  if (clash) return { ok: false as const, field: "slug" as const, error: "That workspace URL is already taken." };
  const workspace = await prisma.workspace.update({ where: { id: workspaceId }, data: input });
  return { ok: true as const, workspace };
}

/** Every workspace the user belongs to, current (earliest) first. */
export async function listWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });
  return memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role }));
}
