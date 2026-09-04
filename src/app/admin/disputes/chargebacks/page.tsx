import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { CHARGEBACK_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Chargebacks" };
export const dynamic = "force-dynamic";

export default async function AdminChargebacksPage({ searchParams }: PageProps<"/admin/disputes/chargebacks">) {
  await requireAdmin("disputes.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"] });
  const status = p.get("status") || "";
  const where: Prisma.ChargebackWhereInput = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ order: { number: { contains: p.q.toUpperCase() } } }, { providerRef: { contains: p.q } }] } : {}) };
  const [rows, total, lost] = await Promise.all([
    db.chargeback.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per, include: { order: { select: { id: true, number: true, email: true } }, payment: { select: { provider: true } } } }),
    db.chargeback.count({ where }),
    db.chargeback.aggregate({ _sum: { amount: true }, where: { status: "lost" } }),
  ]);
  const base = "/admin/disputes/chargebacks";
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Disputes", href: "/admin/disputes" }, { label: "Chargebacks" }]} title="Chargebacks" lead={`Card disputes raised with the payment provider (arrive via webhooks). Lost to date: ${formatMoney(lost._sum.amount ?? 0)}.`} actions={<Link href="/admin/disputes" className={adminButton.outline}>Disputes</Link>} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Order # or provider ref" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {CHARGEBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No chargebacks" body="Provider dispute webhooks (Stripe charge.dispute.*, PayPal CUSTOMER.DISPUTE.*) create entries here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Received</Th>
              <Th>Order</Th>
              <Th>Provider</Th>
              <Th>Reason</Th>
              <Th>Evidence due</Th>
              <Th>Status</Th>
              <Th align="right">Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(c.createdAt, { dateOnly: true })}</Td>
                <Td>
                  <Link href={`/admin/orders/${c.order.id}`} className="font-mono text-[12px] text-brand-700">
                    {c.order.number}
                  </Link>
                  <span className="block text-[11px] text-ink-500">{c.order.email}</span>
                </Td>
                <Td>
                  {c.payment.provider}
                  {c.providerRef && <span className="block font-mono text-[11px] text-ink-500">{c.providerRef}</span>}
                </Td>
                <Td className="text-ink-700">{c.reason ?? "—"}</Td>
                <Td className={c.evidenceDueAt && c.evidenceDueAt < new Date() && c.status === "needs_response" ? "text-rose-700" : "text-ink-600"}>{c.evidenceDueAt ? formatDateTime(c.evidenceDueAt, { dateOnly: true }) : "—"}</Td>
                <Td>
                  <StatusBadge status={c.status} />
                </Td>
                <Td align="right">{formatMoney(c.amount, c.currency)}</Td>
                <Td>
                  <Link href={`/admin/disputes/chargebacks/${c.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                    Open
                  </Link>
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
