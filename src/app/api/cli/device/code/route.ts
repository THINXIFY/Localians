import { startDeviceAuthorization } from "@/server/cli/device";
import { json, limitByIp, mapError, readJson } from "@/server/cli/http";
import { envLimit } from "@/server/rate-limit";

/** RFC 8628 device authorization request. */
export async function POST(request: Request) {
  const limited = await limitByIp(request, "device-code", envLimit("CLI_DEVICE_RATE_LIMIT", 10), 60_000);
  if (limited) return limited;
  const body = await readJson(request);
  const clientName = typeof body?.client_name === "string" ? body.client_name.replace(/[\u0000-\u001f]/g, "").trim() : "";
  try {
    return json(await startDeviceAuthorization(clientName));
  } catch (error) {
    return mapError(error);
  }
}
