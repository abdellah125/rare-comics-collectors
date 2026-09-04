import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, Card, Kv, Table, Td, Th, adminButton, adminInput, DownloadLink } from "@/components/admin/ui";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { requireAdmin, can } from "@/lib/auth/session";
import { RANGE_PRESETS, resolveRange } from "@/lib/admin/query";
import { buildReport } from "@/lib/admin/reports";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Reports & analytics" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const admin = await requireAdmin("reports.view");
  const sp = await searchParams;
  const key = typeof sp.range === "string" ? sp.range : undefined;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const range = resolveRange(from || to ? "custom" : key, { from, to });
  const r = await buildReport(range);
  const money = (v: number) => formatMoney(v);
  const qs = `range=${range.key}${range.key === "custom" ? `&from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}` : ""}`;
  const exportLink = (name: string) => (can(admin, "reports.export") ? <DownloadLink href={`/api/admin/export/${name}?${qs}`} className="text-[12px] font-semibold text-brand-700">CSV ↓</DownloadLink> : null);
  const t = r.totals;
  return (
    <>
      <AdminPageHeader
        title="Reports & analytics"
        lead={`${range.label}. Money is in the base currency; GMV counts paid orders by payment date.`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1" role="group" aria-label="Date range">
              {RANGE_PRESETS.map((p) => (
                <Link key={p.key} href={`/admin/reports?range=${p.key}`} className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${range.key === p.key ? "bg-ink-950 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
                  {p.label}
                </Link>
              ))}
            </div>
            <form className="flex items-end gap-1" action="/admin/reports">
              <input type="date" name="from" defaultValue={range.key === "custom" ? range.from.toISOString().slice(0, 10) : ""} className={`${adminInput} h-8 w-auto text-[12px]`} aria-label="From" />
              <input type="date" name="to" defaultValue={range.key === "custom" ? range.to.toISOString().slice(0, 10) : ""} className={`${adminInput} h-8 w-auto text-[12px]`} aria-label="To" />
              <button type="submit" className={`${adminButton.outline} ${adminButton.sm}`}>
                Apply
              </button>
            </form>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="GMV" value={money(t.gmv)} trend={r.series.gmv.map((v) => v / 100)} sub={`${t.orders} orders · AOV ${money(t.aov)}`} />
        <StatTile label="Net platform revenue" value={money(t.netRevenue)} sub={`commission ${money(t.commission)} + house ${money(t.houseSales)} − refunds`} />
        <StatTile label="Refunds" value={money(t.refunds)} upIsGood={false} trend={r.series.refunds.map((v) => v / 100)} sub={`${t.refundCount} refunds · ${t.chargebackCount} chargebacks (${money(t.chargebacksLost)} lost)`} />
        <StatTile label="Provider fees" value={money(t.providerFees)} upIsGood={false} sub={`paid out ${money(t.payouts)} in ${t.payoutCount} payouts`} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="New users" value={t.newUsers.toLocaleString("en-US")} sub={`${t.newSellers} new sellers`} href="/admin/users?sort=createdAt" />
        <StatTile label="Buyers" value={t.buyers.toLocaleString("en-US")} sub={`${Math.round(t.repeatRate * 100)}% repeat · ${t.guestOrders} guest orders`} />
        <StatTile label="Cases opened" value={(t.disputes + t.returns).toLocaleString("en-US")} upIsGood={false} sub={`${t.returns} returns · ${t.disputes} disputes · ${t.tickets} tickets`} />
        <StatTile label="Lifetime view → sale" value={t.lifetimeViews ? `${((t.lifetimeSold / t.lifetimeViews) * 100).toFixed(2)}%` : "—"} sub={`${t.lifetimeSold} sold / ${t.lifetimeViews.toLocaleString("en-US")} views · ${t.reviews} reviews in range`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LineChart title="GMV vs refunds" labels={r.series.labels} series={[{ name: "GMV", points: r.series.gmv.map((v) => v / 100) }, { name: "Refunds", points: r.series.refunds.map((v) => v / 100) }]} format="moneyCompact" />
        <BarChart title="Paid orders" labels={r.series.labels} values={r.series.orders} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Order composition" description="Sum over paid orders in range.">
          <Kv items={[{ label: "Items subtotal", value: money(t.gmv - t.shipping - t.tax + t.discounts) }, { label: "Discounts", value: `− ${money(t.discounts)}` }, { label: "Shipping collected", value: money(t.shipping) }, { label: "Tax collected", value: money(t.tax) }, { label: "GMV (paid)", value: money(t.gmv) }]} />
        </Card>
        <Card title="Payment methods" actions={exportLink("payment_methods")}>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-ink-100">
              {r.paymentMethods.map((p) => (
                <tr key={p.provider}>
                  <td className="py-1.5">{p.provider}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(p.amount)}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-500">fees {money(p.fees)}</td>
                </tr>
              ))}
              {r.paymentMethods.length === 0 && (
                <tr>
                  <td className="py-2 text-ink-500">No payments in range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="Refund reasons" actions={exportLink("refunds")}>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-ink-100">
              {r.refundReasons.map((x) => (
                <tr key={x.reason}>
                  <td className="py-1.5">{x.reason.replace(/_/g, " ")}</td>
                  <td className="py-1.5 text-right tabular-nums">{x.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(x.amount)}</td>
                </tr>
              ))}
              {r.refundReasons.length === 0 && (
                <tr>
                  <td className="py-2 text-ink-500">No refunds in range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {(
          [
            ["Top products", "top_products", r.topProducts],
            ["Top sellers", "top_sellers", r.topSellers],
            ["Top categories", "top_categories", r.topCategories],
          ] as const
        ).map(([title, name, rows]) => (
          <Card key={name} title={title} actions={exportLink(name)}>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((x) => (
                  <tr key={x.key}>
                    <Td className="max-w-[220px] truncate">{x.label}</Td>
                    <Td align="right">{x.qty}</Td>
                    <Td align="right">{money(x.revenue)}</Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <Td className="text-ink-500">Nothing sold in range.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Geography (ship-to country)" actions={exportLink("geography")}>
          <Table>
            <thead>
              <tr>
                <Th>Country</Th>
                <Th align="right">Orders</Th>
                <Th align="right">GMV</Th>
                <Th align="right">Share</Th>
              </tr>
            </thead>
            <tbody>
              {r.geography.slice(0, 15).map((g) => (
                <tr key={g.country}>
                  <Td className="font-mono">{g.country}</Td>
                  <Td align="right">{g.orders}</Td>
                  <Td align="right">{money(g.gmv)}</Td>
                  <Td align="right">{t.gmv ? `${((g.gmv / t.gmv) * 100).toFixed(1)}%` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Coupon performance" actions={exportLink("coupons")}>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th align="right">Uses</Th>
                <Th align="right">Discount given</Th>
              </tr>
            </thead>
            <tbody>
              {r.coupons.slice(0, 15).map((c) => (
                <tr key={c.code}>
                  <Td className="font-mono">{c.code}</Td>
                  <Td align="right">{c.uses}</Td>
                  <Td align="right">{money(c.amount)}</Td>
                </tr>
              ))}
              {r.coupons.length === 0 && (
                <tr>
                  <Td className="text-ink-500">No redemptions in range.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
      {can(admin, "reports.export") && (
        <Card title="Raw exports" description="Full tables for the selected range (orders, payments, refunds by date; catalogue and people are complete)." className="mt-6">
          <div className="flex flex-wrap gap-2">
            {["orders", "order_items", "payments", "refunds", "payouts", "ledger", "products", "users", "sellers", "tickets", "sales_by_day"].map((n) => (
              <a key={n} href={`/api/admin/export/${n}?${qs}`} className={`${adminButton.outline} ${adminButton.sm}`}>
                {n.replace(/_/g, " ")}.csv
              </a>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
