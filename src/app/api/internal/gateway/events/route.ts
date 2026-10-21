import type { GatewayEventsRequest } from "@tunnel/shared/protocol";
import { apiError, gatewayAuthError, json, mapError, readJson } from "@/server/cli/http";
import { handleGatewayEvents } from "@/server/cli/tunnels";

/**
 * Server-to-server endpoint for the tunnel gateway (connect / heartbeat / disconnect
 * reports and metering). Authenticated with GATEWAY_API_SECRET; not for browsers or the CLI.
 */
export async function POST(request: Request) {
  const denied = gatewayAuthError(request);
  if (denied) return denied;
  const body = (await readJson(request, 1_000_000)) as Partial<GatewayEventsRequest> | null;
  if (!body || typeof body.gatewayId !== "string" || !Array.isArray(body.events)) return apiError(400, "invalid_request", "Invalid payload.");
  try {
    return json(await handleGatewayEvents(body.gatewayId.slice(0, 64), body.events));
  } catch (error) {
    return mapError(error);
  }
}
