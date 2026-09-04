import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { RETURN_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Returns" };
export const dynamic = "force-dynamic";

export default async function AdminReturnsPage({ searchParams }: PageProps<"/admin/returns">) {
  await requireAdmin("returns.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "status", "updatedAt"] });
  const status = p.get("status") || "";
  const where: Prisma.ReturnRequestWhereInput = {
    ...(status === "open" ? { status: { in: ["requested", "approved", "shipped_back", "received"] } } : status ? { status } : {}),
    ...(p.q ? { OR: [{ order: { number: { contains: p.q.toUpperCase() } } }, { user: { email: { contains: p.q } } }, { user: { name: { contains: p.q } } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.returnRequest.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { order: { select: { id: true, number: true } }, user: { select: { name: true, email: true } }, orderItem: { select: { title: true, subtotal: true, discountAmount: true, seller: { select: { displayName: true } } } } } }),
    db.returnRequest.count({ where }),
    db.returnRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const open = counts.filter((c) => ["requested", "approved", "shipped_back", "received"].includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const base = "/admin/returns";
  return (
    <>
      <AdminPageHeader title="Returns" lead={`${open} open return${open === 1 ? "" : "s"}. Approve, track the item coming back, then refund from the return page.`} actions={<Link href="/admin/disputes" className={adminButton.outline}>Disputes →</Link>} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Order #, buyer" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            <option value="open">Open (needs action)</option>
            {RETURN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No returns" body="Buyers request returns from their order page within the return window." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>
                <SortLink base={base} params={p.params} sortKey="createdAt" label="Requested" current={p.sort} dir={p.dir} />
              </Th>
              <Th>Order</Th>
              <Th>Item</Th>
              <Th>Buyer</Th>
              <Th>Reason</Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="status" label="Status" current={p.sort} dir={p.dir} />
              </Th>
              <Th align="right">Value</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt, { dateOnly: true })}</Td>
                <Td>
                  <Link href={`/admin/orders/${r.order.id}`} className="font-mono text-[12px] text-brand-700">
                    {r.order.number}
                  </Link>
                </Td>
                <Td className="max-w-[260px]">
                  <span className="line-clamp-1 font-medium text-ink-950">{r.orderItem?.title ?? "Whole order"}</span>
                  {r.orderItem?.seller && <span className="text-[11px] text-ink-500">{r.orderItem.seller.displayName}</span>}
                </Td>
                <Td>
                  {r.user.name}
                  <span className="block text-[11px] text-ink-500">{r.user.email}</span>
                </Td>
                <Td className="text-ink-700">{statusLabel(r.reason)}</Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td align="right">{r.refundAmount !== null ? formatMoney(r.refundAmount) : r.orderItem ? formatMoney(r.orderItem.subtotal - r.orderItem.discountAmount) : "—"}</Td>
                <Td>
                  <Link href={`/admin/returns/${r.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
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
