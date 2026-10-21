import "server-only";
import type { AccessPolicy, GatewayTerminateResponse, GatewayTunnelsResponse } from "@tunnel/shared/protocol";

/**
 * Client for the gateways' private control APIs (see tunnel/shared/protocol.ts). Never used
 * from browsers. Requests carry the shared GATEWAY_API_SECRET.
 *
 * - One gateway: `GATEWAY_CONTROL_URL=http://127.0.0.1:8444`.
 * - Several: `GATEWAY_CONTROL_URLS="gw-eu=http://10.0.0.5:8444,gw-us=http://10.0.1.5:8444"`, keyed by each
 *   gateway's GATEWAY_ID. Commands for a session go to the gateway that reported it.
 */
type Target = { id: string | null; url: string };

function secret() {
  const value = process.env.GATEWAY_API_SECRET;
  return value && value.length >= 32 ? value : null;
}

function targets(): Target[] {
  const list: Target[] = [];
  for (const entry of (process.env.GATEWAY_CONTROL_URLS ?? "").split(",")) {
    const match = /^\s*([A-Za-z0-9_-]{1,64})\s*=\s*(https?:\/\/\S+?)\/*\s*$/.exec(entry);
    if (match) list.push({ id: match[1], url: match[2] });
  }
  const single = process.env.GATEWAY_CONTROL_URL?.trim().replace(/\/+$/, "");
  if (single && !list.some((t) => t.url === single)) list.push({ id: null, url: single });
  return list;
}

export const gatewayControlConfigured = () => secret() !== null && targets().length > 0;

/** The gateway that should receive commands about a session (its own, if known). */
function targetFor(gatewayId: string | null | undefined) {
  const all = targets();
  return (gatewayId ? all.find((t) => t.id === gatewayId) : undefined) ?? all.find((t) => t.id === null) ?? (all.length === 1 ? all[0] : undefined);
}

async function call<T>(target: Target, method: "GET" | "POST", path: string, timeoutMs: number, body?: unknown): Promise<T | null> {
  const key = secret();
  if (!key) return null;
  try {
    const response = await fetch(`${target.url}${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export type TerminateResult =
  | { delivered: true; terminated: number; routing: boolean }
  | { delivered: false; reason: "not_configured" | "unreachable" };

/** Asks the session's gateway to close its tunnel now and refuse reconnects. */
export async function terminateOnGateway(sessionId: string, gatewayId?: string | null): Promise<TerminateResult> {
  const target = secret() ? targetFor(gatewayId) : undefined;
  if (!target) return { delivered: false, reason: "not_configured" };
  const result = await call<GatewayTerminateResponse>(target, "POST", `/v1/sessions/${encodeURIComponent(sessionId)}/terminate`, 4000);
  if (!result) return { delivered: false, reason: "unreachable" };
  live.cached = null; // the routing table just changed
  return { delivered: true, terminated: result.terminated, routing: result.routing };
}

/** Applies a new access policy on the session's gateway immediately. Returns false if it couldn't be delivered. */
export async function pushPolicyToGateway(sessionId: string, gatewayId: string | null, policy: AccessPolicy) {
  const target = secret() ? targetFor(gatewayId) : undefined;
  if (!target) return false;
  return (await call<{ applied: number }>(target, "POST", `/v1/sessions/${encodeURIComponent(sessionId)}/policy`, 4000, policy)) !== null;
}

/** Tunnels each reachable gateway is routing right now, keyed by gateway id. */
export type LiveTunnels = { gateways: Map<string, Set<string>> };

type LiveCache = { cached: { at: number; value: LiveTunnels | null } | null; inflight: Promise<LiveTunnels | null> | null };

// One snapshot per process, shared by route handlers and page renders (separate module
// instances in production builds). The live-update stream and the page it refreshes must
// read the same snapshot, or a refresh can render an older view than the change it announced.
const store = globalThis as typeof globalThis & { __localiansLiveTunnels?: LiveCache };
const live = (store.__localiansLiveTunnels ??= { cached: null, inflight: null });

/**
 * The routing tables of the configured gateways — the authority for "Connected". null when no
 * gateway can be asked (callers then fall back to heartbeat freshness). Cached for 2 s.
 */
export async function getLiveTunnels(): Promise<LiveTunnels | null> {
  if (live.cached && Date.now() - live.cached.at < 2000) return live.cached.value;
  live.inflight ??= Promise.all(targets().map((t) => call<GatewayTunnelsResponse>(t, "GET", "/v1/tunnels", 1500)))
    .then((results) => {
      const gateways = new Map<string, Set<string>>();
      for (const r of results) if (r) gateways.set(r.gatewayId, new Set(r.tunnels.map((t) => t.sessionId)));
      return gateways.size ? { gateways } : null;
    })
    .then((value) => {
      live.cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      live.inflight = null;
    });
  return live.inflight;
}

/** Tests flip gateway availability; drop the cache so they observe it immediately. */
export function resetLiveTunnelCache() {
  live.cached = null;
}
