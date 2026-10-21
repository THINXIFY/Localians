export type GatewayConfig = {
  /** Public listener (preview traffic + CLI tunnel connections). */
  host: string;
  port: number;
  /** PEM certificate/key for TLS. When absent the gateway serves plain HTTP (local simulation only). */
  tls: { cert: string; key: string } | null;
  /** Previews are served at `<label>.<previewDomain>`. */
  previewDomain: string;
  /** Hostname the CLI connects to (production: tunnel.localians.com). */
  tunnelHost: string;
  /** Scheme public visitors use; `https` whenever TLS terminates here or at a fronting proxy. */
  publicProto: "http" | "https";
  /** Shared HS256 secret used by the control plane to sign connect tokens. */
  tokenSecret: Uint8Array;
  controlPlane: { url: string; apiSecret: string };
  gatewayId: string;
  /**
   * Private admin listener: health, metrics and the control API the web app uses to list and
   * terminate tunnels (bearer GATEWAY_API_SECRET). null disables it; 0 picks a free port.
   */
  adminPort: number | null;
  /** Interface for the admin listener. Keep it loopback or a private network address. */
  adminHost: string;
  /** Proxies whose X-Forwarded-For may be trusted (exact IPs). */
  trustedProxies: string[];
  limits: {
    maxTunnels: number;
    maxStreamsPerTunnel: number;
    maxRequestBodyBytes: number;
    maxResponseBytes: number;
    /** Max time for the local app to start responding. */
    responseTimeoutMs: number;
    /** Max idle time on a streaming body. */
    idleTimeoutMs: number;
    requestsPerSecondPerTunnel: number;
    requestsPerSecondPerIp: number;
  };
  heartbeatIntervalMs: number;
  pingTimeoutMs: number;
};

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

export function loadGatewayConfig(env: Env, readFile: (path: string) => string): GatewayConfig {
  const tokenSecret = required(env, "TUNNEL_TOKEN_SECRET");
  const apiSecret = required(env, "GATEWAY_API_SECRET");
  if (tokenSecret.length < 32 || apiSecret.length < 32) throw new Error("TUNNEL_TOKEN_SECRET and GATEWAY_API_SECRET must be at least 32 characters.");
  const certPath = env.GATEWAY_TLS_CERT_FILE?.trim();
  const keyPath = env.GATEWAY_TLS_KEY_FILE?.trim();
  const tls = certPath && keyPath ? { cert: readFile(certPath), key: readFile(keyPath) } : null;

  return {
    host: env.GATEWAY_HOST ?? "0.0.0.0",
    port: num(env.GATEWAY_PORT, tls ? 443 : 8080),
    tls,
    previewDomain: required(env, "TUNNEL_PREVIEW_DOMAIN").toLowerCase(),
    tunnelHost: required(env, "GATEWAY_TUNNEL_HOST").toLowerCase(),
    publicProto: env.TUNNEL_PUBLIC_SCHEME === "http" ? "http" : tls || env.GATEWAY_BEHIND_TLS_PROXY === "1" ? "https" : "http",
    tokenSecret: new TextEncoder().encode(tokenSecret),
    controlPlane: { url: required(env, "CONTROL_PLANE_URL").replace(/\/+$/, ""), apiSecret },
    gatewayId: env.GATEWAY_ID ?? `gw-${process.pid}`,
    adminPort: env.GATEWAY_ADMIN_PORT ? num(env.GATEWAY_ADMIN_PORT, 8444) : null,
    adminHost: env.GATEWAY_ADMIN_HOST?.trim() || "127.0.0.1",
    trustedProxies: (env.GATEWAY_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    limits: {
      maxTunnels: num(env.GATEWAY_MAX_TUNNELS, 1000),
      maxStreamsPerTunnel: num(env.GATEWAY_MAX_STREAMS_PER_TUNNEL, 100),
      maxRequestBodyBytes: num(env.GATEWAY_MAX_REQUEST_BODY_BYTES, 25 * 1024 * 1024),
      maxResponseBytes: num(env.GATEWAY_MAX_RESPONSE_BYTES, 512 * 1024 * 1024),
      responseTimeoutMs: num(env.GATEWAY_RESPONSE_TIMEOUT_MS, 60_000),
      idleTimeoutMs: num(env.GATEWAY_IDLE_TIMEOUT_MS, 120_000),
      requestsPerSecondPerTunnel: num(env.GATEWAY_RPS_PER_TUNNEL, 100),
      requestsPerSecondPerIp: num(env.GATEWAY_RPS_PER_IP, 50),
    },
    heartbeatIntervalMs: num(env.GATEWAY_HEARTBEAT_MS, 20_000),
    pingTimeoutMs: num(env.GATEWAY_PING_TIMEOUT_MS, 10_000),
  };
}
