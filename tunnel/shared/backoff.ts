/**
 * Exponential backoff with "full jitter" (AWS Architecture Blog): a random delay
 * between 0 and min(cap, base * 2^attempt), never below `min`.
 */
export function backoffDelay(attempt: number, { base = 1000, cap = 30_000, min = 250, random = Math.random } = {}) {
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.max(min, Math.round(random() * ceiling));
}
