import type { AccessCheckRequest } from "@tunnel/shared/protocol";
import { verifyPreviewAccess } from "@/server/access";
import { apiError, gatewayAuthError, json, mapError, readJson } from "@/server/cli/http";

/**
 * The gateway asks whether a visitor's preview password is right. Passwords are checked here
 * (hashes never leave the control plane), with shared per-visitor and per-preview rate limits.
 */
export async function POST(request: Request) {
  const denied = gatewayAuthError(request);
  if (denied) return denied;
  const body = (await readJson(request, 4096)) as Partial<AccessCheckRequest> | null;
  if (!body || typeof body.sessionId !== "string" || body.sessionId.length > 64 || typeof body.password !== "string" || typeof body.clientIp !== "string") {
    return apiError(400, "invalid_request", "Invalid payload.");
  }
  try {
    return json(await verifyPreviewAccess(body.sessionId, body.password, body.clientIp));
  } catch (error) {
    return mapError(error);
  }
}
