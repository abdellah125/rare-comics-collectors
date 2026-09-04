import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, StatusBadge, Table, Td, Th, Tone, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { issueViolationAction, revokeViolationAction } from "@/lib/admin/actions/moderation";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { USER_RESTRICTIONS, VIOLATION_ACTIONS, VIOLATION_SEVERITIES, VIOLATION_TYPES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Violations" };
export const dynamic = "force-dynamic";

export default async function AdminViolationsPage({ searchParams }: PageProps<"/admin/moderation/violations">) {
  await requireAdmin("moderation.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "severity"] });
  const status = p.get("status") || "";
  const where: Prisma.ViolationWhereInput = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ user: { email: { contains: p.q, mode: "insensitive" as const } } }, { user: { name: { contains: p.q, mode: "insensitive" as const } } }, { description: { contains: p.q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total] = await Promise.all([db.violation.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { id: true, name: true, email: true, status: true } }, issuedBy: { select: { name: true } }, appeals: { select: { id: true, status: true } } } }), db.violation.count({ where })]);
  const prefillEmail = typeof sp.email === "string" ? sp.email : "";
  const reportId = typeof sp.reportId === "string" ? sp.reportId : "";
  const base = "/admin/moderation/violations";
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Moderation", href: "/admin/moderation" }, { label: "Violations" }]} title="Violations & enforcement" lead="A violation records the breach and applies the enforcement (warning, restriction, suspension or ban). Users can appeal from their account." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar action={base} reset>
            <Field label="Search" className="flex-1">
              <input name="q" defaultValue={p.q} placeholder="User or description" className={adminInput} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={status} className={adminSelect}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
                <option value="expired">Expired</option>
              </select>
            </Field>
          </FilterBar>
          {rows.length === 0 ? (
            <EmptyState title="No violations recorded" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Issued</Th>
                  <Th>User</Th>
                  <Th>Violation</Th>
                  <Th>Action</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <Td className="whitespace-nowrap text-ink-600">
                      {formatDateTime(v.createdAt, { dateOnly: true })}
                      <span className="block text-[11px] text-ink-500">by {v.issuedBy.name}</span>
                    </Td>
                    <Td>
                      <Link href={`/admin/users/${v.user.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                        {v.user.name}
                      </Link>
                      <span className="block text-[11px] text-ink-500">
                        {v.user.email} · <StatusBadge status={v.user.status} />
                      </span>
                    </Td>
                    <Td className="max-w-[280px]">
                      <span>
                        <Tone tone={v.severity === "critical" || v.severity === "high" ? "danger" : v.severity === "medium" ? "warning" : "neutral"}>{v.severity}</Tone> {statusLabel(v.type)}
                      </span>
                      <span className="line-clamp-2 text-[12px] text-ink-600">{v.description}</span>
                    </Td>
                    <Td>{statusLabel(v.actionTaken)}</Td>
                    <Td className="text-ink-600">{v.expiresAt ? formatDateTime(v.expiresAt, { dateOnly: true }) : "—"}</Td>
                    <Td>
                      <StatusBadge status={v.status} />
                      {v.appeals.length > 0 && <span className="block text-[11px] text-ink-500">appeal {v.appeals[v.appeals.length - 1].status}</span>}
                    </Td>
                    <Td>{v.status === "active" && <ConfirmButton label="Revoke" message="Revokes the violation and lifts a suspension/ban it caused (if no other active one remains)." action={revokeViolationAction.bind(null, v.id)} withReason size="sm" />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
        </div>
        <Card title="Issue a violation" description="Suspensions and bans revoke every session and hide the seller's listings." className="self-start">
          <ActionForm action={issueViolationAction} hidden={reportId ? { reportId } : {}} submitLabel="Record violation" variant="danger" resetOnSuccess>
            <Field label="Account email">
              <input name="email" type="email" required defaultValue={prefillEmail} className={adminInput} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select name="type" className={adminSelect} defaultValue="policy">
                  {VIOLATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {statusLabel(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Severity">
                <select name="severity" className={adminSelect} defaultValue="medium">
                  {VIOLATION_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Enforcement">
                <select name="actionTaken" className={adminSelect} defaultValue="warning">
                  {VIOLATION_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {statusLabel(a)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Expires (optional)">
                <input name="expiresAt" type="date" className={adminInput} />
              </Field>
            </div>
            <Field label="Restrictions (when enforcement = restriction)">
              <div className="flex flex-wrap gap-3">
                {USER_RESTRICTIONS.map((r) => (
                  <label key={r} className="flex items-center gap-1.5 text-[13px] text-ink-800">
                    <input type="checkbox" name="restrictions" value={r} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> {statusLabel(r)}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Description (shown to the user if notified)">
              <textarea name="description" rows={4} required minLength={5} className={adminTextarea} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="notify" defaultChecked className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Email and notify the user
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
