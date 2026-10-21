import "server-only";
import { prisma } from "./db";

/**
 * Fixed-window rate limiter shared by every web instance: one atomic upsert per hit on
 * `rate_limit_windows` (PostgreSQL), so limits hold no matter which instance serves the
 * request. (The tunnel gateway keeps its own per-process limits for request-level traffic,
 * which must not cost a database round trip.)
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_windows ("key", "windowStart", "count", "expiresAt")
    VALUES (${key.slice(0, 200)}, ${new Date(start)}, 1, ${new Date(start + windowMs)})
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = rate_limit_windows."count" + 1
    RETURNING "count"`;
  // Bounded storage: occasionally drop finished windows.
  if (Math.random() < 0.02) void prisma.rateLimitWindow.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => {});
  const count = Number(rows[0]?.count ?? 1);
  return { allowed: count <= max, retryAfterS: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
}

/**
 * Client IP for rate-limit keys: the *rightmost* X-Forwarded-For entry, i.e. the one
 * appended by the nearest proxy. Leftmost entries are client-controlled and trivially
 * spoofed. Deploy behind a reverse proxy that sets/appends X-Forwarded-For (Vercel,
 * Cloudflare, nginx `$proxy_add_x_forwarded_for`); without one, Next.js only fills the
 * header when the client didn't send it.
 */
export function clientIp(request: Request) {
  const chain = request.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return chain[chain.length - 1] || "unknown";
}

/** Numeric limit from the environment (operators can tune limits without a deploy). */
export function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
