import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by the database, so every instance of a
 * serverless deployment shares the same counters. One atomic upsert either
 * opens a new window or increments the current one. If the database cannot be
 * reached the process-local limiter takes over, so an outage never turns a
 * login endpoint into an unlimited one.
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };
const local = new Map<string, Bucket>();
let sweepAt = Date.now() + 60_000;

function sweepLocal(now: number) {
  if (now < sweepAt) return;
  sweepAt = now + 60_000;
  for (const [k, b] of local) if (b.resetAt <= now) local.delete(k);
}

/** Process-local variant: unit tests and the fallback when the database is down. */
export function rateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweepLocal(now);
  const bucket = local.get(key);
  if (!bucket || bucket.resetAt <= now) {
    local.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
  bucket.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) return { ok: false, remaining: 0, retryAfterSeconds };
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds };
}

export function resetRateLimitMemory(key: string) {
  local.delete(key);
}

let warned = false;

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowMs);
  try {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${nextReset})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${nextReset} ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000));
    if (row.count > limit) return { ok: false, remaining: 0, retryAfterSeconds };
    return { ok: true, remaining: limit - row.count, retryAfterSeconds };
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("[rate-limit] database unavailable, falling back to the process-local limiter", err);
    }
    return rateLimitMemory(key, limit, windowMs);
  }
}

/** Clears a bucket, e.g. after a successful login so a legitimate user isn't penalised. */
export async function resetRateLimit(key: string) {
  local.delete(key);
  await db.rateLimitBucket.deleteMany({ where: { key } }).catch(() => {});
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many attempts. Try again in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  const r = await rateLimit(key, limit, windowMs);
  if (!r.ok) throw new RateLimitError(r.retryAfterSeconds);
}

/** Housekeeping (cleanup job): windows that closed more than a day ago are dead weight. */
export async function sweepRateLimitBuckets(): Promise<number> {
  const r = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 86_400_000) } } });
  return r.count;
}
