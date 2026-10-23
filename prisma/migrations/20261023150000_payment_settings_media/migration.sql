-- AlterTable
ALTER TABLE "upgrade_requests" ADD COLUMN     "qrImageId" TEXT;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "avatarId" TEXT;

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipient" TEXT NOT NULL,
    "qrImageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workspaceId" TEXT,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "qrData" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_files_storageKey_key" ON "media_files"("storageKey");

-- CreateIndex
CREATE INDEX "media_files_kind_workspaceId_idx" ON "media_files"("kind", "workspaceId");


-- One settings row only, and only well-formed values (the app validates too; the database is the last line).
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "payment_settings" ADD CONSTRAINT "payment_settings_recipient_format" CHECK ("recipient" ~ '^0x[0-9a-f]{40}$');
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_kind" CHECK ("kind" IN ('payment_qr', 'workspace_avatar'));
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_storage_key_format" CHECK ("storageKey" ~ '^[a-z0-9_-]+\.(png|jpg|webp)$');
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_content_type" CHECK ("contentType" IN ('image/png', 'image/jpeg', 'image/webp'));
