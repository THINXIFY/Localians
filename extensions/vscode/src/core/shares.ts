import { startAgent, type AgentState, type StopReason } from "@tunnel/cli/agent";
import { ApiError, createApi } from "@tunnel/cli/api";
import type { LoopbackAddress } from "@tunnel/cli/local";

type Api = ReturnType<typeof createApi>;

export type ShareStatus = "connecting" | "connected" | "reconnecting" | "ended";

export type Share = {
  sessionId: string;
  port: number;
  projectId: string;
  projectName: string;
  publicUrl: string;
  access: "public" | "password";
  status: ShareStatus;
  startedAt: number;
  /** Why it ended (shown to the user), when status is "ended". */
  endMessage?: string;
  stopReason?: StopReason;
};

export class ShareError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

export type ShareManagerDeps = {
  api: () => Api | null;
  userAgent: string;
  hostHeader?: () => "rewrite" | "preserve";
  onChange: () => void;
  /** Never receives tokens or passwords. */
  log?: (line: string) => void;
  onRequest?: (share: Share, entry: { method: string; path: string; status: number; ms: number; websocket?: boolean }) => void;
  connectTimeoutMs?: number;
};

const END_MESSAGES: Record<StopReason, string> = {
  user: "You stopped sharing.",
  auth: "Your Localians sign-in was revoked or expired. Sign in again to keep sharing.",
  ended: "This preview was stopped from the dashboard or has expired.",
  fatal: "The connection to Localians failed.",
};

/**
 * Runs previews from VS Code with the CLI's tunnel agent. A share only counts as connected once the gateway has
 * accepted the tunnel (the agent's "connected" state), never before.
 */
export class ShareManager {
  private readonly shares = new Map<string, { share: Share; stop: () => void; done: Promise<StopReason> }>();

  constructor(private readonly deps: ShareManagerDeps) {}

  list(): Share[] {
    return [...this.shares.values()].map((s) => s.share).sort((a, b) => a.startedAt - b.startedAt);
  }

  get(sessionId: string) {
    return this.shares.get(sessionId)?.share;
  }

  activeForPort(port: number) {
    return this.list().find((s) => s.port === port && s.status !== "ended");
  }

  /** Starts sharing and resolves once the gateway confirms the tunnel (or rejects with a readable reason). */
  async start(input: { port: number; address: LoopbackAddress; project: { id: string; name: string } }): Promise<Share> {
    const api = this.deps.api();
    if (!api) throw new ShareError("Connect to Localians first.", "signed_out");
    if (this.activeForPort(input.port)) throw new ShareError(`localhost:${input.port} is already being shared.`, "already_sharing");

    let session;
    try {
      session = await api.createTunnel(input.project.id, input.port);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) throw new ShareError("Your Localians sign-in expired or was revoked. Sign in again.", "auth");
        if (error.status === 404) throw new ShareError("That project no longer exists, or you lost access to it.", "not_found");
        throw new ShareError(error.message, error.code); // quota, limits, server unavailable: the server's message says why
      }
      throw error;
    }

    const share: Share = {
      sessionId: session.sessionId,
      port: input.port,
      projectId: session.project.id,
      projectName: session.project.name,
      publicUrl: session.publicUrl,
      access: session.access === "password" ? "password" : "public",
      status: "connecting",
      startedAt: Date.now(),
    };
    this.deps.log?.(`Starting preview for ${share.projectName} (localhost:${share.port}) → ${share.publicUrl}`);

    let first: string | null = session.connectToken;
    let resolveConnected!: () => void;
    let rejectConnected!: (e: Error) => void;
    const connected = new Promise<void>((res, rej) => {
      resolveConnected = res;
      rejectConnected = rej;
    });

    const agent = startAgent({
      gatewayUrl: session.gatewayUrl,
      localPort: input.port,
      localAddress: input.address,
      hostHeader: this.deps.hostHeader?.() ?? "rewrite",
      userAgent: this.deps.userAgent,
      getConnectToken: async () => {
        if (first) {
          const t = first;
          first = null;
          return t;
        }
        return api.connectToken(share.sessionId);
      },
      onRequest: this.deps.onRequest ? (entry) => this.deps.onRequest!(share, entry) : undefined,
      onState: (state: AgentState, info) => {
        if (state === "connected") {
          // The tunnel is up, but the gateway only routes traffic once Localians has confirmed the session.
          // Show Connected only after that confirmation.
          void this.confirm(api, share, () => agent.state === "connected").then((ok) => {
            if (!ok || share.status === "ended") return;
            share.status = "connected";
            this.deps.log?.(`Connected: ${share.publicUrl}`);
            resolveConnected();
            this.deps.onChange();
          });
        } else if (state === "reconnecting") {
          share.status = "reconnecting";
          this.deps.log?.(`Connection lost${info.reason ? ` (${info.reason})` : ""}; reconnecting in ${Math.ceil((info.delayMs ?? 0) / 1000)}s`);
        } else if (state === "stopped") {
          share.status = "ended";
          share.stopReason = info.stopReason;
          share.endMessage = info.stopReason && info.stopReason !== "fatal" ? END_MESSAGES[info.stopReason] : (info.reason ?? END_MESSAGES.fatal);
          if (info.stopReason === "ended" && info.reason) share.endMessage = info.reason;
          this.deps.log?.(`Stopped ${share.projectName}: ${share.endMessage}`);
          rejectConnected(new ShareError(share.endMessage, info.stopReason ?? "fatal"));
        }
        this.deps.onChange();
      },
    });
    this.shares.set(share.sessionId, { share, stop: () => agent.stop(), done: agent.done });
    this.deps.onChange();

    const timeout = this.deps.connectTimeoutMs ?? 45_000;
    const timer = setTimeout(() => rejectConnected(new ShareError("Localians didn't confirm the connection in time. Check your internet connection.", "timeout")), timeout);
    try {
      await connected;
      return share;
    } catch (error) {
      await this.stop(share.sessionId);
      this.shares.delete(share.sessionId);
      this.deps.onChange();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Waits until Localians reports the session as CONNECTED (i.e. the gateway is routing it). */
  private async confirm(api: Api, share: Share, stillUp: () => boolean, timeoutMs = 15_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && stillUp() && share.status !== "ended") {
      try {
        const { tunnels } = await api.listTunnels();
        if (tunnels.find((t) => t.id === share.sessionId)?.status === "CONNECTED") return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return false; // the agent reports the auth failure itself
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  /** Stops a share and closes its session on the server (best effort). Keeps it listed as ended. */
  async stop(sessionId: string) {
    const entry = this.shares.get(sessionId);
    if (!entry) return;
    if (entry.share.status !== "ended") {
      entry.stop();
      await Promise.race([entry.done, new Promise((r) => setTimeout(r, 3000))]);
    }
    try {
      await this.deps.api()?.closeTunnel(sessionId);
    } catch {
      // the gateway's disconnect report and the stale-session sweep end it anyway
    }
    this.deps.onChange();
  }

  /** Removes an ended share from the list. */
  dismiss(sessionId: string) {
    if (this.shares.get(sessionId)?.share.status === "ended") this.shares.delete(sessionId);
    this.deps.onChange();
  }

  async stopAll() {
    await Promise.all([...this.shares.keys()].map((id) => this.stop(id)));
  }

  /** Updates what the list shows after protection changed for a project. */
  markProtected(projectId: string) {
    for (const { share } of this.shares.values()) if (share.projectId === projectId) share.access = "password";
    this.deps.onChange();
  }
}
