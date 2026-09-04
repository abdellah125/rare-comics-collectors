import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader, Card, Field, Kv, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { LineChart } from "@/components/charts/line-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { requireAdmin, can } from "@/lib/auth/session";
import { saveFeesAction } from "@/lib/admin/actions/finance";
import { bucketize, resolveRange } from "@/lib/admin/query";
import { db } from "@/lib/db";
import { platformRevenue } from "@/lib/finance/ledger";
import { bpsToPercent, formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  const admin = await requireAdmin("finance.view");
  const range = resolveRange("90d");
  const settings = await getSettings();
  const [rev, ledgerAvailable, ledgerPending, payoutsPending, payoutsPaid, feesByProvider, refundsPending, buckets] = await Promise.all([
    platformRevenue(range.from, range.to),
    db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { payoutId: null, availableAt: { lte: new Date() } } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { payoutId: null, availableAt: { gt: new Date() } } }),
    db.payout.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: { in: ["pending", "scheduled", "processing"] } } }),
    db.payout.aggregate({ _sum: { amount: true }, where: { status: "paid", paidAt: { gte: range.from } } }),
    db.payment.groupBy({ by: ["provider"], _sum: { feeAmount: true, amount: true }, _count: { _all: true }, where: { status: { in: ["succeeded", "partially_refunded", "refunded"] }, createdAt: { gte: range.from } } }),
    db.refund.count({ where: { status: "pending" } }),
    Promise.resolve(bucketize(range)),
  ]);
  const ledger = await db.ledgerEntry.findMany({ where: { type: { in: ["commission", "commission_reversal"] }, createdAt: { gte: range.from } }, select: { amount: true, createdAt: true } });
  const feeSeries = new Array(buckets.labels.length).fill(0);
  for (const e of ledger) feeSeries[buckets.index(e.createdAt)] += -e.amount;
  const house = await db.orderItem.findMany({ where: { sellerId: null, order: { paidAt: { gte: range.from }, paymentStatus: { in: ["paid", "partially_refunded"] } } }, select: { subtotal: true, discountAmount: true, order: { select: { paidAt: true } } } });
  const houseSeries = new Array(buckets.labels.length).fill(0);
  for (const i of house) if (i.order.paidAt) houseSeries[buckets.index(i.order.paidAt)] += i.subtotal - i.discountAmount;

  return (
    <>
      <AdminPageHeader
        title="Finance"
        lead="Marketplace revenue, seller balances, payouts and the fee configuration. Last 90 days unless stated."
        actions={
          <>
            <Link href="/admin/finance/payouts" className={adminButton.outline}>
              Payouts
            </Link>
            <Link href="/admin/finance/payments" className={adminButton.outline}>
              Payment providers
            </Link>
            <Link href="/admin/finance/currencies" className={adminButton.outline}>
              Currencies
            </Link>
            <Link href="/admin/finance/taxes" className={adminButton.outline}>
              Taxes
            </Link>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Commission earned (90d)" value={formatMoney(rev.commissionNet)} trend={feeSeries.map((v) => v / 100)} />
        <StatTile label="House sales (90d)" value={formatMoney(rev.houseSales)} trend={houseSeries.map((v) => v / 100)} />
        <StatTile label="Refunds (90d)" value={formatMoney(rev.refunds)} upIsGood={false} sub={refundsPending ? `${refundsPending} pending manual refund${refundsPending === 1 ? "" : "s"}` : undefined} href="/admin/payments?tab=refunds" />
        <StatTile label="Paid out (90d)" value={formatMoney(payoutsPaid._sum.amount ?? 0)} href="/admin/finance/payouts" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LineChart title="Platform revenue by period" labels={buckets.labels} series={[{ name: "Commission", points: feeSeries.map((v) => v / 100) }, { name: "House sales", points: houseSeries.map((v) => v / 100) }]} format="moneyCompact" />
        </div>
        <Card title="Seller liabilities" description="Money owed to sellers across the marketplace.">
          <Kv items={[{ label: "Available to pay", value: formatMoney(ledgerAvailable._sum.amount ?? 0) }, { label: "Clearing (held)", value: formatMoney(ledgerPending._sum.amount ?? 0) }, { label: "In open payouts", value: `${formatMoney(payoutsPending._sum.amount ?? 0)} (${payoutsPending._count._all})` }]} />
          <Link href="/admin/finance/payouts" className="mt-3 inline-block text-[13px] font-semibold text-brand-700">
            Manage payouts →
          </Link>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="By payment provider (90d)">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
              <tr>
                <th className="py-1">Provider</th>
                <th className="py-1 text-right">Payments</th>
                <th className="py-1 text-right">Captured</th>
                <th className="py-1 text-right">Provider fees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {feesByProvider.map((r) => (
                <tr key={r.provider}>
                  <td className="py-1.5">{r.provider}</td>
                  <td className="py-1.5 text-right tabular-nums">{r._count._all}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(r._sum.amount ?? 0)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(r._sum.feeAmount ?? 0)}</td>
                </tr>
              ))}
              {feesByProvider.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-ink-500">
                    No captured payments in range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Commission & payout rules" description={`Current commission ${bpsToPercent(settings["commerce.commissionBps"])}; sellers can carry individual overrides.`}>
          {can(admin, "finance.manage") ? (
            <ActionForm action={saveFeesAction} submitLabel="Save rules">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Commission (bps)" hint="1000 = 10%">
                  <input name="commissionBps" type="number" min={0} max={10000} defaultValue={settings["commerce.commissionBps"]} className={adminInput} />
                </Field>
                <Field label="Buyer service fee (bps)" hint="0 = none">
                  <input name="buyerFeeBps" type="number" min={0} max={10000} defaultValue={settings["commerce.buyerFeeBps"]} className={adminInput} />
                </Field>
                <Field label="Payout schedule">
                  <select name="payoutSchedule" defaultValue={settings["payouts.schedule"]} className={adminSelect}>
                    <option value="manual">Manual</option>
                    <option value="weekly">Weekly (Mondays)</option>
                    <option value="biweekly">Every two weeks</option>
                    <option value="monthly">Monthly (1st)</option>
                  </select>
                </Field>
                <Field label="Minimum payout (cents)">
                  <input name="minAmount" type="number" min={0} defaultValue={settings["payouts.minAmount"]} className={adminInput} />
                </Field>
                <Field label="Holding period (days)" hint="Sales clear after this many days.">
                  <input name="holdDays" type="number" min={0} max={90} defaultValue={settings["payouts.holdDays"]} className={adminInput} />
                </Field>
                <Field label="Tax mode">
                  <select name="taxMode" defaultValue={settings["commerce.taxMode"]} className={adminSelect}>
                    <option value="exclusive">Added at checkout</option>
                    <option value="inclusive">Included in prices</option>
                  </select>
                </Field>
              </div>
            </ActionForm>
          ) : (
            <Kv items={[{ label: "Commission", value: bpsToPercent(settings["commerce.commissionBps"]) }, { label: "Payout schedule", value: settings["payouts.schedule"] }, { label: "Minimum payout", value: formatMoney(settings["payouts.minAmount"]) }, { label: "Holding period", value: `${settings["payouts.holdDays"]} days` }]} />
          )}
        </Card>
      </div>
    </>
  );
}
