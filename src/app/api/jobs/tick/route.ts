import { ensureRecurringJobs, registerJobHandlers } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keeps the job queue moving on hosts without a frequent cron. The storefront pings this address
 * from the visitor's browser (see JobBeacon), so the queue is drained by a request of its own
 * with its own time limit instead of riding on a page render.
 *
 * It needs no secret because it takes no input and can only do what is already scheduled: every
 * job is claimed atomically, so calling it more often does nothing extra, and one instance starts
 * at most one drain every 20 seconds.
 */
let last = 0;
let running = false;

export async function GET() {
  const now = Date.now();
  if (running || now - last < 20_000) return Response.json({ ok: true, skipped: true }, { headers: { "cache-control": "no-store" } });
  last = now;
  running = true;
  try {
    registerJobHandlers();
    await ensureRecurringJobs().catch(() => {});
    const result = await processJobs(25);
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[jobs] tick failed", err);
    return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
  } finally {
    running = false;
  }
}
