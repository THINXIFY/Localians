/** Token bucket keyed by string (tunnel label or client IP). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private ratePerSecond: number,
    private burst = ratePerSecond * 2,
  ) {}

  take(key: string, now = Date.now()) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size > 50_000) this.prune(now);
      bucket = { tokens: this.burst, updated: now };
      this.buckets.set(key, bucket);
    }
    bucket.tokens = Math.min(this.burst, bucket.tokens + ((now - bucket.updated) / 1000) * this.ratePerSecond);
    bucket.updated = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  private prune(now: number) {
    for (const [key, b] of this.buckets) if (now - b.updated > 60_000) this.buckets.delete(key);
  }
}

/** Remembers used connect-token IDs until they expire, so a token can only be used once. */
export class ReplayGuard {
  private seen = new Map<string, number>();

  use(jti: string, expiresAtMs: number, now = Date.now()) {
    for (const [id, exp] of this.seen) if (exp <= now) this.seen.delete(id);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs);
    return true;
  }
}
