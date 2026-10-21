-- Sessions recorded before Phase 4 get their real last activity instead of the migration time.
UPDATE "tunnel_sessions"
SET "lastActivityAt" = COALESCE("disconnectedAt", "lastHeartbeatAt", "connectedAt", "createdAt"),
    "updatedAt" = COALESCE("disconnectedAt", "lastHeartbeatAt", "connectedAt", "createdAt");
