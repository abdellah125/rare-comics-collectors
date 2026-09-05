import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { countryLabel, countryNames, isInternational } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Seller orders", description: "Orders containing your items.", path: "/dashboard/orders", noIndex: true });

const FILTERS = [
  { key: "to_ship", label: "To ship", statuses: ["paid", "processing"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "issues", label: "Cancelled / refunded", statuses: ["cancelled", "refunded", "returned"] },
  { key: "all", label: "All", statuses: [] },
];

export default async function SellerOrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const user = await requireSeller({ next: "/dashboard/orders" });
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter) ?? FILTERS[0];
  const items = await db.orderItem.findMany({
    where: { sellerId: user.seller.id, ...(filter.statuses.length ? { status: { in: filter.statuses } } : {}), order: { paymentStatus: { in: ["paid", "partially_refunded", "refunded"] } } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { order: { select: { id: true, number: true, placedAt: true, status: true, countryCode: true, shippingAddressJson: true } }, shipment: { select: { status: true, trackingNumber: true } } },
  });
  const [seller, names] = await Promise.all([db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id }, select: { handlingDays: true, shipsFromCountry: true, countryCode: true } }), countryNames()]);
  const shipsFrom = seller.shipsFromCountry ?? seller.countryCode;
  const grouped = new Map<string, typeof items>();
  for (const i of items) grouped.set(i.order.number, [...(grouped.get(i.order.number) ?? []), i]);
  // Handling time is in business days; allow the weekend before flagging an order as late.
  const handlingMs = (seller.handlingDays + 2) * 86_400_000;
  return (
    <div className="grid gap-6">
      <PageHeader title="Orders" lead="Ship within your handling time and add tracking so buyers get updates automatically." />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/dashboard/orders?filter=${f.key}`} className={`rounded-full border px-3 py-1 text-[13px] ${filter.key === f.key ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
            {f.label}
          </Link>
        ))}
      </div>
      {grouped.size === 0 ? (
        <EmptyState title="Nothing here" body={filter.key === "to_ship" ? "New paid orders will appear here the moment payment clears." : "No orders match this filter."} />
      ) : (
        <ul className="grid gap-3">
          {[...grouped.entries()].map(([number, rows]) => {
            const order = rows[0].order;
            const late = rows.some((r) => r.status === "paid") && new Date().getTime() - order.placedAt.getTime() > handlingMs;
            return (
              <li key={number} className="rounded-xl border border-ink-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/dashboard/orders/${number}`} className="font-mono text-sm font-semibold text-ink-950 hover:text-brand-700">
                      {number}
                    </Link>
                    <p className="text-[13px] text-ink-600">
                      {formatDateTime(order.placedAt, { timeZone: user.timezone })} · ships to {countryLabel(names, order.countryCode)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isInternational(shipsFrom, order.countryCode) && <Badge tone="neutral">International</Badge>}
                    {late && <Badge tone="sale">Past handling time</Badge>}
                    <Badge tone={rows.every((r) => r.status === "delivered") ? "brand" : rows.some((r) => r.status === "paid") ? "gold" : "neutral"}>{statusLabel(rows.some((r) => r.status === "paid") ? "to ship" : rows[0].status)}</Badge>
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-ink-100">
                  {rows.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span className="text-ink-900">
                        {i.title} × {i.qty}
                        {i.shipment?.trackingNumber && <span className="ml-2 font-mono text-[12px] text-ink-500">{i.shipment.trackingNumber}</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <Badge tone={i.status === "paid" ? "gold" : i.status === "delivered" ? "brand" : "neutral"}>{statusLabel(i.status)}</Badge>
                        <span className="tabular-nums text-ink-950">{formatMoney(i.sellerNet)} net</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
