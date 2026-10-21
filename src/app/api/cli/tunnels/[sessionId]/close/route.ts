import { json, withCliAuth } from "@/server/cli/http";
import { closeTunnelSession } from "@/server/cli/tunnels";

export const POST = withCliAuth(async (_request, auth, params) => {
  await closeTunnelSession(auth, params.sessionId);
  return json({ closed: true });
});
