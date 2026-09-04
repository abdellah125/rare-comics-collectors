import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, DownloadLink } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { bulkOrdersAction } from "@/lib/admin/actions/orders";
import { listParams, pageCount, parseDate } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { FULFILLMENT_STATUSES, ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const SORTS = ["placedAt", "total", "status", "riskScore"] as const;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const admin = await requireAdmin("orders.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "placedAt", sorts: SORTS });
  const status = p.get("status");
  const payment = p.get("payment");
  const fulfillment = p.get("fulfillment");
  const provider = p.get("provider");
  const from = p.get("from") ? parseDate(p.get("from"), new Date(0)) : null;
  const to = p.get("to") ? parseDate(p.get("to"), new Date()) : null;
  if (to) to.setUTCHours(23, 59, 59, 999);
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(fulfillment ? { fulfillmentStatus: fulfillment } : {}),
    ...(provider ? { payments: { some: { provider } } } : {}),
    ...(p.get("risk") ? { riskScore: { gte: 40 } } : {}),
    ...(from || to ? { placedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } }, { email: { contains: p.q, mode: "insensitive" as const } }, { user: { name: { contains: p.q, mode: "insensitive" as const } } }, { items: { some: { title: { contains: p.q, mode: "insensitive" as const } } } }] } : {}),
  };
  const [rows, total, sum] = await Promise.all([
    db.order.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { id: true, name: true } }, items: { select: { title: true, qty: true, sellerId: true } }, payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, status: true } } } }),
    db.order.count({ where }),
    db.order.aggregate({ _sum: { total: true }, where }),
  ]);
  const base = "/admin/orders";
  const manage = can(admin, "orders.manage");
  return (
    <>
      <AdminPageHeader
        title="Orders"
        lead={`${total.toLocaleString("en-US")} orders · ${formatMoney(sum._sum.total ?? 0)} in this view`}
        actions={can(admin, "reports.export") ? <DownloadLink href={`/api/admin/export/orders?${new URLSearchParams(p.params as Record<string, string>).toString()}`} className={adminButton.outline}>Export CSV</DownloadLink> : undefined}
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Order #, email, name, item" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment">
          <select name="payment" defaultValue={payment} className={adminSelect}>
            <option value="">Any</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fulfilment">
          <select name="fulfillment" defaultValue={fulfillment} className={adminSelect}>
            <option value="">Any</option>
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provider">
          <select name="provider" defaultValue={provider} className={adminSelect}>
            <option value="">Any</option>
            <option value="stripe">Stripe</option>
            <option value="paypal">PayPal</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="test">Test</option>
          </select>
        </Field>
        <Field label="From">
          <input name="from" type="date" defaultValue={p.get("from")} className={adminInput} />
        </Field>
        <Field label="To">
          <input name="to" type="date" defaultValue={p.get("to")} className={adminInput} />
        </Field>
        <label className="flex h-9 items-center gap-2 text-[13px] text-ink-800">
          <input type="checkbox" name="risk" value="1" defaultChecked={Boolean(p.get("risk"))} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Risky only
        </label>
      </FilterBar>
      <BulkProvider>
        {manage && <BulkActionsBar run={bulkOrdersAction} actions={[{ id: "processing", label: "Mark processing" }, { id: "cancel_unpaid", label: "Cancel unpaid", danger: true, confirm: "Cancel the unpaid orders among the {n} selected?" }]} />}
        {rows.length === 0 ? (
          <EmptyState title="No orders match" />
        ) : (
          <Table>
            <thead>
              <tr>
                {manage && (
                  <Th className="w-8">
                    <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                  </Th>
                )}
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Payment</Th>
                <Th>Fulfilment</Th>
                <Th>Status</Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="total" label="Total" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="riskScore" label="Risk" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="placedAt" label="Placed" current={p.sort} dir={p.dir} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-ink-50/60">
                  {manage && (
                    <Td>
                      <RowCheckbox id={o.id} label={o.number} />
                    </Td>
                  )}
                  <Td>
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                      {o.number}
                    </Link>
                    {o.items.some((i) => i.sellerId) && <span className="ml-1 text-[10px] uppercase text-ink-500">marketplace</span>}
                  </Td>
                  <Td>
                    {o.user ? (
                      <Link href={`/admin/users/${o.user.id}`} className="text-ink-900 hover:text-brand-700">
                        {o.user.name}
                      </Link>
                    ) : (
                      <span className="text-ink-700">Guest</span>
                    )}
                    <span className="block text-[12px] text-ink-500">{o.email}</span>
                  </Td>
                  <Td className="max-w-[260px] truncate text-ink-700">{o.items.map((i) => `${i.title}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</Td>
                  <Td>
                    <StatusBadge status={o.paymentStatus} />
                    <span className="block text-[11px] text-ink-500">{o.payments[0]?.provider ?? "—"}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={o.fulfillmentStatus} />
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td align="right">
                    {formatMoney(o.total)}
                    {o.currency !== "USD" && <span className="block text-[11px] text-ink-500">{formatMoney(o.presentmentTotal, o.currency)}</span>}
                  </Td>
                  <Td align="right">{o.riskScore >= 40 ? <Tone tone={o.riskScore >= 70 ? "danger" : "warning"}>{o.riskScore}</Tone> : <span className="text-ink-500">{o.riskScore}</span>}</Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(o.placedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </BulkProvider>
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
