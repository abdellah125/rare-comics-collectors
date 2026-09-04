import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, Field, FilterBar, StatusBadge, Table, Td, Th, Tone, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { decideAppealAction } from "@/lib/admin/actions/moderation";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Appeals" };
export const dynamic = "force-dynamic";

export default async function AdminAppealsPage({ searchParams }: PageProps<"/admin/moderation/appeals">) {
  await requireAdmin("moderation.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"], defaultDir: "asc" });
  const status = sp.status === undefined ? "pending" : p.get("status") || "";
  const where: Prisma.AppealWhereInput = status ? { status } : {};
  const [rows, total] = await Promise.all([db.appeal.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { id: true, name: true, email: true, status: true, restrictionsJson: true } }, violation: { select: { id: true, type: true, severity: true, actionTaken: true, description: true, status: true } }, decidedBy: { select: { name: true } } } }), db.appeal.count({ where })]);
  const base = "/admin/moderation/appeals";
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Moderation", href: "/admin/moderation" }, { label: "Appeals" }]} title="Appeals" lead="Accepting an appeal revokes the linked violation and reactivates the account when nothing else blocks it. The user is emailed either way." />
      <FilterBar action={base} reset>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No appeals" body="Users appeal from Account › Security (or the public appeal page when they can't sign in)." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Submitted</Th>
              <Th>User</Th>
              <Th>Against</Th>
              <Th>Appeal</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(a.createdAt)}</Td>
                <Td>
                  <Link href={`/admin/users/${a.user.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                    {a.user.name}
                  </Link>
                  <span className="block text-[11px] text-ink-500">
                    {a.user.email} · <StatusBadge status={a.user.status} />
                  </span>
                </Td>
                <Td className="max-w-[240px]">
                  {a.violation ? (
                    <>
                      <span>
                        <Tone tone={a.violation.severity === "critical" || a.violation.severity === "high" ? "danger" : "warning"}>{a.violation.severity}</Tone> {statusLabel(a.violation.type)} → {statusLabel(a.violation.actionTaken)}
                      </span>
                      <span className="line-clamp-2 text-[12px] text-ink-600">{a.violation.description}</span>
                    </>
                  ) : (
                    <span className="text-ink-600">Account status ({a.user.status})</span>
                  )}
                </Td>
                <Td className="max-w-[360px]">
                  <p className="whitespace-pre-line text-[13px] text-ink-800">{a.message}</p>
                  {a.decisionNote && <p className="mt-1 text-[12px] text-ink-600"><strong>Decision:</strong> {a.decisionNote}{a.decidedBy ? ` — ${a.decidedBy.name}` : ""}</p>}
                </Td>
                <Td>
                  <StatusBadge status={a.status} />
                </Td>
                <Td>
                  {a.status === "pending" && (
                    <span className="flex gap-1">
                      <ConfirmButton label="Accept" message="Lifts the enforcement and emails the user." action={decideAppealAction.bind(null, a.id, "accepted")} withReason reasonLabel="Note to user" size="sm" variant="primary" />
                      <ConfirmButton label="Reject" message="The original decision stands; the user is emailed." action={decideAppealAction.bind(null, a.id, "rejected")} withReason reasonLabel="Note to user" size="sm" variant="danger" />
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
