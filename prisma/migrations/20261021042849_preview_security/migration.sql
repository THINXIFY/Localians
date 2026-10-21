-- CreateEnum
CREATE TYPE "PreviewAccess" AS ENUM ('PUBLIC', 'PASSWORD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TunnelEventType" ADD VALUE 'PROTECTION_CHANGED';
ALTER TYPE "TunnelEventType" ADD VALUE 'VISITORS_SIGNED_OUT';
ALTER TYPE "TunnelEventType" ADD VALUE 'QUOTA_EXCEEDED';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "accessMode" "PreviewAccess" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "accessPasswordHash" TEXT,
ADD COLUMN     "accessTtlMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "accessUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "share_setups" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "newProjectName" TEXT,
    "port" INTEGER,
    "accessMode" "PreviewAccess",
    "accessPasswordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "share_setups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_setups_codeHash_key" ON "share_setups"("codeHash");

-- CreateIndex
CREATE INDEX "share_setups_userId_createdAt_idx" ON "share_setups"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "share_setups_expiresAt_idx" ON "share_setups"("expiresAt");

-- CreateIndex
CREATE INDEX "rate_limit_windows_expiresAt_idx" ON "rate_limit_windows"("expiresAt");

-- AddForeignKey
ALTER TABLE "share_setups" ADD CONSTRAINT "share_setups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_setups" ADD CONSTRAINT "share_setups_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_setups" ADD CONSTRAINT "share_setups_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
