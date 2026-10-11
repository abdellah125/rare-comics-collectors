/**
 * Recurring jobs keep themselves scheduled, and scheduling never doubles them up.
 *
 *   npx tsx --conditions=react-server tests/integration/jobs-recurring.ts
 *
 * Runs the real queue against the local database with the paid and network-bound jobs switched
 * to no-ops, so it is quick and costs nothing.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = new PrismaClient();
  const { RECURRING_JOBS, processJobs, registerJobHandler, enqueueJob, ensureScheduled } = await import("@/lib/jobs/queue");
  // (handlers.ts pulls in Next.js navigation, so its ensureRecurringJobs loop is repeated here: one ensureScheduled per recurring type.)
  const ensureRecurringJobs = async () => { for (const ty of RECURRING_JOBS.map((r) => r.type)) await ensureScheduled(ty); };
  const types = RECURRING_JOBS.map((r) => r.type);
  // Each recurring handler does what the real ones do at the end: queue its next run.
  for (const r of RECURRING_JOBS) registerJobHandler(r.type, async () => void (await enqueueJob(r.type, {}, { runAt: new Date(Date.now() + r.everyMinutes * 60_000), dedupe: true })));
  await db.job.deleteMany({ where: { type: { in: types }, status: { in: ["pending", "running"] } } });

  await ensureRecurringJobs();
  const scheduled = await db.job.groupBy({ by: ["type"], where: { type: { in: types }, status: "pending" }, _count: { _all: true } });
  check("every recurring job is scheduled once", scheduled.length === types.length && scheduled.every((s) => s._count._all === 1), `${scheduled.length} of ${types.length}`);

  await ensureRecurringJobs();
  check("scheduling again adds nothing", (await db.job.count({ where: { type: { in: types }, status: "pending" } })) === types.length);

  await processJobs(50, { types });
  const next = await db.job.groupBy({ by: ["type"], where: { type: { in: types }, status: "pending" }, _count: { _all: true }, _min: { runAt: true } });
  check("after running, each recurring job has scheduled its next run", next.length === types.length && next.every((n) => n._count._all === 1 && n._min.runAt!.getTime() > Date.now()), `${next.length} of ${types.length} scheduled`);

  // While one copy runs, the scheduler must not add a second copy due now.
  const t = types[0];
  await db.job.deleteMany({ where: { type: t, status: "pending" } });
  const running = await db.job.create({ data: { type: t, payloadJson: "{}", status: "running", lockedAt: new Date(), attempts: 1 } });
  await ensureScheduled(t);
  check("a running copy is not doubled by the scheduler", (await db.job.count({ where: { type: t, status: "pending" } })) === 0);
  await db.job.update({ where: { id: running.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
  await ensureScheduled(t);
  check("a copy whose function was cut off long ago no longer blocks scheduling", (await db.job.count({ where: { type: t, status: "pending" } })) === 1);
  await db.job.delete({ where: { id: running.id } });

  // A recurring job whose last run failed for good is not rescheduled for "now" (it was re-run on every drain).
  {
    const { nextRunAfterFailure } = await import("@/lib/jobs/queue");
    const now = new Date();
    const failedAt = new Date(now.getTime() - 5 * 60_000);
    const weekly = nextRunAfterFailure("seo_sync", { failedAt, succeededAt: null }, now);
    check("after a failure, a weekly job waits an hour from it", Math.abs(weekly.getTime() - (failedAt.getTime() + 60 * 60_000)) < 1000, weekly.toISOString());
    check("a 2-minute job waits its own interval (already over: now)", nextRunAfterFailure("crypto_check", { failedAt, succeededAt: null }, now).getTime() === now.getTime());
    check("a success after the failure means no wait", nextRunAfterFailure("seo_sync", { failedAt, succeededAt: new Date(now.getTime() - 60_000) }, now).getTime() === now.getTime());
    await db.job.deleteMany({ where: { type: "seo_sync", status: { in: ["pending", "running"] } } });
    // (The runs above just completed; this failure comes after them.)
    const justFailed = new Date();
    const f = await db.job.create({ data: { type: "seo_sync", payloadJson: '{"itest":1}', status: "failed", attempts: 5, maxAttempts: 5, runAt: justFailed, lastError: "itest failure", lastErrorAt: justFailed } });
    await ensureScheduled("seo_sync");
    const next = await db.job.findFirst({ where: { type: "seo_sync", status: "pending" } });
    check("ensureScheduled honours it", next !== null && next.runAt.getTime() > Date.now() + 55 * 60_000, next?.runAt.toISOString() ?? "none");
    await db.job.delete({ where: { id: f.id } });
    if (next) await db.job.delete({ where: { id: next.id } });
  }

  // Leave the local queue in its normal state: one waiting copy of each, due now.
  await db.job.deleteMany({ where: { type: { in: types }, status: "pending" } });
  await ensureRecurringJobs();
  await db.$disconnect();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
