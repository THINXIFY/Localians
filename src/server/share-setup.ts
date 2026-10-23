import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PreviewAccess, ProjectStatus } from "@/generated/prisma/enums";
import { projectInputSchema } from "@/lib/validation/project";
import { hashPassword, previewPasswordSchema } from "./access";
import type { CliAuth } from "./cli/credentials";
import { sha256 } from "./cli/crypto";
import { prisma } from "./db";
import { NotFoundError } from "./errors";
import { log } from "./log";
import { createProject, getProjectForUser } from "./projects";
import { getCurrentWorkspace } from "./workspaces";
import { durationLabel, isDurationOption } from "@tunnel/shared/durations";
import { getPlanLimits } from "./plans";

/**
 * Share App wizard → CLI hand-off. The wizard prepares a setup (project, protection) and shows
 * `localians share <port> --setup <code>`; the CLI redeems the code once so the preview lands in
 * the right project with the right access, with no prompts.
 *
 * The code is only half of it: redeeming also needs a CLI login of the *same* user and
 * workspace, so a code seen in someone's terminal history is useless to anyone else.
 */
export const SETUP_TTL_MS = 30 * 60 * 1000;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1

function newCode() {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

export const setupCodePattern = /^[a-z2-9]{12}$/;

export async function createShareSetup(userId: string) {
  const workspace = await getCurrentWorkspace(userId);
  const code = newCode();
  const setup = await prisma.shareSetup.create({
    data: { codeHash: sha256(code), userId, workspaceId: workspace.id, expiresAt: new Date(Date.now() + SETUP_TTL_MS) },
    select: { id: true, expiresAt: true },
  });
  // Bounded storage: drop setups that expired a day ago or more.
  if (Math.random() < 0.05) void prisma.shareSetup.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => {});
  return { id: setup.id, code, expiresAt: setup.expiresAt };
}

export const setupInputSchema = z
  .object({
    port: z.number().int().min(1).max(65535).nullable(),
    /** Session length; optional so an older open wizard tab still saves. */
    durationMinutes: z.number().int().refine(isDurationOption, "Choose one of the listed durations.").optional(),
    project: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("new"), name: z.string().trim().max(80, "Keep the name under 80 characters.") }),
      z.object({ kind: z.literal("existing"), id: z.string().min(1).max(64) }),
    ]),
    access: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("PUBLIC") }),
      z.object({ mode: z.literal("PASSWORD"), password: previewPasswordSchema.optional() }),
    ]),
  })
  .strict();
export type SetupInput = z.infer<typeof setupInputSchema>;

export class SetupError extends Error {
  constructor(
    readonly code: "setup_invalid" | "setup_expired" | "setup_used" | "plan_required",
    message: string,
  ) {
    super(message);
  }
}

/** Saves the wizard's choices on the user's own, unused setup. */
export async function updateShareSetup(userId: string, setupId: string, input: SetupInput) {
  const parsed = setupInputSchema.parse(input);
  const setup = await prisma.shareSetup.findFirst({ where: { id: setupId, userId }, select: { id: true, workspaceId: true, usedAt: true, expiresAt: true, accessPasswordHash: true } });
  if (!setup) throw new NotFoundError("Setup not found.");
  if (setup.usedAt) throw new SetupError("setup_used", "This command was already used.");
  if (setup.expiresAt <= new Date()) throw new SetupError("setup_expired", "This command expired. Reload the page for a new one.");

  if (parsed.durationMinutes !== undefined) {
    const plan = await getPlanLimits(setup.workspaceId);
    if (parsed.durationMinutes > plan.maxDurationMinutes) {
      throw new SetupError("plan_required", `Sessions longer than ${durationLabel(plan.maxDurationMinutes)} need a Preview Pass.`);
    }
  }

  let projectId: string | null = null;
  if (parsed.project.kind === "existing") {
    const project = await getProjectForUser(userId, parsed.project.id);
    if (project.workspaceId !== setup.workspaceId) throw new NotFoundError("Project not found.");
    projectId = project.id;
  }
  const passwordHash = parsed.access.mode === "PASSWORD" && parsed.access.password ? await hashPassword(parsed.access.password) : undefined;
  await prisma.shareSetup.update({
    where: { id: setup.id },
    data: {
      port: parsed.port,
      ...(parsed.durationMinutes !== undefined ? { durationMinutes: parsed.durationMinutes } : {}),
      projectId,
      newProjectName: parsed.project.kind === "new" && parsed.project.name ? parsed.project.name : null,
      accessMode: parsed.access.mode,
      // Keep a password saved earlier in this visit unless a new one was typed; clear it when going public.
      ...(parsed.access.mode === "PUBLIC" ? { accessPasswordHash: null } : passwordHash ? { accessPasswordHash: passwordHash } : {}),
    },
  });
  return { passwordSaved: parsed.access.mode === "PASSWORD" && Boolean(passwordHash ?? setup.accessPasswordHash) };
}

/**
 * The CLI redeems a setup code (once). Returns the project to share under, creating it if the
 * wizard asked for a new one, and applies the chosen protection to it. With no project chosen it uses the project on
 * this port, or creates one named after the app the CLI runs in (`detected`; consent was given in the wizard).
 */
export async function redeemShareSetup(auth: CliAuth, code: string, port: number, detected?: { name?: string; framework?: string | null }) {
  if (!setupCodePattern.test(code)) throw new SetupError("setup_invalid", "That setup code isn't valid. Copy the command again from the dashboard.");
  const setup = await prisma.shareSetup.findUnique({ where: { codeHash: sha256(code) } });
  // Same answer for "doesn't exist" and "belongs to someone else".
  if (!setup || setup.userId !== auth.userId || setup.workspaceId !== auth.workspaceId) {
    throw new SetupError("setup_invalid", "That setup code isn't valid for this login. Copy the command again from the dashboard.");
  }
  if (setup.expiresAt <= new Date()) throw new SetupError("setup_expired", "That setup code expired. Copy a fresh command from the dashboard.");
  // Never let a "protected" choice quietly turn into a public preview.
  if (setup.accessMode === PreviewAccess.PASSWORD && !setup.accessPasswordHash) {
    const existing = setup.projectId ? await prisma.project.findUnique({ where: { id: setup.projectId }, select: { accessPasswordHash: true } }) : null;
    if (!existing?.accessPasswordHash) throw new SetupError("setup_invalid", "Password protection is selected but no password was set. Set one in the dashboard, then copy the command again.");
  }
  const claimed = await prisma.shareSetup.updateMany({ where: { id: setup.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new SetupError("setup_used", "That setup code was already used. Copy a fresh command from the dashboard.");

  let project: { id: string; name: string; slug: string; framework: string | null; defaultPort: number | null } | null = null;
  if (setup.projectId) {
    const existing = await getProjectForUser(auth.userId, setup.projectId);
    if (existing.workspaceId !== auth.workspaceId) throw new NotFoundError("Project not found.");
    project = existing;
  } else if (setup.newProjectName) {
    project = await createProject(auth.userId, projectInputSchema.parse({ name: setup.newProjectName, description: "", framework: "", defaultPort: String(port) }));
  } else {
    // "New project, no name": the project that already uses this port, else one named after the app the CLI is run
    // from. Resolved here (not in the CLI) so the chosen protection is always applied to it.
    project = await prisma.project.findFirst({
      where: { workspaceId: auth.workspaceId, status: ProjectStatus.ACTIVE, defaultPort: port },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, framework: true, defaultPort: true },
    });
    if (!project) {
      const input = { description: "", defaultPort: String(port) };
      const named = projectInputSchema.safeParse({ ...input, name: detected?.name?.trim() || "My app", framework: detected?.framework ?? "" });
      project = await createProject(auth.userId, named.success ? named.data : projectInputSchema.parse({ ...input, name: "My app", framework: "" }));
    }
  }

  if (project && setup.accessMode) {
    const current = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { accessMode: true, accessPasswordHash: true, status: true } });
    if (current.status === ProjectStatus.ARCHIVED) return { project, access: current.accessMode };
    if (setup.accessMode === PreviewAccess.PASSWORD && (setup.accessPasswordHash || current.accessPasswordHash)) {
      const changed = current.accessMode !== PreviewAccess.PASSWORD || Boolean(setup.accessPasswordHash);
      await prisma.project.update({
        where: { id: project.id },
        data: {
          accessMode: PreviewAccess.PASSWORD,
          ...(setup.accessPasswordHash ? { accessPasswordHash: setup.accessPasswordHash } : {}),
          ...(changed ? { accessVersion: { increment: 1 }, accessUpdatedAt: new Date() } : {}),
        },
      });
    } else if (setup.accessMode === PreviewAccess.PUBLIC && current.accessMode !== PreviewAccess.PUBLIC) {
      await prisma.project.update({ where: { id: project.id }, data: { accessMode: PreviewAccess.PUBLIC, accessVersion: { increment: 1 }, accessUpdatedAt: new Date() } });
    }
  }
  log("info", "share setup redeemed", { setupId: setup.id, newProject: Boolean(setup.newProjectName), protected: setup.accessMode === PreviewAccess.PASSWORD });
  const access = project ? (await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { accessMode: true } })).accessMode : PreviewAccess.PUBLIC;
  return {
    project: project ? { id: project.id, name: project.name, slug: project.slug, framework: project.framework, defaultPort: project.defaultPort } : null,
    access,
    durationMinutes: setup.durationMinutes,
  };
}
