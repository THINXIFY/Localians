import { apiError, json, readJson, withCliAuth } from "@/server/cli/http";
import { redeemShareSetup, SetupError } from "@/server/share-setup";

/** `localians share <port> --setup <code>`: redeem the Share App wizard's choices (once). */
export const POST = withCliAuth(async (request, auth) => {
  const body = await readJson(request);
  const code = typeof body?.code === "string" ? body.code.trim().toLowerCase() : "";
  const port = Number(body?.port);
  if (!code || !Number.isInteger(port) || port < 1 || port > 65535) return apiError(400, "invalid_request", "A setup code and a port are required.");
  try {
    const result = await redeemShareSetup(auth, code, port);
    return json({ project: result.project, access: result.access === "PASSWORD" ? "password" : "public" });
  } catch (error) {
    if (error instanceof SetupError) return apiError(error.code === "setup_invalid" ? 404 : 410, error.code, error.message);
    throw error;
  }
});
