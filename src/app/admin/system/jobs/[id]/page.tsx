import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, EmptyState, Kv, StatusBadge, Table, Td, Th, Tone, adminButton } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { cancelJobAction, retryJobAction } from "@/lib/admin/actions/system";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatDuration } from "@/lib/jobs/dashboard";
import { redactPayload } from "@/lib/jobs/policy";
import { leaseIsLive } from "@/lib/jobs/queue";

export const metadata: Metadata = { title: "Job" };
export const dynamic = "force-dynamic";

const OUTCOME_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = { succeeded: "success", running: "neutral", failed: "danger", abandoned: "warning", lost_lease: "warning" };

/** One job: its state, lease, redacted payload, result or error, and every attempt. */
export default async function AdminJobPage({ params }: PageProps<"/admin/system/jobs/[id]">) {
  await requireAdmin("system.manage");
  const { id } = await params;
  const [job, archived, attempts] = await Promise.all([
    db.job.findUnique({ where: { id } }),
    db.jobArchive.findUnique({ where: { id } }),
    db.jobAttempt.findMany({ where: { jobId: id }, orderBy: { attempt: "asc" } }),
  ]);
  if (!job && !archived) notFound();
  const now = new Date();
  const row = job ?? { ...archived!, lockedAt: null, heartbeatAt: null, leaseUntil: null, lockedBy: null, lastErrorAt: null, dedupeKey: null };
  const live = job ? leaseIsLive(job, now) : false;
  const abandoned = row.status === "running" && !live;

  return (
    <>
      <AdminPageHeader
        title={row.type}
        lead={`Job ${row.id}${archived ? " · archived" : ""}`}
        actions={
          <>
            <Link href={`/admin/system?type=${row.type}`} className={adminButton.outline}>
              All {row.type} jobs
            </Link>
            {job && (job.status === "failed" || job.status === "cancelled" || abandoned) && <ConfirmButton label="Retry" message="Queue this job again with a fresh allowance of attempts. Its history is kept." action={retryJobAction.bind(null, job.id)} />}
            {job && (job.status === "pending" || job.status === "failed" || abandoned) && <ConfirmButton label="Cancel" message="Cancel this job? It stays in the list as cancelled." action={cancelJobAction.bind(null, job.id)} variant="danger" />}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="State">
          <div className="p-5">
            <Kv
              items={[
                { label: "Status", value: abandoned ? <Tone tone="danger">abandoned</Tone> : <StatusBadge status={row.status} /> },
                { label: "Attempts", value: `${row.attempts} of ${row.maxAttempts}` },
                { label: "Priority", value: String(row.priority) },
                { label: "Run at", value: formatDateTime(row.runAt) },
                { label: "Created", value: formatDateTime(row.createdAt) },
                { label: "Started", value: row.startedAt ? formatDateTime(row.startedAt) : "—" },
                { label: "Completed", value: row.completedAt ? `${formatDateTime(row.completedAt)}${row.startedAt ? ` (took ${formatDuration(row.completedAt.getTime() - row.startedAt.getTime())})` : ""}` : "—" },
                ...(row.status === "running"
                  ? [
                      { label: "Worker", value: row.lockedBy ?? "unknown" },
                      { label: "Heartbeat", value: row.heartbeatAt ? formatDateTime(row.heartbeatAt) : "none" },
                      { label: "Lease until", value: row.leaseUntil ? `${formatDateTime(row.leaseUntil)}${live ? "" : " (expired)"}` : "—" },
                    ]
                  : []),
                { label: "Result", value: row.result ?? "—" },
                { label: "Last error", value: row.lastError ? <span className="text-rose-700">{row.lastError}</span> : "—" },
                ...(row.dedupeKey ? [{ label: "Dedupe key", value: row.dedupeKey }] : []),
              ]}
            />
          </div>
        </Card>
        <Card title="Payload" description="Secrets are replaced and email addresses masked.">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all p-5 text-[12px] text-ink-700" data-testid="job-payload">
            {redactPayload(row.payloadJson)}
          </pre>
        </Card>
      </div>
      <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-950">Attempts</h2>
      {attempts.length === 0 ? (
        <EmptyState title="No recorded attempts" body="Attempts are recorded since the queue gained attempt history; older runs only show their final state above." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Outcome</Th>
              <Th>Started</Th>
              <Th>Duration</Th>
              <Th>Worker</Th>
              <Th>Error</Th>
              <Th>Retry at</Th>
            </tr>
          </thead>
          <tbody data-testid="job-attempts">
            {attempts.map((a) => (
              <tr key={a.id}>
                <Td>{a.attempt}</Td>
                <Td>
                  <Tone tone={OUTCOME_TONE[a.outcome] ?? "neutral"}>{a.outcome.replace("_", " ")}</Tone>
                  {a.errorKind && <span className="block text-[11px] text-ink-500">{a.errorKind.replace("_", " ")}</span>}
                </Td>
                <Td className="whitespace-nowrap text-[12px]">{formatDateTime(a.startedAt)}</Td>
                <Td className="text-[12px]">{a.durationMs !== null ? formatDuration(a.durationMs) : "—"}</Td>
                <Td className="font-mono text-[11px]">{a.worker}</Td>
                <Td className="max-w-[420px] text-[12px] text-rose-700">{a.error ?? ""}</Td>
                <Td className="whitespace-nowrap text-[12px]">{a.retryAt ? formatDateTime(a.retryAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
