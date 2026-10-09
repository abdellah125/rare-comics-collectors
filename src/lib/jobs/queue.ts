import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";

/**
 * Database-backed background jobs.
 *
 * - `enqueueJob` is called from request handlers (email, payouts, cleanup…).
 * - `processJobs` is invoked by the in-process worker (instrumentation.ts on a
 *   Node server), by /api/jobs/run for cron-driven hosts, and right after the
 *   response that queued a job when there is no worker (serverless).
 * - Recurring jobs re-schedule themselves from their handler.
 */
export type JobType =
  | "send_email"
  | "fetch_exchange_rates"
  | "expire_unpaid_orders"
  | "auto_complete_orders"
  | "schedule_payouts"
  | "cleanup_expired"
  | "broadcast_email"
  | "retry_webhook"
  | "recompute_seller_stats"
  | "indexnow_ping"
  | "indexnow_sync"
  | "catalog_release"
  | "reconcile_payments"
  | "crypto_check"
  | "content_tick"
  | "content_backlog"
  | "seo_sync"
  | "seo_audit"
  | "import_prepare"
  | "import_sync"
  | "import_seo"
  | "import_crawl"
  | "import_fix"
  | "import_auto_release"
  | "import_release_approved";

/**
 * The jobs that keep themselves scheduled: each handler queues its next run. This list is what
 * ensureRecurringJobs schedules and what the admin health view checks. `everyMinutes` is the
 * normal gap between runs; a job is overdue when its next run is this late again.
 */
export const RECURRING_JOBS: { type: JobType; everyMinutes: number; what: string }[] = [
  { type: "expire_unpaid_orders", everyMinutes: 15, what: "Cancels unpaid orders whose reservation ran out" },
  { type: "crypto_check", everyMinutes: 2, what: "Checks the blockchain for open crypto payments" },
  { type: "reconcile_payments", everyMinutes: 30, what: "Books card and PayPal payments a webhook missed" },
  { type: "auto_complete_orders", everyMinutes: 6 * 60, what: "Completes delivered orders after the return window" },
  { type: "fetch_exchange_rates", everyMinutes: 6 * 60, what: "Refreshes currency exchange rates" },
  { type: "cleanup_expired", everyMinutes: 12 * 60, what: "Removes expired sessions, tokens and old job rows" },
  { type: "schedule_payouts", everyMinutes: 24 * 60, what: "Schedules seller payouts" },
  { type: "catalog_release", everyMinutes: 24 * 60, what: "Releases the day's scheduled catalogue listings" },
  { type: "import_auto_release", everyMinutes: 15, what: "Daily release rule for approved imports" },
  { type: "import_sync", everyMinutes: 24 * 60, what: "Price and availability sync of imported listings" },
  { type: "indexnow_sync", everyMinutes: 7 * 24 * 60, what: "Tells search engines about changed pages" },
  { type: "seo_sync", everyMinutes: 7 * 24 * 60, what: "Weekly SEO Intelligence refresh (free sources)" },
  { type: "content_tick", everyMinutes: 5, what: "Content pipeline: plan, write, check, publish" },
  { type: "content_backlog", everyMinutes: 24 * 60, what: "Topic backlog from SEO Intelligence" },
];

/** A running job whose lock is older than this is taken to be dead. */
export const STALE_LOCK_MS = 3 * 60_000;

export type JobHandler = (payload: Record<string, unknown>, ctx: { jobId: string; attempt: number }) => Promise<void>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; maxAttempts?: number; dedupe?: boolean } = {},
): Promise<string> {
  if (opts.dedupe) {
    // Only a waiting copy counts here: a handler queues its own next run while its row is still "running".
    const existing = await db.job.findFirst({ where: { type, status: "pending" }, select: { id: true } });
    if (existing) return existing.id;
  }
  const job = await db.job.create({
    data: {
      type,
      payloadJson: JSON.stringify(payload),
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
  kickWorker(job.runAt);
  return job.id;
}

/**
 * Without a polling worker (JOBS_INLINE_WORKER=false, or any Vercel deployment) a
 * freshly queued job would wait for the next cron tick. `after()` runs once the
 * response has been sent, and the platform keeps the function alive for it.
 */
function kickWorker(runAt: Date) {
  if (runAt.getTime() > Date.now() + 1_000) return;
  driveJobsAfterResponse();
}

let draining = false;
let lastTrafficKick = 0;

/**
 * Serverless hosts without a per-minute cron (Vercel Hobby allows one run a day)
 * still get timely housekeeping: any storefront or admin request may schedule a
 * drain after its response, at most once every 30 seconds per instance. The
 * queue itself is safe to drain from many instances at once.
 */
export function driveJobsOnTraffic(): void {
  if (process.env.JOBS_INLINE_WORKER !== "false" && !process.env.VERCEL) return;
  const now = Date.now();
  if (now - lastTrafficKick < 30_000) return;
  lastTrafficKick = now;
  driveJobsAfterResponse();
}

/**
 * Serverless drain: once the current response is sent, make sure the recurring jobs
 * are scheduled and run a few due ones. No-op where the polling worker exists.
 * Cheap enough to call from every admin page render, so ordinary traffic keeps the
 * queue moving even when no cron is configured.
 */
export function driveJobsAfterResponse(): void {
  if (process.env.JOBS_INLINE_WORKER !== "false" && !process.env.VERCEL) return;
  if (draining) return;
  try {
    after(async () => {
      if (draining) return;
      draining = true;
      try {
        const { registerJobHandlers, ensureRecurringJobs } = await import("@/lib/jobs/handlers");
        registerJobHandlers();
        await ensureRecurringJobs().catch((err) => console.error("[jobs] could not schedule recurring jobs", err));
        await processJobs(25).catch((err) => console.error("[jobs] post-response drain failed", err));
      } finally {
        draining = false;
      }
    });
  } catch {
    // Not inside a request (e.g. queued by another job): the cron picks it up.
  }
}

/** One drain starts no new job after this long, so the last one still has time to finish inside the function's limit. */
const DRAIN_BUDGET_MS = 25_000;

/** Claims and runs due jobs. Safe to call concurrently: claiming is an atomic conditional update. */
export async function processJobs(limit = 25): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  const now = new Date();
  const due = await db.job.findMany({
    where: {
      status: { in: ["pending", "running"] },
      runAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } }],
    },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true, type: true, payloadJson: true, attempts: true, maxAttempts: true, lockedAt: true },
  });

  const started = Date.now();
  for (const job of due) {
    if (Date.now() - started > DRAIN_BUDGET_MS) break; // the rest is due on the next drain
    // Cut off (never reported back) as often as it may be tried: give up on this row. A recurring
    // job is scheduled afresh by ensureRecurringJobs on the next drain.
    if (job.lockedAt && job.attempts >= job.maxAttempts) {
      await db.job.updateMany({ where: { id: job.id, lockedAt: job.lockedAt }, data: { status: "failed", lockedAt: null, lastError: "The job was cut off before it finished (function time limit) on every attempt." } });
      failed += 1;
      continue;
    }
    const claimed = await db.job.updateMany({
      where: { id: job.id, lockedAt: job.lockedAt, status: { in: ["pending", "running"] } },
      data: { status: "running", lockedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue; // another worker got it
    const handler = handlers.get(job.type as JobType);
    const attempt = job.attempts + 1;
    try {
      if (!handler) throw new Error(`No handler registered for job type "${job.type}"`);
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(job.payloadJson) as Record<string, unknown>;
      } catch {
        payload = {};
      }
      await handler(payload, { jobId: job.id, attempt });
      await db.job.update({ where: { id: job.id }, data: { status: "completed", completedAt: new Date(), lockedAt: null, lastError: null } });
      processed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = attempt >= job.maxAttempts;
      const backoffMs = Math.min(6 * 3_600_000, 30_000 * 2 ** (attempt - 1));
      await db.job.update({
        where: { id: job.id },
        data: {
          status: exhausted ? "failed" : "pending",
          lockedAt: null,
          lastError: message.slice(0, 1000),
          runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
        },
      });
      console.error(`[jobs] ${job.type} failed (attempt ${attempt}/${job.maxAttempts}): ${message}`);
    }
  }
  return { processed, failed };
}

export async function retryJob(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "pending", runAt: new Date(), lockedAt: null, attempts: 0, lastError: null } });
}

export async function cancelJob(jobId: string) {
  await db.job.update({ where: { id: jobId }, data: { status: "cancelled", lockedAt: null } });
}

/** When the queue was last driven from outside, for the admin health view. Never throws. */
export async function noteDrain(source: "tick" | "cron", result: { processed: number; failed: number }) {
  const key = source === "cron" ? "jobs.lastCron" : "jobs.lastTick";
  const value = JSON.stringify({ at: new Date().toISOString(), ...result });
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } }).catch(() => {});
}

/**
 * Schedules a recurring job unless a copy is waiting or running right now. (While one runs, it
 * queues its own next run when it finishes; adding one "due now" beside it would make it run twice.)
 */
export async function ensureScheduled(type: JobType): Promise<void> {
  const active = await db.job.findFirst({ where: { type, OR: [{ status: "pending" }, { status: "running", lockedAt: { gte: new Date(Date.now() - STALE_LOCK_MS) } }] }, select: { id: true } });
  if (!active) await enqueueJob(type, {}, { dedupe: true });
}

export function registeredJobTypes(): JobType[] {
  return [...handlers.keys()];
}
