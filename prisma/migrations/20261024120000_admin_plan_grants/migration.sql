-- CreateEnum
CREATE TYPE "PassGrantReason" AS ENUM ('COMPLIMENTARY', 'SUPPORT_ADJUSTMENT');

-- AlterTable
ALTER TABLE "preview_passes" ADD COLUMN     "grantKey" TEXT,
ADD COLUMN     "grantNote" TEXT,
ADD COLUMN     "grantReason" "PassGrantReason";

-- CreateIndex
CREATE UNIQUE INDEX "preview_passes_grantKey_key" ON "preview_passes"("grantKey");


-- Admin grants (Manage Plan) are never payments: they have a reason, no order, and a support adjustment always says why.
ALTER TABLE "preview_passes" ADD CONSTRAINT "preview_passes_admin_grant" CHECK (
  "grantReason" IS NULL OR ("source" = 'ADMIN' AND "requestId" IS NULL AND "grantKey" IS NOT NULL)
);
ALTER TABLE "preview_passes" ADD CONSTRAINT "preview_passes_support_note" CHECK (
  "grantReason" IS DISTINCT FROM 'SUPPORT_ADJUSTMENT' OR length(trim(coalesce("grantNote", ''))) >= 10
);
