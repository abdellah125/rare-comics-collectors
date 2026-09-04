import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/account/ui";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { StatTile } from "@/components/charts/stat-tile";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Performance", description: "Sales, conversion and service metrics.", path: "/dashboard/performance", noIndex: true });

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PerformancePage() {
  const user = await requireSeller({ next: "/dashboard/performance" });
  const sellerId = user.seller.id;
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: monthKey(d), label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) });
  }
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1));
  const [items, profile, views, disputes, returns, shippedItems, listings] = await Promise.all([
    db.orderItem.findMany({ where: { sellerId, order: { paidAt: { gte: since } }, status: { notIn: ["cancelled", "refunded"] } }, select: { sellerNet: true, subtotal: true, discountAmount: true, qty: true, order: { select: { paidAt: true } } } }),
    db.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, select: { ratingAvg: true, ratingCount: true, salesCount: true, handlingDays: true } }),
    db.product.aggregate({ _sum: { viewCount: true, soldCount: true }, where: { sellerId } }),
    db.dispute.count({ where: { sellerId, createdAt: { gte: since } } }),
    db.returnRequest.count({ where: { orderItem: { sellerId }, createdAt: { gte: since } } }),
    db.orderItem.findMany({ where: { sellerId, shipmentId: { not: null }, order: { paidAt: { gte: since } } }, select: { order: { select: { paidAt: true } }, shipment: { select: { shippedAt: true } } } }),
    db.product.count({ where: { sellerId, status: "published", deletedAt: null } }),
  ]);
  const netByMonth = months.map((m) => items.filter((i) => i.order.paidAt && monthKey(i.order.paidAt) === m.key).reduce((n, i) => n + i.sellerNet, 0));
  const grossByMonth = months.map((m) => items.filter((i) => i.order.paidAt && monthKey(i.order.paidAt) === m.key).reduce((n, i) => n + i.subtotal - i.discountAmount, 0));
  const unitsByMonth = months.map((m) => items.filter((i) => i.order.paidAt && monthKey(i.order.paidAt) === m.key).reduce((n, i) => n + i.qty, 0));
  const totalUnits = unitsByMonth.reduce((a, b) => a + b, 0);
  const onTime = shippedItems.filter((s) => s.shipment?.shippedAt && s.order.paidAt && s.shipment.shippedAt.getTime() - s.order.paidAt.getTime() <= profile.handlingDays * 86_400_000 * 1.4).length;
  const onTimeRate = shippedItems.length ? Math.round((onTime / shippedItems.length) * 100) : null;
  const conversion = (views._sum.viewCount ?? 0) > 0 ? ((views._sum.soldCount ?? 0) / (views._sum.viewCount ?? 1)) * 100 : null;
  const lastIdx = months.length - 1;
  const delta = grossByMonth[lastIdx - 1] > 0 ? ((grossByMonth[lastIdx] - grossByMonth[lastIdx - 1]) / grossByMonth[lastIdx - 1]) * 100 : null;

  return (
    <div className="grid gap-8">
      <PageHeader title="Performance" lead="Six-month view. Net = after marketplace commission." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gross sales this month" value={formatMoney(grossByMonth[lastIdx])} delta={delta} deltaLabel="vs last month" trend={grossByMonth.map((v) => v / 100)} />
        <StatTile label="Units sold, 6 months" value={String(totalUnits)} sub={`${listings} live listings`} />
        <StatTile label="View → sale conversion" value={conversion === null ? "—" : `${conversion.toFixed(1)}%`} sub={`${(views._sum.viewCount ?? 0).toLocaleString("en-US")} listing views`} />
        <StatTile label="On-time shipping" value={onTimeRate === null ? "—" : `${onTimeRate}%`} sub={`within ${profile.handlingDays} business day${profile.handlingDays === 1 ? "" : "s"}`} />
      </div>
      <LineChart title="Sales by month" labels={months.map((m) => m.label)} series={[{ name: "Gross", points: grossByMonth.map((v) => v / 100) }, { name: "Net", points: netByMonth.map((v) => v / 100) }]} format="moneyCompact" />
      <BarChart title="Units sold by month" labels={months.map((m) => m.label)} values={unitsByMonth} />
      <Panel title="Service quality">
        <dl className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-ink-600">Rating</dt>
            <dd className="text-lg font-semibold text-ink-950">
              {profile.ratingAvg.toFixed(1)} / 5 <span className="text-[12px] font-normal text-ink-500">({profile.ratingCount})</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-600">Dispute rate</dt>
            <dd className="text-lg font-semibold text-ink-950">{totalUnits ? `${((disputes / totalUnits) * 100).toFixed(1)}%` : "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-600">Return rate</dt>
            <dd className="text-lg font-semibold text-ink-950">{totalUnits ? `${((returns / totalUnits) * 100).toFixed(1)}%` : "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[13px] text-ink-600">Marketplaces reward fast shipping and low dispute rates: keep on-time above 95% and disputes under 1% to stay eligible for featured placement.</p>
      </Panel>
    </div>
  );
}
