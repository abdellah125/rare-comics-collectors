import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, Kv, StatusBadge, Table, Td, Th, adminButton, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { cancelJobAction, enqueueJobAction, retryJobAction, runJobsNowAction } from "@/lib/admin/actions/system";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Jobs & system" };
export const dynamic = "force-dynamic";

const RECURRING = ["fetch_exchange_rates", "expire_unpaid_orders", "auto_complete_orders", "schedule_payouts", "cleanup_expired", "recompute_seller_stats"];

export default async function AdminSystemPage({ searchParams }: PageProps<"/admin/system">) {
  await requireAdmin("system.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "runAt"] });
  const status = p.get("status") || "";
  const type = p.get("type") || "";
  const where: Prisma.JobWhereInput = { ...(status ? { status } : {}), ...(type ? { type } : {}) };
  const [rows, total, counts, settings, webhookFailed, lastDone] = await Promise.all([
    db.job.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per }),
    db.job.count({ where }),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
    getSettings(),
    db.webhookEvent.count({ where: { status: "failed" } }),
    db.job.findFirst({ where: { status: "completed" }, orderBy: { completedAt: "desc" }, select: { completedAt: true, type: true } }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count._all ?? 0;
  const base = "/admin/system";
  return (
    <>
      <AdminPageHeader
        title="Jobs & system"
        lead={`Queue: ${c("pending")} pending · ${c("running")} running · ${c("failed")} failed · ${c("completed")} completed. Worker ${settings["system.jobsEnabled"] ? "enabled" : "DISABLED in settings"}; last completed ${lastDone ? `${lastDone.type} ${formatDateTime(lastDone.completedAt)}` : "never"}.`}
        actions={
          <>
            <Link href="/admin/system/webhooks" className={adminButton.outline}>
              Webhooks {webhookFailed > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{webhookFailed}</span>}
            </Link>
            <Link href="/admin/settings/system" className={adminButton.outline}>
              Maintenance mode
            </Link>
            <ConfirmButton label="Run due jobs now" message="Processes up to 50 due jobs in this request." action={runJobsNowAction} variant="dark" />
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar action={base} reset>
            <Field label="Status">
              <select name="status" defaultValue={status} className={adminSelect}>
                <option value="">Any</option>
                {["pending", "running", "completed", "failed", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" defaultValue={type} className={adminSelect}>
                <option value="">Any</option>
                {["send_email", "broadcast_email", "retry_webhook", ...RECURRING].map((s) => (
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
                {rows.map((j) => (
                  <tr key={j.id}>
                    <Td className="font-mono text-[12px]">{j.type}</Td>
                    <Td className="whitespace-nowrap text-ink-600">
                      {formatDateTime(j.runAt)}
                      {j.completedAt && <span className="block text-[11px] text-ink-500">done {formatDateTime(j.completedAt)}</span>}
                    </Td>
                    <Td>
                      {j.attempts}/{j.maxAttempts}
                    </Td>
                    <Td>
                      <StatusBadge status={j.status} />
                    </Td>
                    <Td className="max-w-[320px]">
                      <details>
                        <summary className="cursor-pointer truncate text-[12px] text-ink-600">{j.lastError ? <span className="text-rose-700">{j.lastError.slice(0, 80)}</span> : j.payloadJson.slice(0, 80)}</summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] text-ink-700">{j.payloadJson}{j.lastError ? `\n\n${j.lastError}` : ""}</pre>
                      </details>
                    </Td>
                    <Td>
                      <span className="flex gap-1">
                        {(j.status === "failed" || j.status === "cancelled") && <ConfirmButton label="Retry" message="Queue this job again." action={retryJobAction.bind(null, j.id)} size="sm" />}
                        {(j.status === "pending" || j.status === "failed") && <ConfirmButton label="Cancel" message="Cancel this job?" action={cancelJobAction.bind(null, j.id)} size="sm" variant="danger" />}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Recurring jobs" description="Re-schedule themselves after each run. Queue one manually if it stalled.">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {RECURRING.map((t) => (
                <li key={t} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-mono text-[12px]">{t}</span>
                  <ConfirmButton label="Queue" message={`Queue ${t} to run now?`} action={enqueueJobAction.bind(null, t)} size="sm" />
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Runtime">
            <Kv items={[{ label: "Environment", value: process.env.NODE_ENV ?? "development" }, { label: "Site URL", value: env.siteUrl }, { label: "Database", value: (process.env.DATABASE_URL ?? "").replace(/:\/\/.*@/, "://***@").split("?")[0] || "—" }, { label: "Uploads", value: env.uploadDir }, { label: "SMTP", value: env.smtp.host ? env.smtp.host : "not configured (log only)" }, { label: "Cron endpoint", value: "POST /api/jobs/run (Bearer JOBS_SECRET)" }, { label: "Exchange rates", value: settings["system.exchangeRatesAuto"] ? "auto (6h)" : "manual" }]} />
          </Card>
        </div>
      </div>
    </>
  );
}
