import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, Card, Tone } from "@/components/admin/ui";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { requireAdmin } from "@/lib/auth/session";
import { dashboardMetrics } from "@/lib/admin/metrics";
import { RANGE_PRESETS, resolveRange } from "@/lib/admin/query";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin("dashboard.view");
  const sp = await searchParams;
  const range = resolveRange(typeof sp.range === "string" ? sp.range : undefined);
  const m = await dashboardMetrics(range);
  const money = (v: number) => formatMoney(v, "USD", "en-US", { compact: true });

  const queue = [
    { label: "Orders to fulfil", value: m.pending.toFulfil, href: "/admin/orders?fulfillment=unfulfilled&payment=paid" },
    { label: "Awaiting payment", value: m.pending.unpaidOrders, href: "/admin/orders?status=pending_payment" },
    { label: "Open disputes", value: m.pending.disputes, href: "/admin/disputes" },
    { label: "Chargebacks", value: m.pending.chargebacks, href: "/admin/disputes/chargebacks" },
    { label: "Return requests", value: m.pending.returns, href: "/admin/returns" },
    { label: "Open tickets", value: m.pending.tickets, href: "/admin/support" },
    { label: "Seller verifications", value: m.pending.verifications, href: "/admin/sellers?verification=pending" },
    { label: "Seller applications", value: m.people.sellersPending, href: "/admin/sellers?status=pending" },
    { label: "Listings to review", value: m.pending.listingsPending, href: "/admin/products?status=pending" },
    { label: "Failed payments (24h)", value: m.pending.failedPayments, href: "/admin/payments?status=failed" },
    { label: "Payouts due", value: m.pending.payoutsDueCount, sub: money(m.pending.payoutsDue), href: "/admin/finance/payouts" },
  ];

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        lead={`${range.label} · compared with the previous period`}
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1" role="group" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <Link key={p.key} href={`/admin?range=${p.key}`} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${range.key === p.key ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"}`} aria-current={range.key === p.key ? "true" : undefined}>
                {p.label}
              </Link>
            ))}
          </div>
        }
      />

      {m.alerts.length > 0 && (
        <ul className="mb-6 grid gap-2">
          {m.alerts.map((a) => (
            <li key={a.text} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-[13px] ring-1 ${a.level === "critical" ? "bg-rose-50 text-rose-800 ring-rose-200" : a.level === "warning" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-ink-100 text-ink-800 ring-ink-200"}`}>
              <span>
                <span aria-hidden className="mr-1.5">{a.level === "critical" ? "⛔" : a.level === "warning" ? "⚠️" : "ℹ️"}</span>
                {a.text}
              </span>
              {a.href && (
                <Link href={a.href} className="font-semibold underline underline-offset-2">
                  Review
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatTile label="GMV" value={money(m.totals.gmv)} delta={m.deltas.gmv} trend={m.series.gmv.slice(-12).map((v) => v / 100)} href="/admin/reports?report=sales" />
        <StatTile label="Platform revenue" value={money(m.totals.revenue)} delta={m.deltas.revenue} sub={`fees ${money(m.totals.fees)} · house ${money(m.totals.houseSales)}`} href="/admin/reports?report=revenue" />
        <StatTile label="Orders" value={m.totals.orders.toLocaleString("en-US")} delta={m.deltas.orders} sub={`AOV ${money(m.totals.aov)}`} href="/admin/orders" />
        <StatTile label="Refunds" value={money(m.totals.refunds)} delta={m.deltas.refunds} upIsGood={false} sub={`${m.totals.refundCount} refund${m.totals.refundCount === 1 ? "" : "s"}`} href="/admin/payments?tab=refunds" />
        <StatTile label="Payouts sent" value={money(m.totals.payouts)} sub={`${m.totals.payoutCount} payout${m.totals.payoutCount === 1 ? "" : "s"}`} href="/admin/finance/payouts" />
        <StatTile label="Shipping & tax collected" value={money(m.totals.shipping + m.totals.tax)} sub={`ship ${money(m.totals.shipping)} · tax ${money(m.totals.tax)}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <LineChart title={`GMV — ${range.label}`} labels={m.series.labels} series={[{ name: "GMV", points: m.series.gmv.map((v) => v / 100) }]} format="moneyCompact" />
        </div>
        <BarChart title="Orders" labels={m.series.labels} values={m.series.orders} height={240} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Needs attention" className="lg:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {queue.map((q) => (
              <li key={q.label}>
                <Link href={q.href} className="flex items-center justify-between rounded-lg border border-ink-200 px-3 py-2 text-[13px] hover:border-brand-300 hover:bg-brand-50/40">
                  <span className="text-ink-800">{q.label}</span>
                  <span className="flex items-center gap-2">
                    {q.sub && <span className="text-[12px] text-ink-500">{q.sub}</span>}
                    <Tone tone={q.value > 0 ? "warning" : "neutral"}>{q.value}</Tone>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="People">
          <dl className="grid gap-3 text-sm">
            {[
              { l: "Active users (30d)", v: m.people.activeUsers, href: "/admin/users" },
              { l: `New users (${range.label.toLowerCase()})`, v: m.people.newUsers, href: "/admin/users?sort=createdAt" },
              { l: "Buyers with a paid order", v: m.people.buyers, href: "/admin/users?buyers=1" },
              { l: "Approved sellers", v: m.people.sellersApproved, href: "/admin/sellers?status=approved" },
              { l: "Pending sellers", v: m.people.sellersPending, href: "/admin/sellers?status=pending" },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between">
                <dt className="text-ink-600">
                  <Link href={r.href} className="hover:text-brand-700">
                    {r.l}
                  </Link>
                </dt>
                <dd className="text-base font-semibold text-ink-950">{r.v.toLocaleString("en-US")}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
