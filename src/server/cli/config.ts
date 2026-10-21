import "server-only";

export const CLI_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
export const DEVICE_POLL_INTERVAL_S = 5;
/** A connected tunnel with no gateway heartbeat for this long is expired. */
export const TUNNEL_STALE_AFTER_MS = 90 * 1000;
export const CONNECT_TOKEN_TTL_S = 120;

export type TunnelConfig = {
  previewDomain: string;
  publicScheme: "http" | "https";
  publicPort: number | null;
  gatewayUrl: string;
  tokenSecret: Uint8Array;
};

/**
 * Tunnel settings come only from the environment — no production domain is assumed.
 * Returns null when tunnels aren't configured on this server.
 */
export function getTunnelConfig(): TunnelConfig | null {
  const previewDomain = process.env.TUNNEL_PREVIEW_DOMAIN?.trim().toLowerCase();
  const gatewayUrl = process.env.TUNNEL_GATEWAY_URL?.trim();
  const secret = process.env.TUNNEL_TOKEN_SECRET;
  if (!previewDomain || !gatewayUrl || !secret || secret.length < 32) return null;
  const scheme = process.env.TUNNEL_PUBLIC_SCHEME === "http" ? "http" : "https";
  const port = process.env.TUNNEL_PUBLIC_PORT ? Number(process.env.TUNNEL_PUBLIC_PORT) : null;
  return {
    previewDomain,
    publicScheme: scheme,
    publicPort: port && Number.isInteger(port) && port > 0 && port < 65536 ? port : null,
    gatewayUrl: gatewayUrl.replace(/\/+$/, ""),
    tokenSecret: new TextEncoder().encode(secret),
  };
}

export function previewUrl(config: TunnelConfig, label: string) {
  const defaultPort = config.publicScheme === "https" ? 443 : 80;
  const port = config.publicPort && config.publicPort !== defaultPort ? `:${config.publicPort}` : "";
  return `${config.publicScheme}://${label}.${config.previewDomain}${port}`;
}

export const siteUrl = () => (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");

/** What the CLI setup instructions need: the server URL to log in to, and whether the gateway uses the local dev CA. */
export function cliSetupInfo() {
  const domain = getTunnelConfig()?.previewDomain ?? "";
  return { apiUrl: siteUrl(), localGateway: domain === "localhost" || domain.endsWith(".localhost") };
}

/**
 * How developers run the CLI. Until the owner publishes the `localians` npm package and sets
 * LOCALIANS_CLI_PUBLISHED=1, commands use the locally installed beta (`localians …`), never `npx`.
 * (Deliberately not auto-detected from the npm registry: someone else could publish that name.)
 */
export function cliInfo() {
  const published = process.env.LOCALIANS_CLI_PUBLISHED === "1";
  return { published, run: published ? "npx localians" : "localians", ...cliSetupInfo() };
}

const envInt = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/**
 * Usage limits, configurable per deployment:
 * - QUOTA_ACTIVE_PREVIEWS_PER_USER (default 5) previews shared at the same time,
 * - QUOTA_MAX_SHARE_HOURS (default 24) before a share ends by itself,
 * - QUOTA_DAILY_BANDWIDTH_MB (default 10240) of preview traffic per workspace per UTC day.
 * Per-gateway connection limits (tunnels, streams, request sizes, rates) are set on the gateway.
 */
export function quotas() {
  return {
    activePreviewsPerUser: envInt("QUOTA_ACTIVE_PREVIEWS_PER_USER", 5),
    maxShareMs: envInt("QUOTA_MAX_SHARE_HOURS", 24) * 60 * 60 * 1000,
    dailyBandwidthBytes: envInt("QUOTA_DAILY_BANDWIDTH_MB", 10_240) * 1024 * 1024,
  };
}
