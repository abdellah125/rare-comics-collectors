import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LEGACY_LOCK_MS, PermanentJobError, classifyError, cleanError, isExclusiveType, jobPriority, queueConfig, retryDelayMs } from "@/lib/jobs/policy";

/**
 * Database-backed background jobs.
 *
 * - `enqueueJob` is called from request handlers (email, payouts, cleanup…).
 * - `processJobs` is invoked by the in-process worker (instrumentation.ts on a
 *   Node server), by /api/jobs/run for cron-driven hosts, by /api/jobs/tick, and right
 *   after the response that queued a job when there is no worker (serverless).
 * - Recurring jobs re-schedule themselves from their handler.
 *
 * Claiming and leases: a due row is claimed inside a transaction (a global advisory lock plus
 * FOR UPDATE SKIP LOCKED), which gives it a lease. While the handler runs, the worker renews the
 * lease (heartbeat). A worker that is gone — usually a serverless function stopped at its time
 * limit — stops renewing; once the lease has lapsed the row is recovered: recorded as abandoned
 * and either queued again with a delay or, when its attempts are used up, marked failed. Every
 * write that ends an attempt is conditional on the worker still holding the lease, so a recovered
 * job is never finished twice. Every attempt is kept in JobAttempt.
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
  { type: "cleanup_expired", everyMinutes: 12 * 60, what: "Removes expired sessions and tokens, archives old completed jobs" },
  { type: "schedule_payouts", everyMinutes: 24 * 60, what: "Schedules seller payouts" },
  { type: "catalog_release", everyMinutes: 24 * 60, what: "Releases the day's scheduled catalogue listings" },
  { type: "import_auto_release", everyMinutes: 15, what: "Daily release rule for approved imports" },
  { type: "import_sync", everyMinutes: 24 * 60, what: "Price and availability sync of imported listings" },
  { type: "indexnow_sync", everyMinutes: 7 * 24 * 60, what: "Tells search engines about changed pages" },
  { type: "seo_sync", everyMinutes: 7 * 24 * 60, what: "Weekly SEO Intelligence refresh (free sources)" },
  { type: "content_tick", everyMinutes: 5, what: "Content pipeline: plan, write, check, publish" },
  { type: "content_backlog", everyMinutes: 24 * 60, what: "Topic backlog from SEO Intelligence" },
];

export type JobContext = {
  jobId: string;
  attempt: number;
  /** Aborted when this worker has lost the job's lease (it was recovered elsewhere): stop as soon as convenient. */
  signal: AbortSignal;
};
/** A handler may return a short summary of what it did; it is stored on the job as its result. */
export type JobHandler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void | string>;

const handlers = new Map<JobType, JobHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

/** This process, as recorded on the jobs it claims. */
const WORKER_ID = `${process.env.VERCEL_REGION ?? "local"}:${process.pid}:${randomUUID().slice(0, 8)}`;

/** Postgres timestamps here are UTC without a zone; comparing through an explicit UTC conversion is independent of the session time zone. */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/**
 * Queues a job. With `dedupe`, at most one copy per key (the job type unless `dedupeKey` is given)
 * waits at a time: the existing one is returned instead. A partial unique index enforces this, so
 * two requests racing each other cannot both add one.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts: { runAt?: Date; maxAttempts?: number; dedupe?: boolean; dedupeKey?: string; priority?: number } = {},
): Promise<string> {
  const key = opts.dedupe || opts.dedupeKey ? (opts.dedupeKey ?? type) : null;
  const findWaiting = () =>
    db.job.findFirst({ where: { status: "pending", OR: [{ dedupeKey: key }, ...(key === type ? [{ type, dedupeKey: null }] : [])] }, select: { id: true } });
  if (key) {
    const existing = await findWaiting();
    if (existing) return existing.id;
  }
  // ON CONFLICT DO NOTHING: a copy queued by a concurrent request in the meantime wins, quietly.
  const [job] = await db.job.createManyAndReturn({
    data: [{ type, payloadJson: JSON.stringify(payload), runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5, priority: opts.priority ?? jobPriority(type), dedupeKey: key }],
    skipDuplicates: true,
    select: { id: true, runAt: true },
  });
  if (job) {
    kickWorker(job.runAt);
    return job.id;
  }
  const existing = await findWaiting();
  if (existing) return existing.id;
  throw new Error(`Could not queue ${type}: a waiting copy was reported but not found.`);
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

/** Running and its lease still valid (rows from before leases: locked less than LEGACY_LOCK_MS ago). */
export function leaseIsLive(job: { status: string; leaseUntil: Date | null; lockedAt: Date | null }, now = new Date()): boolean {
  if (job.status !== "running") return false;
  if (job.leaseUntil) return job.leaseUntil > now;
  return job.lockedAt !== null && job.lockedAt.getTime() > now.getTime() - LEGACY_LOCK_MS;
}

/** Where-clause for running rows whose worker is gone. */
export function abandonedWhere(now = new Date()): Prisma.JobWhereInput {
  return {
    status: "running",
    OR: [{ leaseUntil: { lt: now } }, { leaseUntil: null, OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - LEGACY_LOCK_MS) } }] }],
  };
}

type Claimed = { id: string; type: string; payloadJson: string; attempts: number; maxAttempts: number; dedupeKey: string | null; attemptId: string };

/**
 * Claims the most urgent due job, or null. Claims are serialised by a transaction-scoped advisory
 * lock (they take milliseconds), which also makes "one running row per exclusive type" exact.
 * Order: priority, raised by one point per ten minutes of waiting (at most 30), so bulk work that
 * has waited long still gets its turn; then the oldest due time.
 */
async function claimNext(now: Date, types?: string[]): Promise<Claimed | null> {
  const { leaseMs } = queueConfig();
  const parallel = registeredJobTypes().filter((t) => !isExclusiveType(t));
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4207150001)`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT c."id" FROM "Job" c
      WHERE c."status" = 'pending' AND c."runAt" <= ${utc(now)} ${types ? Prisma.sql`AND c."type" = ANY(${types}::text[])` : Prisma.empty}
        AND (c."type" = ANY(${parallel}::text[]) OR NOT EXISTS (
          SELECT 1 FROM "Job" r WHERE r."type" = c."type" AND r."status" = 'running'
            AND COALESCE(r."leaseUntil", r."lockedAt" + interval '3 minutes') > ${utc(now)}))
      ORDER BY c."priority" + LEAST(FLOOR(EXTRACT(EPOCH FROM (${utc(now)} - c."runAt")) / 600), 30) DESC, c."runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return null;
    const job = await tx.job.update({
      where: { id: rows[0].id },
      data: { status: "running", attempts: { increment: 1 }, lockedAt: now, startedAt: now, heartbeatAt: now, leaseUntil: new Date(now.getTime() + leaseMs), lockedBy: WORKER_ID },
      select: { id: true, type: true, payloadJson: true, attempts: true, maxAttempts: true, dedupeKey: true },
    });
    const attempt = await tx.jobAttempt.create({ data: { jobId: job.id, type: job.type, attempt: job.attempts, worker: WORKER_ID, startedAt: now }, select: { id: true } });
    return { ...job, attemptId: attempt.id };
  });
}

/**
 * Puts a job back in the queue for `runAt`, or — when another copy with the same dedupe key is
 * already waiting (a recurring job that queued its next run before failing) — marks this row
 * failed and brings that copy forward instead, so the job never runs twice side by side.
 * `guard` must match the row as the caller saw it; returns false when it no longer does.
 */
async function requeue(job: { id: string; dedupeKey: string | null }, guard: Prisma.JobWhereInput, runAt: Date, error: { message: string; at: Date } | null, extra: Prisma.JobUpdateManyMutationInput = {}, again = true): Promise<{ ok: boolean; foldedInto?: string }> {
  const release = { lockedAt: null, leaseUntil: null, lockedBy: null, ...extra };
  const sibling = job.dedupeKey ? await db.job.findFirst({ where: { dedupeKey: job.dedupeKey, status: "pending", id: { not: job.id } }, select: { id: true, runAt: true } }) : null;
  if (sibling) {
    const note = `not retried on its own: the next run (${sibling.id}) was already queued and has been brought forward`;
    const [r] = await db.$transaction([
      db.job.updateMany({ where: { ...guard, id: job.id }, data: { ...release, status: "failed", ...(error ? { lastError: `${error.message} — ${note}`, lastErrorAt: error.at } : {}) } }),
      db.job.updateMany({ where: { id: sibling.id, status: "pending", runAt: { gt: runAt } }, data: { runAt } }),
    ]);
    return { ok: r.count > 0, foldedInto: sibling.id };
  }
  try {
    const r = await db.job.updateMany({ where: { ...guard, id: job.id }, data: { ...release, status: "pending", runAt, ...(error ? { lastError: error.message, lastErrorAt: error.at } : {}) } });
    return { ok: r.count > 0 };
  } catch (err) {
    // A copy was queued between the check and the update: fold into it.
    if (again && isUniqueViolation(err)) return requeue(job, guard, runAt, error, extra, false);
    throw err;
  }
}

/**
 * Recovers running jobs whose worker is gone (lease lapsed without a heartbeat). Each is checked
 * and released with a conditional update, so a worker that is in fact alive and renews its lease
 * at the same moment keeps the job, and two recoverers never both release it.
 */
export async function recoverAbandonedJobs(now = new Date(), opts: { ids?: string[]; types?: string[]; limit?: number } = {}): Promise<number> {
  const cfg = queueConfig();
  const rows = await db.job.findMany({
    where: { ...abandonedWhere(now), ...(opts.ids ? { id: { in: opts.ids } } : {}), ...(opts.types ? { type: { in: opts.types } } : {}) },
    orderBy: { leaseUntil: "asc" },
    take: opts.limit ?? 50,
    select: { id: true, type: true, attempts: true, maxAttempts: true, lockedBy: true, leaseUntil: true, lockedAt: true, heartbeatAt: true, startedAt: true, dedupeKey: true },
  });
  let recovered = 0;
  for (const job of rows) {
    const seen = job.heartbeatAt ?? job.lockedAt;
    const reason = `Abandoned on attempt ${job.attempts}: the worker${job.lockedBy ? ` ${job.lockedBy}` : ""} stopped reporting (last heartbeat ${seen ? seen.toISOString() : "never"}${job.leaseUntil ? `, lease expired ${job.leaseUntil.toISOString()}` : ""}). Most likely the function was stopped at its time limit.`;
    const exhausted = job.attempts >= job.maxAttempts;
    const guard: Prisma.JobWhereInput = { status: "running", lockedBy: job.lockedBy, leaseUntil: job.leaseUntil, lockedAt: job.lockedAt };
    const retryAt = exhausted ? null : new Date(now.getTime() + retryDelayMs(job.attempts, { baseMs: cfg.backoffBaseMs, maxMs: cfg.backoffMaxMs }));
    let ok: boolean;
    if (retryAt) ok = (await requeue(job, guard, retryAt, { message: reason, at: now })).ok;
    else ok = (await db.job.updateMany({ where: { ...guard, id: job.id }, data: { status: "failed", lockedAt: null, leaseUntil: null, lockedBy: null, lastError: `${reason} No attempts left.`, lastErrorAt: now } })).count > 0;
    if (!ok) continue;
    recovered += 1;
    const open = await db.jobAttempt.findFirst({ where: { jobId: job.id, outcome: "running" }, orderBy: { attempt: "desc" }, select: { id: true, startedAt: true } });
    const record = { finishedAt: now, outcome: "abandoned", errorKind: "lease_expired", error: reason, retryAt };
    if (open) await db.jobAttempt.update({ where: { id: open.id }, data: { ...record, durationMs: now.getTime() - open.startedAt.getTime() } });
    else await db.jobAttempt.create({ data: { ...record, jobId: job.id, type: job.type, attempt: job.attempts, worker: job.lockedBy ?? "unknown", startedAt: job.startedAt ?? job.lockedAt ?? now } });
    console.warn(`[jobs] recovered ${job.type} ${job.id}: ${exhausted ? "failed, no attempts left" : `retry at ${retryAt!.toISOString()}`}`);
  }
  return recovered;
}

export type DrainResult = {
  /** attempts that succeeded */
  processed: number;
  /** attempts that failed (some will be retried) */
  failed: number;
  /** of those, how many will be retried */
  retrying: number;
  /** abandoned jobs recovered before claiming */
  recovered: number;
  /** finished after this worker had lost the lease: the result was not written */
  lostLease: number;
  /** due jobs still waiting when the drain stopped */
  remainingDue: number;
  stoppedBy: "empty" | "limit" | "budget";
};

/**
 * Recovers abandoned jobs, then claims and runs due jobs one at a time until none is due, `limit`
 * have run, or the time budget is spent. `types` limits the drain to those job types.
 */
export async function processJobs(limit = 25, opts: { budgetMs?: number; types?: string[] } = {}): Promise<DrainResult> {
  const budget = opts.budgetMs ?? DRAIN_BUDGET_MS;
  const result: DrainResult = { processed: 0, failed: 0, retrying: 0, recovered: 0, lostLease: 0, remainingDue: 0, stoppedBy: "empty" };
  const started = Date.now();
  result.recovered = await recoverAbandonedJobs(new Date(), { types: opts.types });
  let ran = 0;
  for (;;) {
    if (ran >= limit) {
      result.stoppedBy = "limit";
      break;
    }
    if (Date.now() - started > budget) {
      result.stoppedBy = "budget"; // the rest is due on the next drain
      break;
    }
    const job = await claimNext(new Date(), opts.types);
    if (!job) break;
    ran += 1;
    const outcome = await runClaimed(job);
    if (outcome === "succeeded") result.processed += 1;
    else if (outcome === "lost") result.lostLease += 1;
    else {
      result.failed += 1;
      if (outcome === "retrying") result.retrying += 1;
    }
  }
  if (result.stoppedBy !== "empty") result.remainingDue = await db.job.count({ where: { status: "pending", runAt: { lte: new Date() }, ...(opts.types ? { type: { in: opts.types } } : {}) } });
  return result;
}

/** Runs one claimed job with a heartbeat, and records how the attempt ended. */
async function runClaimed(job: Claimed): Promise<"succeeded" | "retrying" | "failed" | "lost"> {
  const cfg = queueConfig();
  const begun = Date.now();
  const lease = new AbortController();
  const held = { id: job.id, status: "running", lockedBy: WORKER_ID } satisfies Prisma.JobWhereInput;
  const heartbeat = setInterval(() => {
    const now = new Date();
    if (now.getTime() - begun > cfg.maxRunMs) {
      // Hung: stop renewing, so the lease lapses and the job is recovered; tell the handler to stop.
      if (!lease.signal.aborted) lease.abort(new Error(`The job ran longer than ${Math.round(cfg.maxRunMs / 60_000)} min and was given up.`));
      return;
    }
    db.job
      .updateMany({ where: held, data: { heartbeatAt: now, leaseUntil: new Date(now.getTime() + cfg.leaseMs) } })
      .then((r) => {
        if (r.count === 0 && !lease.signal.aborted) lease.abort(new Error("The job's lease was lost: it was recovered by another worker."));
      })
      .catch((err) => console.error(`[jobs] heartbeat for ${job.type} ${job.id} failed`, err));
  }, cfg.heartbeatMs);
  heartbeat.unref?.();

  let summary: string | null = null;
  let failure: unknown = null;
  try {
    const handler = handlers.get(job.type as JobType);
    if (!handler) throw new PermanentJobError(`No handler registered for job type "${job.type}"`);
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(job.payloadJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      payload = parsed as Record<string, unknown>;
    } catch {
      // Running it with an empty payload would do something else than was asked (e.g. restart an import pass).
      throw new PermanentJobError("The payload is not a valid JSON object, so the job cannot be run as queued.");
    }
    const out = await handler(payload, { jobId: job.id, attempt: job.attempts, signal: lease.signal });
    summary = typeof out === "string" && out ? out.slice(0, 500) : null;
  } catch (err) {
    failure = err;
  } finally {
    clearInterval(heartbeat);
  }

  const now = new Date();
  const durationMs = now.getTime() - begun;
  if (failure === null) {
    const r = await db.job.updateMany({ where: held, data: { status: "completed", completedAt: now, lockedAt: null, leaseUntil: null, lockedBy: null, result: summary } });
    const ok = r.count > 0;
    await db.jobAttempt.update({ where: { id: job.attemptId }, data: { finishedAt: now, durationMs, outcome: ok ? "succeeded" : "lost_lease", error: ok ? null : "Finished after the lease had lapsed and the job had been recovered; this result was not recorded on the job." } });
    if (!ok) console.warn(`[jobs] ${job.type} ${job.id} finished after losing its lease; result discarded`);
    return ok ? "succeeded" : "lost";
  }

  const { kind, message: raw, retryAfterMs } = classifyError(failure);
  const message = cleanError(raw);
  const exhausted = kind === "permanent" || job.attempts >= job.maxAttempts;
  const retryAt = exhausted ? null : new Date(now.getTime() + retryDelayMs(job.attempts, { baseMs: cfg.backoffBaseMs, maxMs: cfg.backoffMaxMs, retryAfterMs }));
  const label = kind === "permanent" ? "permanent error, not retried" : exhausted ? `attempt ${job.attempts} of ${job.maxAttempts}, no attempts left` : `attempt ${job.attempts} of ${job.maxAttempts}`;
  const stored = `${message} (${label})`;
  let ok: boolean;
  if (retryAt) ok = (await requeue(job, held, retryAt, { message: stored, at: now })).ok;
  else ok = (await db.job.updateMany({ where: held, data: { status: "failed", lockedAt: null, leaseUntil: null, lockedBy: null, lastError: stored, lastErrorAt: now } })).count > 0;
  await db.jobAttempt.update({ where: { id: job.attemptId }, data: { finishedAt: now, durationMs, outcome: ok ? "failed" : "lost_lease", errorKind: kind, error: message, retryAt: ok ? retryAt : null } });
  console.error(`[jobs] ${job.type} ${job.id} failed (${label}): ${message}`);
  if (!ok) return "lost";
  return retryAt ? "retrying" : "failed";
}

export type JobActionResult = { ok: boolean; message: string };

/**
 * Manual retry. Failure history is kept (lastError stays, every attempt stays in JobAttempt) and
 * the job gets a fresh allowance of attempts. A job that is running and still renewing its lease
 * is left alone; one whose worker is gone is recovered first.
 */
export async function retryJob(jobId: string, now = new Date()): Promise<JobActionResult> {
  let job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Job not found." };
  if (job.status === "running") {
    if (leaseIsLive(job, now)) return { ok: false, message: "This job is running right now and its worker is still reporting. It will finish or, if the worker stops, be recovered automatically." };
    await recoverAbandonedJobs(now, { ids: [jobId] });
    job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  }
  if (job.status === "completed") return { ok: false, message: "This job has already completed. Queue a new run instead." };
  const allowance = Math.max(job.attempts + 1, job.attempts + Math.min(3, job.maxAttempts));
  const r = await requeue(job, { status: job.status, attempts: job.attempts }, now, null, { maxAttempts: allowance });
  if (!r.ok) return { ok: false, message: "The job changed while you were looking at it. Reload and try again." };
  if (r.foldedInto) return { ok: true, message: `Another run of this job (${r.foldedInto}) was already queued; it has been brought forward instead.` };
  return { ok: true, message: job.status === "pending" ? "The job will run on the next drain." : `Job queued again (up to ${allowance - job.attempts} more attempt${allowance - job.attempts === 1 ? "" : "s"}).` };
}

/** Cancels a waiting or failed job. A job that is running cannot be stopped from here; one whose worker is gone is recovered and then cancelled. */
export async function cancelJob(jobId: string, now = new Date()): Promise<JobActionResult> {
  let job = await db.job.findUnique({ where: { id: jobId }, select: { status: true, leaseUntil: true, lockedAt: true } });
  if (!job) return { ok: false, message: "Job not found." };
  if (job.status === "running") {
    if (leaseIsLive(job, now)) return { ok: false, message: "This job is running right now and cannot be stopped midway. Cancel it once it has finished or been recovered." };
    await recoverAbandonedJobs(now, { ids: [jobId] });
    job = await db.job.findUniqueOrThrow({ where: { id: jobId }, select: { status: true, leaseUntil: true, lockedAt: true } });
  }
  if (job.status !== "pending" && job.status !== "failed") return { ok: false, message: `A ${job.status} job cannot be cancelled.` };
  const r = await db.job.updateMany({ where: { id: jobId, status: job.status }, data: { status: "cancelled", lockedAt: null, leaseUntil: null, lockedBy: null } });
  return r.count > 0 ? { ok: true, message: "Job cancelled." } : { ok: false, message: "The job changed while you were looking at it. Reload and try again." };
}

/**
 * Moves completed jobs older than the retention window into JobArchive, in one statement per
 * batch (copy and remove happen together or not at all). Nothing is deleted: a row can be put back
 * with INSERT INTO "Job" (...) SELECT ... FROM "JobArchive". Failed and cancelled jobs, and the
 * attempt history, are never archived or removed.
 */
export async function archiveCompletedJobs(now = new Date(), batch = 2_000): Promise<number> {
  const days = queueConfig().archiveAfterDays;
  if (days <= 0) return 0;
  const cutoff = new Date(now.getTime() - Math.max(7, days) * 86_400_000);
  return db.$executeRaw`
    WITH moved AS (
      DELETE FROM "Job" WHERE "id" IN (
        SELECT "id" FROM "Job" WHERE "status" = 'completed' AND "completedAt" < ${utc(cutoff)} ORDER BY "completedAt" LIMIT ${batch}
      )
      RETURNING "id", "type", "payloadJson", "status", "runAt", "priority", "attempts", "maxAttempts", "lastError", "startedAt", "completedAt", "result", "createdAt"
    )
    INSERT INTO "JobArchive" ("id", "type", "payloadJson", "status", "runAt", "priority", "attempts", "maxAttempts", "lastError", "startedAt", "completedAt", "result", "createdAt")
    SELECT * FROM moved
    ON CONFLICT ("id") DO NOTHING`;
}

/** When the queue was last driven from outside, for the admin health view. Never throws. */
export async function noteDrain(source: "tick" | "cron", result: DrainResult) {
  const key = source === "cron" ? "jobs.lastCron" : "jobs.lastTick";
  const value = JSON.stringify({ at: new Date().toISOString(), ...result });
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } }).catch(() => {});
}

/**
 * Schedules a recurring job unless a copy is waiting or running right now. (While one runs, it
 * queues its own next run when it finishes; adding one "due now" beside it would make it run twice.)
 */
export async function ensureScheduled(type: JobType, now = new Date()): Promise<void> {
  const active = await db.job.findFirst({
    where: {
      type,
      OR: [{ status: "pending" }, { status: "running", leaseUntil: { gt: now } }, { status: "running", leaseUntil: null, lockedAt: { gte: new Date(now.getTime() - LEGACY_LOCK_MS) } }],
    },
    select: { id: true },
  });
  if (!active) await enqueueJob(type, {}, { dedupe: true });
}

export function registeredJobTypes(): JobType[] {
  return [...handlers.keys()];
}
