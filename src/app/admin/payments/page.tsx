import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, adminButton, adminInput, adminSelect, DownloadLink } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { completeManualRefundAction } from "@/lib/admin/actions/orders";
import { listParams, pageCount, parseDate } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { PAYMENT_RECORD_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const admin = await requireAdmin("finance.view");
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && sp.tab === "refunds" ? "refunds" : "payments";
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "amount", "status"] });
  const status = p.get("status");
  const provider = p.get("provider");
  const from = p.get("from") ? parseDate(p.get("from"), new Date(0)) : null;
  const to = p.get("to") ? parseDate(p.get("to"), new Date()) : null;
  if (to) to.setUTCHours(23, 59, 59, 999);
  const base = "/admin/payments";
  const dateWhere = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  if (tab === "refunds") {
    const where: Prisma.RefundWhereInput = { ...(status ? { status } : {}), ...dateWhere, ...(p.q ? { OR: [{ order: { number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } } }, { order: { email: { contains: p.q, mode: "insensitive" as const } } }, { providerRef: { contains: p.q, mode: "insensitive" as const } }] } : {}) };
    const [rows, total, sum] = await Promise.all([
      db.refund.findMany({ where, orderBy: { [p.sort === "status" ? "status" : p.sort]: p.dir }, skip: p.skip, take: p.per, include: { order: { select: { id: true, number: true, email: true } }, payment: { select: { provider: true } }, createdBy: { select: { name: true } } } }),
      db.refund.count({ where }),
      db.refund.aggregate({ _sum: { amount: true }, where: { ...where, status: "succeeded" } }),
    ]);
    return (
      <>
        <AdminPageHeader title="Refunds" lead={`${total} refunds · ${formatMoney(sum._sum.amount ?? 0)} succeeded in this view`} actions={<Tabs tab={tab} />} />
        <FilterBar action={base} reset>
          <input type="hidden" name="tab" value="refunds" />
          <Field label="Search" className="min-w-[200px] flex-1">
            <input name="q" defaultValue={p.q} placeholder="Order #, email, provider ref" className={adminInput} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={status} className={adminSelect}>
              <option value="">Any</option>
              <option value="pending">pending</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
            </select>
          </Field>
          <Field label="From">
            <input name="from" type="date" defaultValue={p.get("from")} className={adminInput} />
          </Field>
          <Field label="To">
            <input name="to" type="date" defaultValue={p.get("to")} className={adminInput} />
          </Field>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState title="No refunds match" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Date" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Order</Th>
                <Th>Reason</Th>
                <Th>Provider</Th>
                <Th>By</Th>
                <Th>Status</Th>
                <Th align="right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt)}</Td>
                  <Td>
                    <Link href={`/admin/orders/${r.order.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                      {r.order.number}
                    </Link>
                    <span className="block text-[12px] text-ink-500">{r.order.email}</span>
                  </Td>
                  <Td>
                    {r.reason.replace(/_/g, " ")}
                    {r.note && <span className="block text-[12px] text-ink-500">{r.note}</span>}
                  </Td>
                  <Td>
                    {r.payment.provider}
                    {r.providerRef && <span className="block font-mono text-[11px] text-ink-500">{r.providerRef}</span>}
                  </Td>
                  <Td className="text-ink-600">{r.createdBy?.name ?? "system"}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td align="right">{formatMoney(r.amount)}</Td>
                  <Td>{r.status === "pending" && can(admin, "finance.manage") && <ConfirmButton label="Mark completed" message="Confirms the refund was sent manually." action={completeManualRefundAction.bind(null, r.id)} withReason reasonLabel="Reference" size="sm" />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
      </>
    );
  }

  const where: Prisma.PaymentWhereInput = { ...(status ? { status } : {}), ...(provider ? { provider } : {}), ...dateWhere, ...(p.q ? { OR: [{ order: { number: { contains: p.q.toUpperCase(), mode: "insensitive" as const } } }, { order: { email: { contains: p.q, mode: "insensitive" as const } } }, { providerRef: { contains: p.q, mode: "insensitive" as const } }, { cardLast4: { contains: p.q, mode: "insensitive" as const } }] } : {}) };
  const [rows, total, sum, fees] = await Promise.all([
    db.payment.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { order: { select: { id: true, number: true, email: true, status: true } } } }),
    db.payment.count({ where }),
    db.payment.aggregate({ _sum: { amount: true, refundedAmount: true }, where: { ...where, status: { in: ["succeeded", "partially_refunded", "refunded"] } } }),
    db.payment.aggregate({ _sum: { feeAmount: true }, where: { ...where, status: { in: ["succeeded", "partially_refunded", "refunded"] } } }),
  ]);
  return (
    <>
      <AdminPageHeader
        title="Payments"
        lead={`${total} transactions · captured ${formatMoney(sum._sum.amount ?? 0)} · refunded ${formatMoney(sum._sum.refundedAmount ?? 0)} · provider fees ${formatMoney(fees._sum.feeAmount ?? 0)}`}
        actions={
          <>
            <Tabs tab={tab} />
            {can(admin, "reports.export") && (
              <DownloadLink href={`/api/admin/export/payments?${new URLSearchParams(p.params as Record<string, string>).toString()}`} className={adminButton.outline}>
                Export CSV
              </DownloadLink>
            )}
          </>
        }
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Order #, email, provider ref, last 4" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {PAYMENT_RECORD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
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
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No payments match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>
                <SortLink base={base} params={p.params} sortKey="createdAt" label="Date" current={p.sort} dir={p.dir} />
              </Th>
              <Th>Order</Th>
              <Th>Provider</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th align="right">
                <SortLink base={base} params={p.params} sortKey="amount" label="Amount" current={p.sort} dir={p.dir} />
              </Th>
              <Th align="right">Refunded</Th>
              <Th align="right">Fee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pm) => (
              <tr key={pm.id}>
                <Td className="whitespace-nowrap text-ink-600">{formatDateTime(pm.createdAt)}</Td>
                <Td>
                  <Link href={`/admin/orders/${pm.order.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                    {pm.order.number}
                  </Link>
                  <span className="block text-[12px] text-ink-500">{pm.order.email}</span>
                </Td>
                <Td>
                  {pm.provider}
                  {pm.providerRef && <span className="block font-mono text-[11px] text-ink-500">{pm.providerRef}</span>}
                </Td>
                <Td>{pm.cardBrand ? `${pm.cardBrand} •••• ${pm.cardLast4}` : (pm.method ?? "—")}</Td>
                <Td>
                  <StatusBadge status={pm.status} />
                  {pm.failureMessage && <span className="block max-w-[200px] truncate text-[11px] text-rose-700">{pm.failureMessage}</span>}
                </Td>
                <Td align="right">
                  {formatMoney(pm.presentmentAmount, pm.currency)}
                  {pm.currency !== "USD" && <span className="block text-[11px] text-ink-500">{formatMoney(pm.amount)}</span>}
                </Td>
                <Td align="right">{pm.refundedAmount ? formatMoney(pm.refundedAmount) : "—"}</Td>
                <Td align="right">{pm.feeAmount ? formatMoney(pm.feeAmount, pm.currency) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}

function Tabs({ tab }: { tab: string }) {
  return (
    <div className="flex rounded-lg border border-ink-200 bg-white p-1">
      {[
        { key: "payments", label: "Payments" },
        { key: "refunds", label: "Refunds" },
      ].map((t) => (
        <Link key={t.key} href={`/admin/payments?tab=${t.key}`} className={`rounded-md px-3 py-1 text-[12px] font-medium ${tab === t.key ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
