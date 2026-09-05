import "server-only";
import { db } from "@/lib/db";
import { platformRevenue } from "@/lib/finance/ledger";
import { env } from "@/lib/env";
import { bucketize, type DateRange } from "@/lib/admin/query";
import { getSettings } from "@/lib/settings";
import { providerStatuses } from "@/lib/payments/registry";

const PAID = ["paid", "partially_refunded", "refunded"];

async function salesTotals(from: Date, to: Date) {
  const [orders, refunds, commissions, houseSales, payouts, shipping, rev] = await Promise.all([
    db.order.aggregate({ _sum: { total: true }, _count: { _all: true }, where: { paidAt: { gte: from, lte: to }, paymentStatus: { in: PAID } } }),
    db.refund.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: "succeeded", createdAt: { gte: from, lte: to } } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { type: { in: ["commission", "commission_reversal"] }, createdAt: { gte: from, lte: to } } }),
    db.orderItem.aggregate({ _sum: { subtotal: true, discountAmount: true }, where: { sellerId: null, order: { paidAt: { gte: from, lte: to }, paymentStatus: { in: PAID } } } }),
    db.payout.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: "paid", paidAt: { gte: from, lte: to } } }),
    db.order.aggregate({ _sum: { shippingTotal: true, taxTotal: true }, where: { paidAt: { gte: from, lte: to }, paymentStatus: { in: PAID } } }),
    platformRevenue(from, to),
  ]);
  const gmv = orders._sum.total ?? 0;
  const fees = -(commissions._sum.amount ?? 0);
  const house = (houseSales._sum.subtotal ?? 0) - (houseSales._sum.discountAmount ?? 0);
  return {
    gmv,
    orders: orders._count._all,
    aov: orders._count._all ? Math.round(gmv / orders._count._all) : 0,
    refunds: refunds._sum.amount ?? 0,
    refundCount: refunds._count._all,
    fees,
    houseSales: house,
    // Seller-item refunds only cost the platform its commission (already reversed in the ledger);
    // subtract just the house share of refunds so revenue cannot go negative on marketplace sales.
    revenue: fees + house - rev.refunds,
    payouts: payouts._sum.amount ?? 0,
    payoutCount: payouts._count._all,
    shipping: shipping._sum.shippingTotal ?? 0,
    tax: shipping._sum.taxTotal ?? 0,
  };
}

function pct(now: number, prev: number): number | null {
  if (prev === 0) return now === 0 ? 0 : null;
  return ((now - prev) / prev) * 100;
}

export async function dashboardMetrics(range: DateRange) {
  const prevFrom = new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()));
  const prevTo = new Date(range.from.getTime() - 1);
  const [cur, prev] = await Promise.all([salesTotals(range.from, range.to), salesTotals(prevFrom, prevTo)]);

  const buckets = bucketize(range);
  const paidOrders = await db.order.findMany({ where: { paidAt: { gte: range.from, lte: range.to }, paymentStatus: { in: PAID } }, select: { paidAt: true, total: true } });
  const gmvSeries = new Array(buckets.labels.length).fill(0);
  const orderSeries = new Array(buckets.labels.length).fill(0);
  for (const o of paidOrders) {
    if (!o.paidAt) continue;
    const i = buckets.index(o.paidAt);
    gmvSeries[i] += o.total;
    orderSeries[i] += 1;
  }

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since24h = new Date(Date.now() - 86_400_000);
  const [activeUsers, newUsers, buyers, sellersApproved, sellersPending, toFulfil, disputes, returns, tickets, verifications, listingsPending, failedPayments, payoutsDue, chargebacks, failedJobs, failedWebhooks, staleRates, unpaidOrders] = await Promise.all([
    db.user.count({ where: { lastLoginAt: { gte: since30 }, deletedAt: null } }),
    db.user.count({ where: { createdAt: { gte: range.from, lte: range.to }, deletedAt: null } }),
    db.order.groupBy({ by: ["userId"], where: { paymentStatus: { in: PAID }, userId: { not: null } } }).then((r) => r.length),
    db.sellerProfile.count({ where: { status: "approved" } }),
    db.sellerProfile.count({ where: { status: "pending" } }),
    db.order.count({ where: { paymentStatus: { in: ["paid", "partially_refunded"] }, fulfillmentStatus: { in: ["unfulfilled", "partial"] }, status: { notIn: ["cancelled", "refunded"] } } }),
    db.dispute.count({ where: { status: { notIn: ["resolved", "closed"] } } }),
    db.returnRequest.count({ where: { status: { in: ["requested", "approved", "shipped_back", "received"] } } }),
    db.ticket.count({ where: { status: { in: ["open", "pending"] } } }),
    db.sellerProfile.count({ where: { verificationStatus: "pending" } }),
    db.product.count({ where: { status: "pending", deletedAt: null } }),
    db.payment.count({ where: { status: "failed", createdAt: { gte: since24h } } }),
    db.payout.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: { in: ["pending", "scheduled"] } } }),
    db.chargeback.count({ where: { status: { in: ["needs_response", "under_review"] } } }),
    db.job.count({ where: { status: "failed" } }),
    db.webhookEvent.count({ where: { status: "failed" } }),
    db.currency.count({ where: { isEnabled: true, isBase: false, updatedAt: { lt: since24h } } }),
    db.order.count({ where: { status: "pending_payment" } }),
  ]);

  const settings = await getSettings();
  const providers = await providerStatuses();
  const alerts: { level: "warning" | "critical" | "info"; text: string; href?: string }[] = [];
  if (settings["system.maintenanceMode"]) alerts.push({ level: "critical", text: "Maintenance mode is ON — the storefront is closed to customers.", href: "/admin/settings/system" });
  if (failedJobs > 0) alerts.push({ level: "warning", text: `${failedJobs} background job${failedJobs === 1 ? "" : "s"} failed.`, href: "/admin/system" });
  if (failedWebhooks > 0) alerts.push({ level: "warning", text: `${failedWebhooks} payment webhook${failedWebhooks === 1 ? "" : "s"} failed to process.`, href: "/admin/system/webhooks" });
  const enabledUnconfigured = providers.filter((p) => p.enabled && !p.configured);
  if (enabledUnconfigured.length > 0) alerts.push({ level: "warning", text: `Payment method enabled but not configured: ${enabledUnconfigured.map((p) => p.displayName).join(", ")}.`, href: "/admin/finance/payments" });
  if (!providers.some((p) => p.enabled && p.configured)) alerts.push({ level: "critical", text: "No payment method is both enabled and configured — customers cannot check out.", href: "/admin/finance/payments" });
  if (staleRates > 0 && settings["features.multiCurrency"]) alerts.push({ level: "info", text: `${staleRates} exchange rate${staleRates === 1 ? "" : "s"} older than 24 hours.`, href: "/admin/finance/currencies" });
  if (chargebacks > 0) alerts.push({ level: "warning", text: `${chargebacks} chargeback${chargebacks === 1 ? "" : "s"} need a response.`, href: "/admin/disputes/chargebacks" });
  if (!env.smtp.configured) alerts.push({ level: "info", text: "SMTP is not configured — emails are logged, not delivered.", href: "/admin/notifications/email-log" });
  if (env.isProd && settings["payments.test.enabled"]) alerts.push({ level: "critical", text: "The test payment gateway is enabled in production.", href: "/admin/finance/payments" });

  return {
    range,
    totals: cur,
    deltas: { gmv: pct(cur.gmv, prev.gmv), orders: pct(cur.orders, prev.orders), revenue: pct(cur.revenue, prev.revenue), refunds: pct(cur.refunds, prev.refunds), aov: pct(cur.aov, prev.aov) },
    series: { labels: buckets.labels, gmv: gmvSeries, orders: orderSeries },
    people: { activeUsers, newUsers, buyers, sellersApproved, sellersPending },
    pending: { toFulfil, disputes, returns, tickets, verifications, listingsPending, failedPayments, payoutsDue: payoutsDue._sum.amount ?? 0, payoutsDueCount: payoutsDue._count._all, chargebacks, unpaidOrders },
    alerts,
  };
}

export type DashboardMetrics = Awaited<ReturnType<typeof dashboardMetrics>>;
