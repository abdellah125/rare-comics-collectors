import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { bulkReportsAction } from "@/lib/admin/actions/moderation";
import { loadReportTargets } from "@/lib/admin/moderation-targets";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { REPORT_STATUSES, REPORT_TYPES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function AdminModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  await requireAdmin("moderation.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "status", "targetType"] });
  const status = p.get("status") ?? "";
  const effectiveStatus = sp.status === undefined ? "open" : status;
  const type = p.get("targetType") || "";
  const where: Prisma.ReportWhereInput = {
    ...(effectiveStatus === "open" ? { status: { in: ["open", "reviewing"] } } : effectiveStatus ? { status: effectiveStatus } : {}),
    ...(type ? { targetType: type } : {}),
    ...(p.q ? { OR: [{ reason: { contains: p.q } }, { details: { contains: p.q } }, { reporterEmail: { contains: p.q } }, { reporter: { email: { contains: p.q } } }, { targetId: p.q }] } : {}),
  };
  const [rows, total, openCount, violations, appeals] = await Promise.all([
    db.report.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { reporter: { select: { name: true, email: true } }, handledBy: { select: { name: true } } } }),
    db.report.count({ where }),
    db.report.count({ where: { status: { in: ["open", "reviewing"] } } }),
    db.violation.count({ where: { status: "active" } }),
    db.appeal.count({ where: { status: "pending" } }),
  ]);
  const targets = await loadReportTargets(rows);
  const base = "/admin/moderation";
  return (
    <>
      <AdminPageHeader
        title="Moderation queue"
        lead={`${openCount} open report${openCount === 1 ? "" : "s"}. Reports come from the public report form, review flags and seller/buyer complaints.`}
        actions={
          <>
            <Link href="/admin/moderation/violations" className={adminButton.outline}>
              Violations <Tone tone="neutral">{violations}</Tone>
            </Link>
            <Link href="/admin/moderation/appeals" className={adminButton.outline}>
              Appeals {appeals > 0 ? <Tone tone="warning">{appeals}</Tone> : <Tone tone="neutral">0</Tone>}
            </Link>
          </>
        }
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Reason, details, reporter" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={effectiveStatus} className={adminSelect}>
            <option value="">Any</option>
            <option value="open">Open + reviewing</option>
            {REPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select name="targetType" defaultValue={type} className={adminSelect}>
            <option value="">Any</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="Queue is clear" body="No reports match these filters." />
      ) : (
        <BulkProvider>
          <BulkActionsBar run={bulkReportsAction} actions={[{ id: "reviewing", label: "Mark reviewing" }, { id: "dismiss", label: "Dismiss", danger: true, confirm: "Dismiss {n} reports without action?" }]} />
          <Table>
            <thead>
              <tr>
                <Th className="w-8">
                  <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Reported" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="targetType" label="Type" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Target</Th>
                <Th>Reason</Th>
                <Th>Reporter</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="status" label="Status" current={p.sort} dir={p.dir} />
                </Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = targets.get(`${r.targetType}:${r.targetId}`);
                return (
                  <tr key={r.id}>
                    <Td>
                      <RowCheckbox id={r.id} label={r.reason} />
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt, { dateOnly: true })}</Td>
                    <Td>
                      <Tone tone="neutral">{r.targetType}</Tone>
                    </Td>
                    <Td className="max-w-[280px]">
                      {t ? (
                        <>
                          <Link href={t.href} className="line-clamp-1 font-medium text-ink-950 hover:text-brand-700">
                            {t.label}
                          </Link>
                          <span className="block text-[11px] text-ink-500">
                            {t.extra} · <StatusBadge status={t.status} />
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-500">deleted / unknown</span>
                      )}
                    </Td>
                    <Td className="max-w-[240px]">
                      <span className="font-medium text-ink-900">{r.reason}</span>
                      {r.details && <span className="line-clamp-2 text-[12px] text-ink-600">{r.details}</span>}
                    </Td>
                    <Td className="text-[12px] text-ink-700">{r.reporter?.email ?? r.reporterEmail ?? "anonymous"}</Td>
                    <Td>
                      <StatusBadge status={r.status} />
                      {r.handledBy && <span className="block text-[11px] text-ink-500">{r.handledBy.name}</span>}
                    </Td>
                    <Td>
                      <Link href={`/admin/moderation/${r.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                        Review
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </BulkProvider>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
