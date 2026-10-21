-- CreateEnum
CREATE TYPE "TunnelEventType" AS ENUM ('CREATED', 'CONNECTED', 'RECONNECTED', 'CONNECTION_LOST', 'STOPPED_BY_CLI', 'STOPPED_FROM_DASHBOARD', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "tunnel_sessions" ADD COLUMN     "currentConnectionId" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "tunnel_connections" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tunnel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tunnel_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "TunnelEventType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tunnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tunnel_metrics" (
    "sessionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "tunnel_metrics_pkey" PRIMARY KEY ("sessionId","bucketStart")
);

-- CreateIndex
CREATE INDEX "tunnel_connections_sessionId_idx" ON "tunnel_connections"("sessionId");

-- CreateIndex
CREATE INDEX "tunnel_events_sessionId_createdAt_idx" ON "tunnel_events"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "tunnel_events_workspaceId_createdAt_idx" ON "tunnel_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "tunnel_metrics_workspaceId_bucketStart_idx" ON "tunnel_metrics"("workspaceId", "bucketStart");

-- CreateIndex
CREATE INDEX "tunnel_metrics_projectId_bucketStart_idx" ON "tunnel_metrics"("projectId", "bucketStart");

-- CreateIndex
CREATE INDEX "tunnel_sessions_projectId_lastActivityAt_idx" ON "tunnel_sessions"("projectId", "lastActivityAt");

-- AddForeignKey
ALTER TABLE "tunnel_connections" ADD CONSTRAINT "tunnel_connections_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tunnel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_events" ADD CONSTRAINT "tunnel_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tunnel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_events" ADD CONSTRAINT "tunnel_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_metrics" ADD CONSTRAINT "tunnel_metrics_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "tunnel_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tunnel_metrics" ADD CONSTRAINT "tunnel_metrics_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
