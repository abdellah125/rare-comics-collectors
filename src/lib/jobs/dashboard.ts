import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RECURRING_JOBS, abandonedWhere } from "@/lib/jobs/queue";

export const formatDuration = (ms: number) => (ms < 1_000 ? `${ms} ms` : ms < 120_000 ? `${(ms / 1000).toFixed(1)} s` : ms < 2 * 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 3_600_000)} h`);

export type JobCounts = {
  total: number;
  pending: number;
  /** pending and due now */
  due: number;
  /** pending after at least one failed attempt */
  retrying: number;
  running: number;
  /** running, but the worker stopped renewing the lease */
  abandoned: number;
  failed: number;
  /** failed, and no later run of the same type has completed since */
  failedUnresolved: number;
  completed: number;
  cancelled: number;
  archived: number;
};

/** Every number on the Jobs & system header, in one place (also used by the tests). */
export async function jobCounts(now = new Date()): Promise<JobCounts> {
  const [byStatus, due, retrying, abandoned, unresolved, archived] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.job.count({ where: { status: "pending", runAt: { lte: now } } }),
    db.job.count({ where: { status: "pending", attempts: { gt: 0 } } }),
    db.job.count({ where: abandonedWhere(now) }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "Job" f
      LEFT JOIN LATERAL (
        SELECT MAX(c."completedAt") AS at FROM "Job" c WHERE c."type" = f."type" AND c."status" = 'completed'
      ) ok ON true
      WHERE f."status" = 'failed' AND (ok.at IS NULL OR ok.at <= COALESCE(f."lastErrorAt", f."runAt"))`,
    db.jobArchive.count(),
  ]);
  const c = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
  return {
    total: byStatus.reduce((n, x) => n + x._count._all, 0),
    pending: c("pending"),
    due,
    retrying,
    running: c("running"),
    abandoned,
    failed: c("failed"),
    failedUnresolved: Number(unresolved[0]?.n ?? 0),
    completed: c("completed"),
    cancelled: c("cancelled"),
    archived,
  };
}

export type RecurringHealth = (typeof RECURRING_JOBS)[number] & {
  lastSuccess: Date | null;
  next: Date | null;
  lastFailure: { at: Date; error: string | null } | null;
  avgMs: number | null;
  state: "ok" | "late" | "missing" | "failing";
};

/** One line per recurring job: last success, next run, last failure since then, typical duration. */
export async function recurringHealth(now = new Date()): Promise<RecurringHealth[]> {
  const types = RECURRING_JOBS.map((r) => r.type);
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [last, next, fails, durations] = await Promise.all([
    db.job.groupBy({ by: ["type"], where: { type: { in: types }, status: "completed" }, _max: { completedAt: true } }),
    db.job.groupBy({ by: ["type"], where: { type: { in: types }, status: { in: ["pending", "running"] } }, _min: { runAt: true } }),
    db.job.findMany({ where: { type: { in: types }, status: "failed" }, orderBy: [{ lastErrorAt: { sort: "desc", nulls: "last" } }, { runAt: "desc" }], distinct: ["type"], select: { type: true, runAt: true, lastErrorAt: true, lastError: true } }),
    db.jobAttempt.groupBy({ by: ["type"], where: { type: { in: types }, outcome: "succeeded", startedAt: { gte: since } }, _avg: { durationMs: true } }),
  ]);
  return RECURRING_JOBS.map((r) => {
    const lastSuccess = last.find((x) => x.type === r.type)?._max.completedAt ?? null;
    const nextRun = next.find((x) => x.type === r.type)?._min.runAt ?? null;
    const f = fails.find((x) => x.type === r.type);
    const failedAt = f ? (f.lastErrorAt ?? f.runAt) : null;
    const lastFailure = f && failedAt && (!lastSuccess || failedAt > lastSuccess) ? { at: failedAt, error: f.lastError } : null;
    const lateBy = nextRun ? now.getTime() - nextRun.getTime() : 0;
    const state = lastFailure ? "failing" : !nextRun ? "missing" : lateBy > Math.max(15, r.everyMinutes) * 60_000 ? "late" : "ok";
    const avg = durations.find((x) => x.type === r.type)?._avg.durationMs ?? null;
    return { ...r, lastSuccess, next: nextRun, lastFailure, avgMs: avg === null ? null : Math.round(avg), state };
  });
}

/** List filters, including the derived views (due, retrying, abandoned, unresolved failures). */
export function jobListWhere(filter: string, type: string, now = new Date()): Prisma.JobWhereInput {
  const byType = type ? { type } : {};
  switch (filter) {
    case "due":
      return { ...byType, status: "pending", runAt: { lte: now } };
    case "retrying":
      return { ...byType, status: "pending", attempts: { gt: 0 } };
    case "abandoned":
      return { ...byType, ...abandonedWhere(now) };
    case "":
      return byType;
    default:
      return { ...byType, status: filter };
  }
}
