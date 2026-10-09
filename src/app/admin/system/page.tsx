import type { Metadata } from "next";
import Link from "@/components/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, Kv, StatusBadge, Table, Td, Th, Tone, adminButton, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { cancelJobAction, clearResolvedFailuresAction, enqueueJobAction, retryJobAction, runJobsNowAction } from "@/lib/admin/actions/system";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/i18n";
import { registerJobHandlers } from "@/lib/jobs/handlers";
import { RECURRING_JOBS, STALE_LOCK_MS, registeredJobTypes } from "@/lib/jobs/queue";
import { secretSource } from "@/lib/secrets-cache";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Jobs & system" };
export const dynamic = "force-dynamic";

const STATUSES = ["pending", "running", "completed", "failed", "cancelled"];
const every = (m: number) => (m < 60 ? `every ${m} min` : m < 24 * 60 ? `every ${m / 60} h` : m === 24 * 60 ? "daily" : `every ${m / (24 * 60)} days`);
const ago = (from: Date, to: Date) => {
  const min = Math.round((to.getTime() - from.getTime()) / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const readDrain = (value: string | undefined) => {
  try {
    return value ? (JSON.parse(value) as { at: string; processed: number; failed: number }) : null;
  } catch {
    return null;
  }
};

export default async function AdminSystemPage({ searchParams }: PageProps<"/admin/system">) {
  await requireAdmin("system.manage");
  registerJobHandlers();
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "runAt"] });
  const status = p.get("status") || "";
  const type = p.get("type") || "";
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const where: Prisma.JobWhereInput = status === "stuck" ? { status: "running", lockedAt: { lt: staleBefore } } : { ...(status ? { status } : {}), ...(type ? { type } : {}) };
  const recurringTypes = RECURRING_JOBS.map((r) => r.type);
  const [rows, total, counts, stuck, settings, webhookFailed, lastByType, nextByType, lastFailByType, drains] = await Promise.all([
    db.job.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per }),
    db.job.count({ where }),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    db.job.count({ where: { status: "running", lockedAt: { lt: staleBefore } } }),
    getSettings(),
    db.webhookEvent.count({ where: { status: "failed" } }),
    db.job.groupBy({ by: ["type"], where: { type: { in: recurringTypes }, status: "completed" }, _max: { completedAt: true } }),
    db.job.groupBy({ by: ["type"], where: { type: { in: recurringTypes }, status: { in: ["pending", "running"] } }, _min: { runAt: true } }),
    db.job.findMany({ where: { type: { in: recurringTypes }, status: "failed" }, orderBy: { runAt: "desc" }, distinct: ["type"], select: { type: true, runAt: true, lastError: true } }),
    db.setting.findMany({ where: { key: { in: ["jobs.lastTick", "jobs.lastCron"] } } }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count._all ?? 0;
  const tick = readDrain(drains.find((d) => d.key === "jobs.lastTick")?.value);
  const cron = readDrain(drains.find((d) => d.key === "jobs.lastCron")?.value);
  const onVercel = Boolean(process.env.VERCEL);
  const base = "/admin/system";

  // One line per recurring job: when it last finished, when it runs next, and whether that is healthy.
  const health = RECURRING_JOBS.map((r) => {
    const last = lastByType.find((x) => x.type === r.type)?._max.completedAt ?? null;
    const next = nextByType.find((x) => x.type === r.type)?._min.runAt ?? null;
    const fail = lastFailByType.find((x) => x.type === r.type) ?? null;
    const failedSinceSuccess = fail && (!last || fail.runAt > last) ? fail : null;
    const lateBy = next ? now.getTime() - next.getTime() : 0;
    const state: "ok" | "late" | "missing" | "failing" = failedSinceSuccess ? "failing" : !next ? "missing" : lateBy > Math.max(15, r.everyMinutes) * 60_000 ? "late" : "ok";
    return { ...r, last, next, fail: failedSinceSuccess, state };
  });
  const problems = health.filter((h) => h.state !== "ok").length;

  return (
    <>
      <AdminPageHeader
        title="Jobs & system"
        lead={`Queue: ${c("pending")} pending · ${c("running")} running${stuck ? ` (${stuck} stuck)` : ""} · ${c("failed")} failed · ${c("completed")} completed. Recurring jobs: ${problems === 0 ? "all healthy" : `${problems} need attention`}.`}
        actions={
          <>
            <Link href="/admin/system/webhooks" className={adminButton.outline}>
              Webhooks {webhookFailed > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{webhookFailed}</span>}
            </Link>
            <Link href="/admin/settings/system" className={adminButton.outline}>
              Maintenance mode
            </Link>
            {c("failed") > 0 && <ConfirmButton label="Clear resolved failures" message="Deletes failed jobs that a later successful run of the same job has made irrelevant. Failures that are still the latest result for their job stay." action={clearResolvedFailuresAction} />}
            <ConfirmButton label="Run due jobs now" message="Processes due jobs in this request, for up to about 25 seconds." action={runJobsNowAction} variant="dark" />
          </>
        }
      />

      {!settings["system.jobsEnabled"] && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Recurring jobs are switched off in <Link href="/admin/settings/system" className="font-semibold underline">Settings › System</Link>: they are not rescheduled after they run. Emails and other one-off jobs still go out.
        </p>
      )}
      {onVercel && !env.cronSecret && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="cron-warning">
          CRON_SECRET is not set in the Vercel environment, so the daily cron call to /api/jobs/run is refused. The queue still runs from site traffic, but set CRON_SECRET (any long random value) so the daily run works when the site is quiet.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar action={base} reset>
            <Field label="Status">
              <select name="status" defaultValue={status} className={adminSelect}>
                <option value="">Any</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="stuck">stuck (running, cut off)</option>
              </select>
            </Field>
            <Field label="Type">
              <select name="type" defaultValue={type} className={adminSelect}>
                <option value="">Any</option>
                {registeredJobTypes()
                  .sort()
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </Field>
          </FilterBar>
          {rows.length === 0 ? (
            <EmptyState title="No jobs" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Run at</Th>
                  <Th>Attempts</Th>
                  <Th>Status</Th>
                  <Th>Payload / error</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => {
                  const isStuck = j.status === "running" && j.lockedAt !== null && j.lockedAt < staleBefore;
                  return (
                    <tr key={j.id}>
                      <Td className="font-mono text-[12px]">{j.type}</Td>
                      <Td className="whitespace-nowrap text-ink-600">
                        {formatDateTime(j.runAt)}
                        {j.completedAt && <span className="block text-[11px] text-ink-500">done {formatDateTime(j.completedAt)}</span>}
                      </Td>
                      <Td>
                        {j.attempts}/{j.maxAttempts}
                      </Td>
                      <Td>{isStuck ? <Tone tone="danger">stuck</Tone> : <StatusBadge status={j.status} />}</Td>
                      <Td className="max-w-[320px]">
                        <details>
                          <summary className="cursor-pointer truncate text-[12px] text-ink-600">{j.lastError ? <span className="text-rose-700">{j.lastError.slice(0, 80)}</span> : isStuck ? <span className="text-rose-700">Started {formatDateTime(j.lockedAt!)} and never reported back (cut off by the time limit).</span> : j.payloadJson.slice(0, 80)}</summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] text-ink-700">
                            {j.payloadJson}
                            {j.lastError ? `\n\n${j.lastError}` : ""}
                          </pre>
                        </details>
                      </Td>
                      <Td>
                        <span className="flex gap-1">
                          {(j.status === "failed" || j.status === "cancelled" || isStuck) && <ConfirmButton label={isStuck ? "Release" : "Retry"} message={isStuck ? "Puts this job back in the queue to run again." : "Queue this job again."} action={retryJobAction.bind(null, j.id)} size="sm" />}
                          {(j.status === "pending" || j.status === "failed") && <ConfirmButton label="Cancel" message="Cancel this job?" action={cancelJobAction.bind(null, j.id)} size="sm" variant="danger" />}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
        </div>

        <div className="grid gap-6 self-start">
          <Card title="Recurring jobs" description="Each one schedules its next run when it finishes. Late means its run is overdue: the queue has not been driven (no visits, no cron). Missing means nothing is scheduled: queue it.">
            <ul className="divide-y divide-ink-100 px-4 text-[13px]" data-testid="recurring-health">
              {health.map((h) => (
                <li key={h.type} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink-950">{h.type}</span>
                    <Tone tone={h.state === "ok" ? "success" : h.state === "late" ? "warning" : "danger"}>{h.state === "ok" ? "ok" : h.state}</Tone>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-600">
                    {h.what} · {every(h.everyMinutes)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    Last done {h.last ? ago(h.last, now) : "never"} · next {h.next ? (h.next <= now ? `due since ${ago(h.next, now).replace(" ago", "")}` : formatDateTime(h.next)) : "not scheduled"}
                  </p>
                  {h.fail?.lastError && <p className="mt-1 text-[11px] leading-snug text-rose-700">Last failure {ago(h.fail.runAt, now)}: {h.fail.lastError.slice(0, 160)}</p>}
                  {(h.state === "missing" || h.state === "failing") && (
                    <div className="mt-1.5">
                      <ConfirmButton label="Queue now" message={`Queue ${h.type} to run now?`} action={enqueueJobAction.bind(null, h.type)} size="sm" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Runtime">
            <Kv
              items={[
                { label: "Environment", value: `${process.env.NODE_ENV ?? "development"}${onVercel ? ` · Vercel (${process.env.VERCEL_ENV ?? "?"})` : ""}` },
                { label: "Site URL", value: env.siteUrl },
                { label: "Database", value: (process.env.DATABASE_URL ?? "").replace(/:\/\/.*@/, "://***@").split("?")[0] || "—" },
                { label: "How the queue runs", value: onVercel ? "No resident worker: drained by visitors' browsers (/api/jobs/tick), admin page visits and the daily cron" : process.env.JOBS_INLINE_WORKER === "false" ? "By cron calls to /api/jobs/run" : "In-process worker" },
                { label: "Last drain from traffic", value: tick ? `${ago(new Date(tick.at), now)} · ${tick.processed} done, ${tick.failed} failed` : "not recorded yet" },
                { label: "Last cron run", value: cron ? `${ago(new Date(cron.at), now)} · ${cron.processed} done, ${cron.failed} failed` : "not recorded yet" },
                { label: "Cron secret", value: env.cronSecret || env.jobsSecret ? `set (${[env.cronSecret ? "CRON_SECRET" : "", env.jobsSecret ? "JOBS_SECRET" : ""].filter(Boolean).join(", ")})` : "not set: /api/jobs/run refuses every call" },
                { label: "Uploads", value: env.blobToken ? "Vercel Blob" : onVercel ? "Not configured: Vercel has no writable disk, so uploaded files cannot be stored. Set BLOB_READ_WRITE_TOKEN." : `Local folder ${env.uploadDir}` },
                { label: "Secrets", value: `SESSION_SECRET from ${secretSource("session_secret")} · APP_ENCRYPTION_KEY from ${secretSource("encryption_key")}` },
                { label: "SMTP", value: env.smtp.host ? env.smtp.host : "not configured (emails are logged only)" },
                { label: "AI service", value: env.anthropic.apiKey ? "ANTHROPIC_API_KEY set" : "not set" },
                { label: "Exchange rates", value: settings["system.exchangeRatesAuto"] ? "automatic, every 6 h" : "manual" },
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
