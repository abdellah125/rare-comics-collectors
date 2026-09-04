import "server-only";

/**
 * Fixed-window rate limiter kept in process memory.
 *
 * Good enough for a single Node server (the default deployment). When running
 * several instances behind a load balancer, swap the store for Redis — the
 * call sites only depend on `rateLimit()`.
 */
type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
let sweepAt = Date.now() + 60_000;

function sweep(now: number) {
  if (now < sweepAt) return;
  sweepAt = now + 60_000;
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) return { ok: false, remaining: 0, retryAfterSeconds };
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds };
}

/** Clears a bucket, e.g. after a successful login so a legitimate user isn't penalised. */
export function resetRateLimit(key: string) {
  store.delete(key);
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many attempts. Try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) throw new RateLimitError(r.retryAfterSeconds);
}
