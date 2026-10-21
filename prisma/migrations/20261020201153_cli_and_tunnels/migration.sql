-- CreateEnum
CREATE TYPE "DeviceAuthStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "TunnelStatus" AS ENUM ('CONNECTING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "cli_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "cli_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_authorizations" (
    "id" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "status" "DeviceAuthStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),

    CONSTRAINT "device_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tunnel_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT,
    "hostname" TEXT NOT NULL,
    "localPort" INTEGER NOT NULL,
    "status" "TunnelStatus" NOT NULL DEFAULT 'CONNECTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endReason" TEXT,
    "gatewayId" TEXT,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tunnel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cli_credentials_tokenHash_key" ON "cli_credentials"("tokenHash");

-- CreateIndex
CREATE INDEX "cli_credentials_userId_revokedAt_idx" ON "cli_credentials"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_authorizations_deviceCodeHash_key" ON "device_authorizations"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "device_authorizations_userCode_key" ON "device_authorizations"("userCode");

-- CreateIndex
CREATE INDEX "device_authorizations_expiresAt_idx" ON "device_authorizations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "tunnel_sessions_hostname_key" ON "tunnel_sessions"("hostname");

-- CreateIndex
CREATE INDEX "tunnel_sessions_projectId_status_idx" ON "tunnel_sessions"("projectId", "status");

-- CreateIndex
CREATE INDEX "tunnel_sessions_userId_status_idx" ON "tunnel_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "tunnel_sessions_status_lastHeartbeatAt_idx" ON "tunnel_sessions"("status", "lastHeartbeatAt");

-- AddForeignKey
ALTER TABLE "cli_credentials" ADD CONSTRAINT "cli_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_credentials" ADD CONSTRAINT "cli_credentials_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_sessions" ADD CONSTRAINT "tunnel_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_sessions" ADD CONSTRAINT "tunnel_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_sessions" ADD CONSTRAINT "tunnel_sessions_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "cli_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
