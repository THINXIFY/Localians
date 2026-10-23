import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./db";

export type AuditActor = { type: "USER" | "ADMIN" | "SYSTEM"; id?: string | null };

/**
 * Appends to the audit trail (custom names, entitlements, payments, admin actions). Rows can't be changed afterwards
 * (a database trigger refuses updates). Never put passwords, tokens, keys or request contents in `detail`.
 */
export async function audit(
  db: Pick<Prisma.TransactionClient, "auditLog"> | typeof prisma,
  entry: { workspaceId?: string | null; actor: AuditActor; action: string; subject: { type: string; id: string }; detail?: Prisma.InputJsonValue },
) {
  await db.auditLog.create({
    data: {
      workspaceId: entry.workspaceId ?? null,
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      action: entry.action,
      subjectType: entry.subject.type,
      subjectId: entry.subject.id,
      detail: entry.detail,
    },
  });
}
