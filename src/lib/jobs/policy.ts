/**
 * The queue's rules, kept free of the database and of Next.js so they can be unit-tested:
 * leases, retry delays, error classes, priorities and payload redaction.
 */

const num = (value: string | undefined, fallback: number, min: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

/** Tunable from the environment; the defaults suit a 60-second serverless function. */
export function queueConfig() {
  const leaseMs = num(process.env.JOBS_LEASE_MS, 90_000, 15_000);
  return {
    /** A running job's lease. The worker renews it while the handler runs; once it lapses the worker is taken to be gone. */
    leaseMs,
    /** How often the lease is renewed: well inside the lease, so one slow renewal does not lose it. */
    heartbeatMs: Math.max(5_000, Math.floor(leaseMs / 4)),
    /** A handler still running after this long stops renewing its lease (it is hung), so it is recovered like a dead worker. */
    maxRunMs: num(process.env.JOBS_MAX_RUN_MS, 15 * 60_000, 60_000),
    backoffBaseMs: num(process.env.JOBS_BACKOFF_BASE_MS, 30_000, 1_000),
    backoffMaxMs: num(process.env.JOBS_BACKOFF_MAX_MS, 6 * 3_600_000, 60_000),
    /** Completed jobs older than this many days move to JobArchive. 0 switches archiving off. */
    archiveAfterDays: num(process.env.JOBS_ARCHIVE_DAYS, 30, 0),
  };
}

/** Rows written before leases existed have no leaseUntil: their lock counts as lapsed after this long. */
export const LEGACY_LOCK_MS = 3 * 60_000;

/** A retry that will not fix anything: bad payload, rejected configuration, a record that no longer exists. */
export class PermanentJobError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** Worth trying again later; `retryAfterMs` is the earliest sensible moment (e.g. a Retry-After header). */
export class TransientJobError extends Error {
  readonly permanent = false;
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = "TransientJobError";
  }
}

export type ErrorKind = "transient" | "permanent";

/** Unknown errors (network, database hiccups, timeouts) are treated as transient: the attempt limit still ends them. */
export function classifyError(err: unknown): { kind: ErrorKind; message: string; retryAfterMs?: number } {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000) || "Unknown error";
  if (err instanceof PermanentJobError || (err as { permanent?: unknown })?.permanent === true) return { kind: "permanent", message };
  const retryAfterMs = err instanceof TransientJobError ? err.retryAfterMs : undefined;
  return { kind: "transient", message, retryAfterMs };
}

/**
 * Delay before attempt `attempt + 1`: exponential (base · 2^(attempt-1)), capped, with "equal jitter"
 * (half fixed, half random) so jobs that failed together do not all come back in the same second.
 */
export function retryDelayMs(attempt: number, opts: { baseMs: number; maxMs: number; retryAfterMs?: number }, random = Math.random): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(exp / 2 + random() * (exp / 2));
  return Math.min(opts.maxMs, Math.max(jittered, opts.retryAfterMs ?? 0));
}

/** Higher first among due jobs. Anything customer- or money-facing goes before bulk work. */
const PRIORITY: Record<string, number> = {
  send_email: 50,
  retry_webhook: 50,
  crypto_check: 40,
  reconcile_payments: 40,
  expire_unpaid_orders: 40,
  auto_complete_orders: 30,
  schedule_payouts: 30,
  fetch_exchange_rates: 20,
  broadcast_email: 20,
  recompute_seller_stats: 10,
  indexnow_ping: 10,
  cleanup_expired: 0,
};
/** Bulk catalogue, SEO and content work. */
const LOW = -10;

export function jobPriority(type: string): number {
  return PRIORITY[type] ?? (/^(import_|content_|seo_|catalog_|indexnow_sync)/.test(type) ? LOW : 0);
}

/**
 * Types of which several rows may run at the same time. Every other type runs one row at a time:
 * recurring jobs, payouts and order sweeps, import chains and IndexNow must never overlap themselves.
 */
const PARALLEL = new Set(["send_email", "retry_webhook", "recompute_seller_stats"]);
export const isExclusiveType = (type: string) => !PARALLEL.has(type);

const SECRET_KEY = /(secret|token|password|passwd|apikey|api_key|authorization|cookie|signature|private|seed|mnemonic|otp)$|^code$/i;
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** A payload as the dashboard may show it: secrets replaced, email addresses masked, long text cut. */
export function redactPayload(payloadJson: string, maxLength = 4_000): string {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson);
  } catch {
    return "(payload is not valid JSON)";
  }
  const walk = (v: unknown, key = ""): unknown => {
    if (key && SECRET_KEY.test(key)) return "[redacted]";
    if (typeof v === "string") return v.replace(EMAIL, "$1***@$2");
    if (Array.isArray(v)) return v.length > 50 ? [...v.slice(0, 50).map((x) => walk(x)), `… ${v.length - 50} more`] : v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  const text = JSON.stringify(walk(value), null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n…` : text;
}

/** Error text as stored and shown: one line per cause, credentials in URLs masked. */
export function cleanError(message: string): string {
  return message.replace(/(\w+:\/\/)[^\s/@:]+:[^\s/@]+@/g, "$1***@").replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***").slice(0, 1000);
}
