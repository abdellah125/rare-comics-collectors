import type { Metadata } from "next";
import Link from "@/components/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, Kv, StatusBadge, Table, Td, Th, Tone, adminButton, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { cancelJobAction, enqueueJobAction, recoverAbandonedAction, retryJobAction, runJobsNowAction } from "@/lib/admin/actions/system";
import { listParams, pageCount } from "@/lib/admin/query";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/i18n";
import { formatDuration as duration, jobCounts, jobListWhere, recurringHealth } from "@/lib/jobs/dashboard";
import { registerJobHandlers } from "@/lib/jobs/handlers";
import { queueConfig } from "@/lib/jobs/policy";
import { leaseIsLive, registeredJobTypes } from "@/lib/jobs/queue";
import { secretSource } from "@/lib/secrets-cache";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Jobs & system" };
export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "pending", label: "pending (all waiting)" },
  { value: "due", label: "due now" },
  { value: "retrying", label: "waiting to retry" },
  { value: "running", label: "running" },
  { value: "abandoned", label: "abandoned (worker gone)" },
  { value: "failed", label: "failed" },
  { value: "completed", label: "completed" },
  { value: "cancelled", label: "cancelled" },
];
const every = (m: number) => (m < 60 ? `every ${m} min` : m < 24 * 60 ? `every ${m / 60} h` : m === 24 * 60 ? "daily" : `every ${m / (24 * 60)} days`);
const ago = (from: Date, to: Date) => {
  const min = Math.round((to.getTime() - from.getTime()) / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const readDrain = (value: string | undefined) => {
  try {
    return value ? (JSON.parse(value) as { at: string; processed: number; failed: number; recovered?: number; remainingDue?: number }) : null;
  } catch {
    return null;
  }
};

export default async function AdminSystemPage({ searchParams }: PageProps<"/admin/system">) {
  await requireAdmin("system.manage");
  registerJobHandlers();
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "runAt"] });
  const filter = p.get("status") || "";
  const type = p.get("type") || "";
  const now = new Date();
  const where = jobListWhere(filter, type, now);
  const [rows, total, counts, health, settings, webhookFailed, drains] = await Promise.all([
    db.job.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per }),
    db.job.count({ where }),
    jobCounts(now),
    recurringHealth(now),
    getSettings(),
    db.webhookEvent.count({ where: { status: "failed" } }),
    db.setting.findMany({ where: { key: { in: ["jobs.lastTick", "jobs.lastCron"] } } }),
  ]);
  const tick = readDrain(drains.find((d) => d.key === "jobs.lastTick")?.value);
  const cron = readDrain(drains.find((d) => d.key === "jobs.lastCron")?.value);
  const onVercel = Boolean(process.env.VERCEL);
  const cfg = queueConfig();
  const base = "/admin/system";
  const problems = health.filter((h) => h.state !== "ok").length;
  const drainText = (d: NonNullable<typeof tick>) => `${ago(new Date(d.at), now)} · ${d.processed} done, ${d.failed} failed${d.recovered ? `, ${d.recovered} recovered` : ""}${d.remainingDue ? `, ${d.remainingDue} still due` : ""}`;

  const stat = (label: string, value: number, href: string, tone?: "danger" | "warning") => (
    <Link href={href} className={`rounded-lg border px-3 py-2 ${tone === "danger" && value > 0 ? "border-rose-200 bg-rose-50" : tone === "warning" && value > 0 ? "border-amber-200 bg-amber-50" : "border-ink-200 bg-white"}`}>
      <span className="block text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <span className="block text-lg font-semibold text-ink-950">{value.toLocaleString("en")}</span>
    </Link>
  );

  return (
    <>
      <AdminPageHeader
        title="Jobs & system"
        lead={`${counts.total.toLocaleString("en")} jobs in the live table, ${counts.archived.toLocaleString("en")} archived. Recurring jobs: ${problems === 0 ? "all healthy" : `${problems} need attention`}.`}
        actions={
          <>
            <Link href="/admin/system/webhooks" className={adminButton.outline}>
              Webhooks {webhookFailed > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{webhookFailed}</span>}
            </Link>
            <Link href="/admin/settings/system" className={adminButton.outline}>
              Maintenance mode
            </Link>
            {counts.abandoned > 0 && <ConfirmButton label={`Recover abandoned (${counts.abandoned})`} message="Running jobs whose worker stopped reporting are queued again with a delay, or marked failed when they have no attempts left. Jobs that are still reporting are not touched." action={recoverAbandonedAction} />}
            <ConfirmButton label="Run due jobs now" message="Processes due jobs in this request, most urgent first, for up to about 25 seconds." action={runJobsNowAction} variant="dark" />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8" data-testid="job-counts">
        {stat("Pending", counts.pending, `${base}?status=pending`)}
        {stat("Due now", counts.due, `${base}?status=due`)}
        {stat("Retrying", counts.retrying, `${base}?status=retrying`, "warning")}
        {stat("Running", counts.running, `${base}?status=running`)}
        {stat("Abandoned", counts.abandoned, `${base}?status=abandoned`, "danger")}
        {stat("Failed", counts.failed, `${base}?status=failed`, counts.failedUnresolved > 0 ? "danger" : undefined)}
        {stat("Completed", counts.completed, `${base}?status=completed`)}
        {stat("Cancelled", counts.cancelled, `${base}?status=cancelled`)}
      </div>
      {counts.failed > 0 && (
        <p className="-mt-3 mb-4 text-[12px] text-ink-600" data-testid="failed-breakdown">
          Of the {counts.failed} failed jobs, {counts.failedUnresolved} {counts.failedUnresolved === 1 ? "is" : "are"} still the latest result for their job type; the others were followed by a successful run. Failed jobs are kept as history.
        </p>
      )}

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
        <div className="min-w-0 xl:col-span-2">
          <FilterBar action={base} reset>
            <Field label="Show">
              <select name="status" defaultValue={filter} className={adminSelect}>
                <option value="">Any</option>
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
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
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>Timing</Th>
                  <Th>Result / error</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => {
                  const live = leaseIsLive(j, now);
                  const abandoned = j.status === "running" && !live;
                  const ranFor = j.startedAt && j.completedAt ? j.completedAt.getTime() - j.startedAt.getTime() : j.startedAt && j.status === "running" ? now.getTime() - j.startedAt.getTime() : null;
                  return (
                    <tr key={j.id}>
                      <Td className="font-mono text-[12px]">
                        <Link href={`${base}/jobs/${j.id}`} className="underline decoration-ink-300 underline-offset-2 hover:decoration-ink-700">
                          {j.type}
                        </Link>
                      </Td>
                      <Td>
                        {abandoned ? <Tone tone="danger">abandoned</Tone> : <StatusBadge status={j.status} />}
                        {j.status === "pending" && j.attempts > 0 && <span className="mt-0.5 block text-[11px] text-amber-700">retry</span>}
                      </Td>
                      <Td>
                        {j.attempts}/{j.maxAttempts}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-ink-600">
                        {j.status === "pending" ? (j.runAt <= now ? `due since ${ago(j.runAt, now).replace(" ago", "")}` : `runs ${formatDateTime(j.runAt)}`) : j.startedAt ? `started ${formatDateTime(j.startedAt)}` : formatDateTime(j.runAt)}
                        {ranFor !== null && <span className="block text-[11px] text-ink-500">{j.status === "running" ? "running for" : "took"} {duration(ranFor)}</span>}
                        {j.status === "running" && <span className="block text-[11px] text-ink-500">heartbeat {j.heartbeatAt ? ago(j.heartbeatAt, now) : "none"}</span>}
                      </Td>
                      <Td className="max-w-[320px] text-[12px]">
                        {abandoned ? (
                          <span className="text-rose-700">Worker stopped reporting{j.leaseUntil ? `; lease expired ${ago(j.leaseUntil, now)}` : ""}.</span>
                        ) : j.status === "completed" ? (
                          <span className="line-clamp-2 text-ink-600">{j.result ?? "done"}</span>
                        ) : j.lastError ? (
                          <span className="line-clamp-2 text-rose-700">{j.lastError}</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="flex gap-1">
                          {(j.status === "failed" || j.status === "cancelled" || abandoned) && <ConfirmButton label="Retry" message={abandoned ? "Records this attempt as abandoned and queues the job again. Its history is kept." : "Queue this job again with a fresh allowance of attempts. Its failure history is kept."} action={retryJobAction.bind(null, j.id)} size="sm" />}
                          {(j.status === "pending" || j.status === "failed" || abandoned) && <ConfirmButton label="Cancel" message={`Cancel this ${j.type} job? It stays in the list as cancelled.${j.status === "pending" ? " A recurring job is scheduled afresh on the next drain." : ""}`} action={cancelJobAction.bind(null, j.id)} size="sm" variant="danger" />}
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
          <Card title="Recurring jobs" description="Each one schedules its next run when it finishes. Late: its run is overdue because the queue has not been driven (no visits, no cron). Missing: nothing is scheduled. Failing: the latest run failed.">
            <ul className="divide-y divide-ink-100 px-4 text-[13px]" data-testid="recurring-health">
              {health.map((h) => (
                <li key={h.type} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`${base}?type=${h.type}`} className="font-mono text-[12px] text-ink-950 hover:underline">
                      {h.type}
                    </Link>
                    <Tone tone={h.state === "ok" ? "success" : h.state === "late" ? "warning" : "danger"}>{h.state}</Tone>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-600">
                    {h.what} · {every(h.everyMinutes)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    Last success {h.lastSuccess ? ago(h.lastSuccess, now) : "never"} · next {h.next ? (h.next <= now ? `due since ${ago(h.next, now).replace(" ago", "")}` : formatDateTime(h.next)) : "not scheduled"}
                    {h.avgMs !== null && ` · usually ${duration(h.avgMs)}`}
                  </p>
                  {h.lastFailure?.error && <p className="mt-1 text-[11px] leading-snug text-rose-700">Failed {ago(h.lastFailure.at, now)}: {h.lastFailure.error.slice(0, 160)}</p>}
                  {(h.state === "missing" || h.state === "failing") && (
                    <div className="mt-1.5">
                      <ConfirmButton label="Queue now" message={`Queue ${h.type} to run now? Nothing is added if a run is already waiting.`} action={enqueueJobAction.bind(null, h.type)} size="sm" />
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
                { label: "Leases", value: `${duration(cfg.leaseMs)}, renewed every ${duration(cfg.heartbeatMs)}; retries back off from ${duration(cfg.backoffBaseMs)} up to ${duration(cfg.backoffMaxMs)}` },
                { label: "Archive", value: cfg.archiveAfterDays > 0 ? `Completed jobs move to the archive after ${Math.max(7, cfg.archiveAfterDays)} days; failed and cancelled jobs stay` : "Off" },
                { label: "Last drain from traffic", value: tick ? drainText(tick) : "not recorded yet" },
                { label: "Last cron run", value: cron ? drainText(cron) : "not recorded yet" },
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
