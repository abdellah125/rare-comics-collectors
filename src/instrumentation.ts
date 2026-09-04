/**
 * Starts the in-process job worker on a long-running Node server. On
 * serverless hosts, leave this in place (it is harmless) and call
 * POST /api/jobs/run from a cron every minute instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOBS_INLINE_WORKER === "false") return;

  const { registerJobHandlers, ensureRecurringJobs } = await import("@/lib/jobs/handlers");
  const { processJobs } = await import("@/lib/jobs/queue");
  registerJobHandlers();

  const g = globalThis as unknown as { __rccJobWorker?: NodeJS.Timeout };
  if (g.__rccJobWorker) return;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processJobs(25);
    } catch (err) {
      console.error("[jobs] worker tick failed", err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => {
    ensureRecurringJobs().catch((err) => console.error("[jobs] could not schedule recurring jobs", err));
    void tick();
  }, 5_000);
  g.__rccJobWorker = setInterval(() => void tick(), 20_000);
  g.__rccJobWorker.unref?.();
}
