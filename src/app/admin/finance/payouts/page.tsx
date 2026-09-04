import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, adminButton, adminInput, adminSelect, DownloadLink } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { payoutActionRun, runPayoutSchedulerAction } from "@/lib/admin/actions/finance";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { PAYOUT_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage({ searchParams }: PageProps<"/admin/finance/payouts">) {
  const admin = await requireAdmin("finance.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "amount", "status", "scheduledFor"] });
  const status = p.get("status");
  const where: Prisma.PayoutWhereInput = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ seller: { displayName: { contains: p.q } } }, { reference: { contains: p.q } }] } : {}) };
  const [rows, total, open] = await Promise.all([
    db.payout.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { seller: { select: { id: true, displayName: true, verificationStatus: true } } } }),
    db.payout.count({ where }),
    db.payout.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: { in: ["pending", "scheduled", "processing"] } } }),
  ]);
  const manage = can(admin, "payouts.manage");
  const base = "/admin/finance/payouts";
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Payouts" }]}
        title="Payouts"
        lead={`${open._count._all} open payout${open._count._all === 1 ? "" : "s"} totalling ${formatMoney(open._sum.amount ?? 0)}. Sending the money happens in your bank / PayPal; record the reference here.`}
        actions={
          <>
            {can(admin, "reports.export") && (
              <DownloadLink href="/api/admin/export/payouts" className={adminButton.outline}>
                Export CSV
              </DownloadLink>
            )}
            {manage && <ConfirmButton label="Run scheduler now" message="Creates scheduled payouts for every eligible seller (cleared balance above the minimum)." action={runPayoutSchedulerAction} variant="dark" />}
          </>
        }
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Seller or reference" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {PAYOUT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No payouts" body="Payouts appear when sellers have cleared balances above the minimum, or when created from a seller's page." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>
                <SortLink base={base} params={p.params} sortKey="createdAt" label="Created" current={p.sort} dir={p.dir} />
              </Th>
              <Th>Seller</Th>
              <Th>Destination</Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="scheduledFor" label="Scheduled" current={p.sort} dir={p.dir} />
              </Th>
              <Th>Status</Th>
              <Th align="right">
                <SortLink base={base} params={p.params} sortKey="amount" label="Amount" current={p.sort} dir={p.dir} />
              </Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((po) => (
              <tr key={po.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(po.createdAt, { dateOnly: true })}</Td>
                <Td>
                  <Link href={`/admin/sellers/${po.seller.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {po.seller.displayName}
                  </Link>
                  {po.seller.verificationStatus !== "verified" && <span className="block text-[11px] text-amber-700">not verified</span>}
                </Td>
                <Td className="text-ink-700">
                  {po.destinationMasked ?? po.method ?? "—"}
                  {po.reference && <span className="block font-mono text-[11px] text-ink-500">{po.reference}</span>}
                </Td>
                <Td className="text-ink-600">{po.scheduledFor ? formatDateTime(po.scheduledFor, { dateOnly: true }) : "—"}</Td>
                <Td>
                  <StatusBadge status={po.status} />
                  {po.failureReason && <span className="block text-[11px] text-rose-700">{po.failureReason}</span>}
                </Td>
                <Td align="right">{formatMoney(po.amount)}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    <Link href={`/admin/finance/payouts/${po.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                      Details
                    </Link>
                    {manage && ["pending", "scheduled", "processing"].includes(po.status) && <ConfirmButton label="Mark paid" message={`Confirm ${formatMoney(po.amount)} was sent to ${po.seller.displayName}.`} action={payoutActionRun.bind(null, po.id, "paid")} withReason reasonLabel="Transfer reference" variant="primary" size="sm" />}
                  </span>
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
