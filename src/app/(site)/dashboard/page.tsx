import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { sellerBalance } from "@/lib/finance/ledger";
import { formatDateTime } from "@/lib/i18n";
import { countryLabel, countryNames, isInternational } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Seller dashboard", description: "Sales, listings and payouts at a glance.", path: "/dashboard", noIndex: true });

export default async function SellerOverviewPage() {
  const user = await requireSeller({ next: "/dashboard" });
  const sellerId = user.seller.id;
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const [balance, toShip, activeListings, pendingListings, sales30, openReturns, openDisputes, recentItems, profile] = await Promise.all([
    sellerBalance(sellerId),
    db.orderItem.count({ where: { sellerId, status: "paid", kind: "comic" } }),
    db.product.count({ where: { sellerId, status: "published", deletedAt: null } }),
    db.product.count({ where: { sellerId, status: "pending", deletedAt: null } }),
    db.orderItem.aggregate({ _sum: { sellerNet: true }, _count: { _all: true }, where: { sellerId, order: { paidAt: { gte: since30 } }, status: { notIn: ["cancelled", "refunded"] } } }),
    db.returnRequest.count({ where: { orderItem: { sellerId }, status: { in: ["requested", "approved", "shipped_back"] } } }),
    db.dispute.count({ where: { sellerId, status: { notIn: ["resolved", "closed"] } } }),
    db.orderItem.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 6, include: { order: { select: { number: true, placedAt: true, status: true } } } }),
    db.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, select: { ratingAvg: true, ratingCount: true, salesCount: true, verificationStatus: true, payoutMethod: true, shipsFromCountry: true, countryCode: true, shipsToJson: true } }),
  ]);
  const [destinations, names, toShipOrders] = await Promise.all([
    db.orderItem.findMany({ where: { sellerId, order: { paidAt: { gte: since30 } }, status: { notIn: ["cancelled", "refunded"] } }, select: { qty: true, order: { select: { countryCode: true } } } }),
    countryNames(),
    db.orderItem.findMany({ where: { sellerId, status: "paid", kind: "comic" }, select: { order: { select: { countryCode: true } } } }),
  ]);
  const shipsFrom = profile.shipsFromCountry ?? profile.countryCode;
  const byCountry = new Map<string, number>();
  for (const d of destinations) byCountry.set(d.order.countryCode ?? "??", (byCountry.get(d.order.countryCode ?? "??") ?? 0) + d.qty);
  const topDestinations = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const internationalToShip = toShipOrders.filter((i) => isInternational(shipsFrom, i.order.countryCode)).length;
  const shipsTo = JSON.parse(profile.shipsToJson || "[]") as string[];

  return (
    <div className="grid gap-8">
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} lead="Here's what needs your attention." actions={<ButtonLink href="/dashboard/listings/new" size="sm">+ New listing</ButtonLink>} />
      {(profile.verificationStatus !== "verified" || !profile.payoutMethod) && (
        <Panel tone="muted">
          <ul className="grid gap-2 text-sm text-ink-800">
            {profile.verificationStatus !== "verified" && (
              <li>
                Identity verification is <strong>{profile.verificationStatus}</strong> — payouts are released once verified.{" "}
                <Link href="/dashboard/settings#verification" className="text-brand-700 underline-offset-2 hover:underline">
                  Upload documents
                </Link>
              </li>
            )}
            {!profile.payoutMethod && (
              <li>
                No payout method on file.{" "}
                <Link href="/dashboard/settings#payouts" className="text-brand-700 underline-offset-2 hover:underline">
                  Add one
                </Link>
              </li>
            )}
          </ul>
        </Panel>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Available balance", value: formatMoney(balance.available), href: "/dashboard/balance" },
          { label: "Pending (clearing)", value: formatMoney(balance.pending), href: "/dashboard/balance" },
          { label: "Net sales, 30 days", value: formatMoney(sales30._sum.sellerNet ?? 0), sub: `${sales30._count._all} item${sales30._count._all === 1 ? "" : "s"}`, href: "/dashboard/performance" },
          { label: "To ship", value: String(toShip), href: "/dashboard/orders", tone: toShip > 0 ? "attention" : undefined },
        ].map((s) => (
          <Link key={s.label} href={s.href} className={`rounded-xl border p-5 transition hover:border-brand-300 ${s.tone === "attention" ? "border-gold-400/60 bg-gold-400/10" : "border-ink-200 bg-ink-50 hover:bg-white"}`}>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink-950">{s.value}</p>
            {s.sub && <p className="text-[12px] text-ink-500">{s.sub}</p>}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/listings" className="rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">Listings</p>
          <p className="mt-1 text-sm text-ink-800">
            <strong>{activeListings}</strong> live{pendingListings > 0 && <>, <strong>{pendingListings}</strong> awaiting review</>}
          </p>
        </Link>
        <Link href="/dashboard/returns" className="rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">Returns</p>
          <p className="mt-1 text-sm text-ink-800">
            <strong>{openReturns}</strong> open
          </p>
        </Link>
        <Link href="/dashboard/disputes" className="rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">Disputes</p>
          <p className="mt-1 text-sm text-ink-800">
            <strong>{openDisputes}</strong> open · rating {profile.ratingAvg.toFixed(1)} ({profile.ratingCount})
          </p>
        </Link>
      </div>
      <Panel title="Where your books go" description="Destinations in the last 30 days and your international coverage.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {topDestinations.length === 0 ? (
              <p className="text-sm text-ink-500">No sales in the last 30 days.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {topDestinations.map(([code, qty]) => (
                  <li key={code} className="flex items-center justify-between">
                    <span className="text-ink-800">{countryLabel(names, code)}</span>
                    <span className="tabular-nums text-ink-600">{qty} unit{qty === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg bg-ink-50 p-4 text-sm text-ink-700">
            <p>
              Shipping from <strong>{countryLabel(names, shipsFrom)}</strong> to {shipsTo.length === 0 ? <strong>everywhere the marketplace delivers</strong> : <strong>{shipsTo.length} countries</strong>}.
            </p>
            <p className="mt-1">
              {internationalToShip > 0 ? (
                <>
                  <strong>{internationalToShip}</strong> international order{internationalToShip === 1 ? "" : "s"} waiting to ship — remember the customs declaration.
                </>
              ) : (
                "No international orders waiting."
              )}
            </p>
            <Link href="/dashboard/settings" className="mt-2 inline-block text-brand-700 underline-offset-2 hover:underline">
              Edit ship-to countries
            </Link>
          </div>
        </div>
      </Panel>
      <Panel title="Recent sales">
        {recentItems.length === 0 ? (
          <EmptyState title="No sales yet" body="Published listings appear in the store immediately; sales show up here." action={<ButtonLink href="/dashboard/listings/new" size="sm">Create a listing</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {recentItems.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/dashboard/orders/${i.order.number}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {i.title}
                  </Link>
                  <p className="text-[13px] text-ink-600">
                    <span className="font-mono">{i.order.number}</span> · {formatDateTime(i.order.placedAt, { timeZone: user.timezone, dateOnly: true })} · qty {i.qty}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={i.status === "paid" ? "gold" : i.status === "delivered" ? "brand" : "neutral"}>{statusLabel(i.status)}</Badge>
                  <span className="tabular-nums font-semibold text-ink-950">{formatMoney(i.sellerNet)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
