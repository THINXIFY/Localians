import { revokeCliCredential } from "@/server/cli/credentials";
import { json, withCliAuth } from "@/server/cli/http";

/** Revokes the calling CLI credential (and ends any tunnels it opened). */
export const POST = withCliAuth(async (_request, auth) => {
  await revokeCliCredential(auth.userId, auth.credentialId, "Signed out from the CLI");
  return json({ revoked: true });
});
