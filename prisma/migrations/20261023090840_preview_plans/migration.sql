-- CreateEnum
CREATE TYPE "PassStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PassSource" AS ENUM ('PAYMENT', 'ADMIN');

-- AlterTable
ALTER TABLE "tunnel_sessions" ADD COLUMN     "planTier" TEXT,
ADD COLUMN     "untilPlanEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "free_preview_grants" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_preview_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preview_passes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PassStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "PassSource" NOT NULL,
    "requestId" TEXT,
    "createdById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "free_preview_grants_projectId_key" ON "free_preview_grants"("projectId");

-- CreateIndex
CREATE INDEX "free_preview_grants_workspaceId_startedAt_idx" ON "free_preview_grants"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "free_preview_grants_userId_startedAt_idx" ON "free_preview_grants"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "preview_passes_requestId_key" ON "preview_passes"("requestId");

-- CreateIndex
CREATE INDEX "preview_passes_projectId_status_endsAt_idx" ON "preview_passes"("projectId", "status", "endsAt");

-- AddForeignKey
ALTER TABLE "free_preview_grants" ADD CONSTRAINT "free_preview_grants_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_preview_grants" ADD CONSTRAINT "free_preview_grants_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preview_passes" ADD CONSTRAINT "preview_passes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Time windows must be sane (enforced by the database).
ALTER TABLE "preview_passes" ADD CONSTRAINT "preview_passes_window" CHECK ("endsAt" > "startsAt");
ALTER TABLE "free_preview_grants" ADD CONSTRAINT "free_preview_grants_window" CHECK ("endsAt" > "startedAt");
