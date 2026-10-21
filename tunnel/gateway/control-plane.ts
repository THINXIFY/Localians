import type { AccessCheckRequest, AccessCheckResponse, GatewayEvent, GatewayEventsResponse } from "../shared/protocol";
import type { Logger } from "./log";

/** Reports tunnel lifecycle and metering to the control plane; returns per-session actions. */
export function createControlPlaneClient(config: { url: string; apiSecret: string; gatewayId: string }, log: Logger) {
  return async function report(events: GatewayEvent[]): Promise<GatewayEventsResponse | null> {
    if (!events.length) return { sessions: {} };
    try {
      const response = await fetch(`${config.url}/api/internal/gateway/events`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiSecret}` },
        body: JSON.stringify({ gatewayId: config.gatewayId, events }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        log("warn", "control plane rejected gateway report", { status: response.status });
        return null;
      }
      return (await response.json()) as GatewayEventsResponse;
    } catch (error) {
      log("warn", "control plane unreachable", { error: error instanceof Error ? error.message : "unknown" });
      return null;
    }
  };
}

/** Asks the control plane whether a visitor's preview password is correct (hashes never leave it). */
export function createAccessChecker(config: { url: string; apiSecret: string }, log: Logger) {
  return async function checkAccess(request: AccessCheckRequest): Promise<AccessCheckResponse | null> {
    try {
      const response = await fetch(`${config.url}/api/internal/gateway/access`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiSecret}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        log("warn", "control plane rejected access check", { status: response.status });
        return null;
      }
      return (await response.json()) as AccessCheckResponse;
    } catch (error) {
      log("warn", "control plane unreachable for access check", { error: error instanceof Error ? error.message : "unknown" });
      return null;
    }
  };
}
