import "server-only";
import { db } from "@/lib/db";
import { bucketize, type DateRange } from "@/lib/admin/query";
import { platformRevenue } from "@/lib/finance/ledger";

const PAID = ["paid", "partially_refunded", "refunded"];

/** Everything the reports page and CSV exports need for one date range. Queries run in parallel; joins happen in JS on bounded sets. */
export async function buildReport(range: DateRange) {
  const paidWhere = { paidAt: { gte: range.from, lte: range.to }, paymentStatus: { in: PAID } };
  const [orders, refunds, chargebacks, payments, rev, newUsers, newSellers, items, payouts, reviewCount, ticketCount, disputeCount, returnCount, viewSum, soldSum, coupons] = await Promise.all([
    db.order.findMany({ where: paidWhere, select: { id: true, userId: true, total: true, subtotal: true, shippingTotal: true, taxTotal: true, discountTotal: true, countryCode: true, paidAt: true, currency: true } }),
    db.refund.findMany({ where: { status: "succeeded", createdAt: { gte: range.from, lte: range.to } }, select: { amount: true, reason: true, createdAt: true } }),
    db.chargeback.findMany({ where: { createdAt: { gte: range.from, lte: range.to } }, select: { amount: true, status: true } }),
    db.payment.groupBy({ by: ["provider"], _count: { _all: true }, _sum: { amount: true, feeAmount: true }, where: { status: { in: ["succeeded", "partially_refunded", "refunded"] }, createdAt: { gte: range.from, lte: range.to } } }),
    platformRevenue(range.from, range.to),
    db.user.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.sellerProfile.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.orderItem.findMany({ where: { order: paidWhere, status: { notIn: ["cancelled"] } }, select: { productId: true, sellerId: true, title: true, qty: true, subtotal: true, discountAmount: true, commissionAmount: true, product: { select: { categoryId: true, category: { select: { name: true } } } }, seller: { select: { displayName: true } } } }),
    db.payout.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: "paid", paidAt: { gte: range.from, lte: range.to } } }),
    db.review.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.ticket.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.dispute.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.returnRequest.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    db.product.aggregate({ _sum: { viewCount: true } }),
    db.product.aggregate({ _sum: { soldCount: true } }),
    db.couponRedemption.groupBy({ by: ["couponId"], _count: { _all: true }, _sum: { amount: true }, where: { createdAt: { gte: range.from, lte: range.to } } }),
  ]);

  const gmv = orders.reduce((s, o) => s + o.total, 0);
  const refundTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const buckets = bucketize(range);
  const gmvSeries = new Array(buckets.labels.length).fill(0) as number[];
  const orderSeries = new Array(buckets.labels.length).fill(0) as number[];
  const refundSeries = new Array(buckets.labels.length).fill(0) as number[];
  for (const o of orders) {
    if (!o.paidAt) continue;
    const i = buckets.index(o.paidAt);
    gmvSeries[i] += o.total;
    orderSeries[i] += 1;
  }
  for (const r of refunds) refundSeries[buckets.index(r.createdAt)] += r.amount;

  // retention: buyers in range who had an earlier paid order
  const buyerIds = [...new Set(orders.map((o) => o.userId).filter((v): v is string => Boolean(v)))];
  const repeat = buyerIds.length > 0 ? await db.order.groupBy({ by: ["userId"], where: { userId: { in: buyerIds }, paymentStatus: { in: PAID }, paidAt: { lt: range.from } }, _count: { _all: true } }) : [];

  const agg = <K extends string>(rows: typeof items, keyOf: (i: (typeof items)[number]) => K | null, labelOf: (i: (typeof items)[number]) => string) => {
    const m = new Map<K, { key: K; label: string; qty: number; revenue: number; commission: number; orders: number }>();
    for (const it of rows) {
      const k = keyOf(it);
      if (!k) continue;
      const e = m.get(k) ?? { key: k, label: labelOf(it), qty: 0, revenue: 0, commission: 0, orders: 0 };
      e.qty += it.qty;
      e.revenue += it.subtotal - it.discountAmount;
      e.commission += it.commissionAmount;
      e.orders += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  };
  const topProducts = agg(items, (i) => i.productId, (i) => i.title).slice(0, 25);
  const topSellers = agg(items, (i) => i.sellerId ?? "house", (i) => i.seller?.displayName ?? "Marketplace (house)").slice(0, 25);
  const topCategories = agg(items, (i) => i.product?.categoryId ?? "uncategorised", (i) => i.product?.category?.name ?? "Uncategorised").slice(0, 25);

  const geo = new Map<string, { country: string; orders: number; gmv: number }>();
  for (const o of orders) {
    const c = o.countryCode ?? "??";
    const e = geo.get(c) ?? { country: c, orders: 0, gmv: 0 };
    e.orders += 1;
    e.gmv += o.total;
    geo.set(c, e);
  }
  const refundReasons = new Map<string, { reason: string; count: number; amount: number }>();
  for (const r of refunds) {
    const e = refundReasons.get(r.reason) ?? { reason: r.reason, count: 0, amount: 0 };
    e.count += 1;
    e.amount += r.amount;
    refundReasons.set(r.reason, e);
  }
  const couponRows = coupons.length > 0 ? await db.coupon.findMany({ where: { id: { in: coupons.map((c) => c.couponId) } }, select: { id: true, code: true } }) : [];

  return {
    range,
    totals: {
      gmv,
      orders: orders.length,
      aov: orders.length ? Math.round(gmv / orders.length) : 0,
      netRevenue: rev.commissionNet + rev.houseSales - rev.refunds,
      commission: rev.commissionNet,
      houseSales: rev.houseSales,
      refunds: refundTotal,
      refundCount: refunds.length,
      chargebacks: chargebacks.reduce((s, c) => s + c.amount, 0),
      chargebackCount: chargebacks.length,
      chargebacksLost: chargebacks.filter((c) => c.status === "lost").reduce((s, c) => s + c.amount, 0),
      shipping: orders.reduce((s, o) => s + o.shippingTotal, 0),
      tax: orders.reduce((s, o) => s + o.taxTotal, 0),
      discounts: orders.reduce((s, o) => s + o.discountTotal, 0),
      providerFees: payments.reduce((s, p) => s + (p._sum.feeAmount ?? 0), 0),
      payouts: payouts._sum.amount ?? 0,
      payoutCount: payouts._count._all,
      newUsers,
      newSellers,
      buyers: buyerIds.length,
      repeatBuyers: repeat.length,
      repeatRate: buyerIds.length ? repeat.length / buyerIds.length : 0,
      guestOrders: orders.filter((o) => !o.userId).length,
      reviews: reviewCount,
      tickets: ticketCount,
      disputes: disputeCount,
      returns: returnCount,
      lifetimeViews: viewSum._sum.viewCount ?? 0,
      lifetimeSold: soldSum._sum.soldCount ?? 0,
    },
    series: { labels: buckets.labels, gmv: gmvSeries, orders: orderSeries, refunds: refundSeries },
    topProducts,
    topSellers,
    topCategories,
    geography: [...geo.values()].sort((a, b) => b.gmv - a.gmv),
    paymentMethods: payments.map((p) => ({ provider: p.provider, count: p._count._all, amount: p._sum.amount ?? 0, fees: p._sum.feeAmount ?? 0 })).sort((a, b) => b.amount - a.amount),
    refundReasons: [...refundReasons.values()].sort((a, b) => b.amount - a.amount),
    coupons: coupons.map((c) => ({ code: couponRows.find((r) => r.id === c.couponId)?.code ?? c.couponId, uses: c._count._all, amount: c._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount),
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
