-- CreateEnum
CREATE TYPE "UpgradeStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "upgrade_requests" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "requestedName" TEXT,
    "status" "UpgradeStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "txSubmittedAt" TIMESTAMP(3),
    "verification" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "verifiedOk" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upgrade_requests_orderId_key" ON "upgrade_requests"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "upgrade_requests_txHash_key" ON "upgrade_requests"("txHash");

-- CreateIndex
CREATE INDEX "upgrade_requests_status_createdAt_idx" ON "upgrade_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "upgrade_requests_userId_createdAt_idx" ON "upgrade_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "upgrade_requests_projectId_idx" ON "upgrade_requests"("projectId");

-- AddForeignKey
ALTER TABLE "preview_passes" ADD CONSTRAINT "preview_passes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "upgrade_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Guards enforced by the database.
-- One open request per project (a second "Upgrade" click shows the existing one).
CREATE UNIQUE INDEX "upgrade_requests_one_open_per_project" ON "upgrade_requests" ("projectId") WHERE "status" IN ('PENDING', 'UNDER_REVIEW') AND "projectId" IS NOT NULL;
-- Hashes are stored normalised, so the unique index above catches every reuse.
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_tx_hash_format" CHECK ("txHash" IS NULL OR "txHash" ~ '^0x[0-9a-f]{64}$');
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_amount" CHECK ("amountMicros" > 0);
-- Approval needs a recorded, passing on-chain verification.
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_approved_verified" CHECK ("status" <> 'APPROVED' OR ("verifiedOk" AND "txHash" IS NOT NULL AND "reviewedById" IS NOT NULL));
