import "server-only";
import { NotFoundError } from "../errors";
import { clientIp, rateLimit } from "../rate-limit";
import { authenticateCli, type CliAuth } from "./credentials";
import { safeEqual } from "./crypto";
import { TunnelError } from "./tunnels";

const NO_STORE = { "cache-control": "no-store" };

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

export const apiError = (status: number, error: string, message: string, headers: Record<string, string> = {}) =>
  json({ error, message }, status, headers);

export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const value = text ? JSON.parse(text) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Wraps a CLI endpoint: bearer auth, per-credential rate limit, and safe error mapping. */
export function withCliAuth(handler: (request: Request, auth: CliAuth, params: Record<string, string>) => Promise<Response>) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    const auth = await authenticateCli(request);
    if (!auth) {
      return apiError(401, "unauthorized", "Your CLI login is missing, expired or revoked. Run `localians login`.", { "www-authenticate": "Bearer" });
    }
    const limited = await rateLimit(`cli:${auth.credentialId}`, 120, 60_000);
    if (!limited.allowed) return apiError(429, "rate_limited", "Too many requests. Slow down and try again.", { "retry-after": String(limited.retryAfterS) });
    try {
      return await handler(request, auth, await context.params);
    } catch (error) {
      return mapError(error);
    }
  };
}

export function mapError(error: unknown) {
  if (error instanceof TunnelError) return apiError(error.status, error.code, error.message);
  if (error instanceof NotFoundError) return apiError(404, "not_found", "Not found, or you don't have access to it.");
  console.error("[cli-api]", error instanceof Error ? error.message : "unknown error");
  return apiError(500, "server_error", "Something went wrong on the Localians server.");
}

export async function limitByIp(request: Request, bucket: string, max: number, windowMs: number) {
  const limited = await rateLimit(`${bucket}:${clientIp(request)}`, max, windowMs);
  return limited.allowed ? null : apiError(429, "rate_limited", "Too many requests. Try again shortly.", { "retry-after": String(limited.retryAfterS) });
}

/** Server-to-server calls from the tunnel gateway: bearer GATEWAY_API_SECRET, compared in constant time. */
export function gatewayAuthError(request: Request) {
  const secret = process.env.GATEWAY_API_SECRET;
  if (!secret || secret.length < 32) return apiError(503, "gateway_api_disabled", "Gateway API is not configured.");
  const provided = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  return safeEqual(provided, secret) ? null : apiError(401, "unauthorized", "Unauthorized.");
}
