import { pollDeviceAuthorization } from "@/server/cli/device";
import { apiError, json, limitByIp, readJson } from "@/server/cli/http";
import { envLimit } from "@/server/rate-limit";

/** RFC 8628 §3.4 device access token request (polled by the CLI). */
export async function POST(request: Request) {
  const limited = await limitByIp(request, "device-token", envLimit("CLI_DEVICE_RATE_LIMIT", 10) * 6, 60_000);
  if (limited) return limited;
  const body = await readJson(request);
  const deviceCode = typeof body?.device_code === "string" ? body.device_code : "";
  if (!deviceCode) return apiError(400, "invalid_request", "device_code is required.");

  const result = await pollDeviceAuthorization(deviceCode);
  if (!result.ok) {
    const messages = {
      authorization_pending: "Waiting for approval in the browser.",
      slow_down: "Polling too fast.",
      expired_token: "This login request expired. Run `localians login` again.",
      access_denied: "The login request was denied.",
      invalid_grant: "This login request is no longer valid.",
    } as const;
    return apiError(400, result.error, messages[result.error]);
  }
  return json({
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_at: result.expiresAt.toISOString(),
    user: result.user,
    workspace: result.workspace,
  });
}
