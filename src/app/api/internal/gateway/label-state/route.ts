import type { LabelStateResponse } from "@tunnel/shared/protocol";
import { apiError, gatewayAuthError, json, mapError, readJson } from "@/server/cli/http";
import { labelState } from "@/server/preview-names";

/**
 * The gateway asks what to show for a custom preview name it has no tunnel for: reserved but offline, its time ran
 * out, or not a reserved name. Reveals nothing about who owns a name.
 */
export async function POST(request: Request) {
  const denied = gatewayAuthError(request);
  if (denied) return denied;
  const body = (await readJson(request, 1024)) as { label?: unknown } | null;
  if (!body || typeof body.label !== "string" || body.label.length > 64) return apiError(400, "invalid_request", "Invalid payload.");
  try {
    return json({ state: await labelState(body.label) } satisfies LabelStateResponse);
  } catch (error) {
    return mapError(error);
  }
}
