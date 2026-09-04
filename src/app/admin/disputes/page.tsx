import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { DISPUTE_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Disputes" };
export const dynamic = "force-dynamic";

export default async function AdminDisputesPage({ searchParams }: PageProps<"/admin/disputes">) {
  await requireAdmin("disputes.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "status", "priority", "updatedAt"] });
  const status = p.get("status") || "";
  const where: Prisma.DisputeWhereInput = {
    ...(status === "open" ? { status: { notIn: ["resolved", "closed"] } } : status ? { status } : {}),
    ...(p.q ? { OR: [{ order: { number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } } }, { openedBy: { email: { contains: p.q, mode: "insensitive" as const } } }, { seller: { displayName: { contains: p.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total, openCount, cbCount] = await Promise.all([
    db.dispute.findMany({ where, orderBy: [{ [p.sort]: p.dir }], skip: p.skip, take: p.per, include: { order: { select: { id: true, number: true, total: true } }, openedBy: { select: { name: true, email: true } }, seller: { select: { displayName: true } }, orderItem: { select: { title: true } } } }),
    db.dispute.count({ where }),
    db.dispute.count({ where: { status: { notIn: ["resolved", "closed"] } } }),
    db.chargeback.count({ where: { status: { in: ["needs_response", "under_review"] } } }),
  ]);
  const base = "/admin/disputes";
  return (
    <>
      <AdminPageHeader
        title="Disputes"
        lead={`${openCount} open dispute${openCount === 1 ? "" : "s"}. Escalated cases are listed first when sorting by priority.`}
        actions={
          <Link href="/admin/disputes/chargebacks" className={adminButton.outline}>
            Chargebacks {cbCount > 0 && <Tone tone="danger">{cbCount}</Tone>}
          </Link>
        }
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Order #, buyer, seller" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            <option value="open">Open</option>
            {DISPUTE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No disputes" body="Buyers and sellers open disputes from an order; they land here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>
                <SortLink base={base} params={p.params} sortKey="createdAt" label="Opened" current={p.sort} dir={p.dir} />
              </Th>
              <Th>Order</Th>
              <Th>Item</Th>
              <Th>Opened by</Th>
              <Th>Seller</Th>
              <Th>Reason</Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="priority" label="Priority" current={p.sort} dir={p.dir} />
              </Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="status" label="Status" current={p.sort} dir={p.dir} />
              </Th>
              <Th align="right">Order total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(d.createdAt, { dateOnly: true })}</Td>
                <Td>
                  <Link href={`/admin/orders/${d.order.id}`} className="font-mono text-[12px] text-brand-700">
                    {d.order.number}
                  </Link>
                </Td>
                <Td className="max-w-[220px]">
                  <span className="line-clamp-1">{d.orderItem?.title ?? "Whole order"}</span>
                </Td>
                <Td>
                  {d.openedBy.name} <Tone tone="neutral">{d.openedByRole}</Tone>
                </Td>
                <Td className="text-ink-700">{d.seller?.displayName ?? "Marketplace"}</Td>
                <Td className="text-ink-700">{statusLabel(d.reason)}</Td>
                <Td>{d.priority === "high" ? <Tone tone="danger">high</Tone> : <span className="text-ink-600">{d.priority}</span>}</Td>
                <Td>
                  <StatusBadge status={d.status} />
                </Td>
                <Td align="right">{formatMoney(d.order.total)}</Td>
                <Td>
                  <Link href={`/admin/disputes/${d.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
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
