-- CreateEnum
CREATE TYPE "PreviewNameStatus" AS ENUM ('HELD', 'ACTIVE', 'RELEASED');

-- AlterTable
ALTER TABLE "share_setups" ADD COLUMN     "urlMode" TEXT;

-- AlterTable
ALTER TABLE "tunnel_sessions" ADD COLUMN     "customName" TEXT;

-- CreateTable
CREATE TABLE "preview_names" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "PreviewNameStatus" NOT NULL,
    "heldUntil" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preview_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "preview_names_name_key" ON "preview_names"("name");

-- CreateIndex
CREATE UNIQUE INDEX "preview_names_projectId_key" ON "preview_names"("projectId");

-- CreateIndex
CREATE INDEX "preview_names_workspaceId_status_idx" ON "preview_names"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "preview_names_status_heldUntil_idx" ON "preview_names"("status", "heldUntil");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_subjectType_subjectId_createdAt_idx" ON "audit_logs"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "tunnel_sessions_customName_status_idx" ON "tunnel_sessions"("customName", "status");

-- AddForeignKey
ALTER TABLE "preview_names" ADD CONSTRAINT "preview_names_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_names" ADD CONSTRAINT "preview_names_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guards the application relies on, enforced by the database so concurrent requests can't break them.

-- Names are stored normalised: 3–32 chars, a-z 0-9 and single inner hyphens.
ALTER TABLE "preview_names" ADD CONSTRAINT "preview_names_name_format"
  CHECK ("name" ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$' AND "name" !~ '--');

-- A custom name routes to at most one live session.
CREATE UNIQUE INDEX "tunnel_sessions_one_live_per_custom_name" ON "tunnel_sessions" ("customName")
  WHERE "customName" IS NOT NULL AND "status" IN ('CONNECTING', 'CONNECTED', 'RECONNECTING');

-- Audit rows are append-only.
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
