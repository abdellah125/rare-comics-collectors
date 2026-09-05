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
  | "recompute_seller_stats";

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
        await processJobs(10).catch((err) => console.error("[jobs] post-response drain failed", err));
      } finally {
        draining = false;
      }
    });
  } catch {
    // Not inside a request (e.g. queued by another job): the cron picks it up.
  }
}

const STALE_LOCK_MS = 10 * 60_000;

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

  for (const job of due) {
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

export function registeredJobTypes(): JobType[] {
  return [...handlers.keys()];
}
