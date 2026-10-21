import { json, withCliAuth } from "@/server/cli/http";
import { reissueConnectToken } from "@/server/cli/tunnels";

/** New short-lived connect token for reconnecting to the same preview URL. */
export const POST = withCliAuth(async (_request, auth, params) => json(await reissueConnectToken(auth, params.sessionId)));
