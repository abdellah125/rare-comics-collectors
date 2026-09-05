import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

type Tx = Prisma.TransactionClient;

export type SellerBalance = {
  /** withdrawable now (cleared holding period, not yet in a payout) */
  available: number;
  /** cleared-pending entries still inside the holding period */
  pending: number;
  /** lifetime credits + debits, including payouts */
  lifetime: number;
  /** sum of payouts already sent */
  paidOut: number;
  /** amount currently reserved in scheduled/processing payouts */
  inPayout: number;
};

/** Credits a seller for a paid order item and debits the marketplace commission. */
export async function recordSaleForItem(
  tx: Tx,
  item: { id: string; orderId: string; sellerId: string | null; subtotal: number; discountAmount: number; commissionAmount: number; title: string },
  orderNumber: string,
) {
  if (!item.sellerId) return;
  const settings = await getSettings();
  const availableAt = new Date(Date.now() + settings["payouts.holdDays"] * 86_400_000);
  const gross = item.subtotal - item.discountAmount;
  await tx.ledgerEntry.createMany({
    data: [
      { sellerId: item.sellerId, type: "sale", amount: gross, orderId: item.orderId, orderItemId: item.id, description: `Sale — ${item.title} (${orderNumber})`, availableAt },
      { sellerId: item.sellerId, type: "commission", amount: -item.commissionAmount, orderId: item.orderId, orderItemId: item.id, description: `Marketplace commission (${orderNumber})`, availableAt },
    ],
  });
}

/** Reverses seller credit proportionally when part of an item is refunded. */
export async function recordRefundForItem(
  tx: Tx,
  item: { id: string; orderId: string; sellerId: string | null; subtotal: number; discountAmount: number; commissionAmount: number; qty: number; title: string },
  refund: { id: string; qtyRefunded: number; amountRefunded: number },
  orderNumber: string,
) {
  if (!item.sellerId) return;
  const gross = item.subtotal - item.discountAmount;
  const share = gross > 0 ? Math.min(1, refund.amountRefunded / gross) : refund.qtyRefunded / item.qty;
  const commissionBack = Math.round(item.commissionAmount * share);
  await tx.ledgerEntry.createMany({
    data: [
      { sellerId: item.sellerId, type: "refund", amount: -refund.amountRefunded, orderId: item.orderId, orderItemId: item.id, refundId: refund.id, description: `Refund — ${item.title} (${orderNumber})` },
      { sellerId: item.sellerId, type: "commission_reversal", amount: commissionBack, orderId: item.orderId, orderItemId: item.id, refundId: refund.id, description: `Commission reversed (${orderNumber})` },
    ],
  });
}

export async function sellerBalance(sellerId: string, client: Tx | typeof db = db): Promise<SellerBalance> {
  const now = new Date();
  const [available, pending, lifetime, paidOut, inPayout] = await Promise.all([
    client.ledgerEntry.aggregate({ _sum: { amount: true }, where: { sellerId, payoutId: null, availableAt: { lte: now } } }),
    client.ledgerEntry.aggregate({ _sum: { amount: true }, where: { sellerId, payoutId: null, availableAt: { gt: now } } }),
    client.ledgerEntry.aggregate({ _sum: { amount: true }, where: { sellerId } }),
    client.payout.aggregate({ _sum: { amount: true }, where: { sellerId, status: "paid" } }),
    client.payout.aggregate({ _sum: { amount: true }, where: { sellerId, status: { in: ["pending", "scheduled", "processing"] } } }),
  ]);
  return {
    available: available._sum.amount ?? 0,
    pending: pending._sum.amount ?? 0,
    lifetime: lifetime._sum.amount ?? 0,
    paidOut: paidOut._sum.amount ?? 0,
    inPayout: inPayout._sum.amount ?? 0,
  };
}

/**
 * Creates a payout from every cleared, unpaid ledger entry of a seller.
 * Runs in a transaction so the same entries can never end up in two payouts.
 */
export async function createPayoutForSeller(
  sellerId: string,
  opts: { createdById?: string | null; scheduledFor?: Date | null; note?: string | null; status?: "pending" | "scheduled" | "processing" },
): Promise<{ id: string; amount: number } | null> {
  return db.$transaction(async (tx) => {
    // One payout per seller at a time: the scheduler and an admin clicking "pay now" must not
    // both sweep the same ledger entries.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sellerId}))`;
    const seller = await tx.sellerProfile.findUnique({ where: { id: sellerId }, select: { payoutMethod: true, payoutDetailsMasked: true, minPayout: true } });
    if (!seller) throw new Error("Seller not found");
    const entries = await tx.ledgerEntry.findMany({ where: { sellerId, payoutId: null, availableAt: { lte: new Date() } }, select: { id: true, amount: true, createdAt: true } });
    const amount = entries.reduce((n, e) => n + e.amount, 0);
    if (entries.length === 0 || amount <= 0) return null;
    const payout = await tx.payout.create({
      data: {
        sellerId,
        amount,
        status: opts.status ?? "pending",
        method: seller.payoutMethod,
        destinationMasked: seller.payoutDetailsMasked,
        scheduledFor: opts.scheduledFor ?? null,
        note: opts.note ?? null,
        createdById: opts.createdById ?? null,
        periodStart: entries.reduce((min, e) => (e.createdAt < min ? e.createdAt : min), entries[0].createdAt),
        periodEnd: new Date(),
      },
    });
    const swept = await tx.ledgerEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) }, payoutId: null }, data: { payoutId: payout.id } });
    if (swept.count !== entries.length) throw new Error("Ledger entries changed while creating the payout; try again");
    await tx.ledgerEntry.create({
      data: { sellerId, type: "payout", amount: -amount, payoutId: payout.id, description: `Payout ${payout.id.slice(-8).toUpperCase()}`, createdById: opts.createdById ?? null },
    });
    return { id: payout.id, amount };
  });
}

/** Cancelling a payout returns its entries to the available pool. */
export async function cancelPayout(payoutId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout || payout.status === "paid") throw new Error("Payout cannot be cancelled");
    await tx.ledgerEntry.deleteMany({ where: { payoutId, type: "payout" } });
    await tx.ledgerEntry.updateMany({ where: { payoutId }, data: { payoutId: null } });
    await tx.payout.update({ where: { id: payoutId }, data: { status: "cancelled", failureReason: reason } });
  });
}

/** Marketplace revenue summary over a period (commissions + platform-owned sales − refunds). */
export async function platformRevenue(from: Date, to: Date) {
  const [commission, reversals, platformSales, refunds] = await Promise.all([
    db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { type: "commission", createdAt: { gte: from, lte: to } } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { type: "commission_reversal", createdAt: { gte: from, lte: to } } }),
    db.orderItem.aggregate({
      _sum: { subtotal: true, discountAmount: true },
      where: { sellerId: null, order: { paidAt: { gte: from, lte: to }, paymentStatus: { in: ["paid", "partially_refunded"] } } },
    }),
    db.refund.findMany({ where: { status: "succeeded", createdAt: { gte: from, lte: to } }, select: { amount: true, order: { select: { items: { select: { sellerId: true, subtotal: true, discountAmount: true } } } } } }),
  ]);
  const commissionNet = -(commission._sum.amount ?? 0) - (reversals._sum.amount ?? 0);
  const houseSales = (platformSales._sum.subtotal ?? 0) - (platformSales._sum.discountAmount ?? 0);
  // A refund on a marketplace seller's item costs the platform only its commission, and that is
  // already booked through commission_reversal. Only the house share of each refund is revenue lost.
  let houseRefunds = 0;
  for (const r of refunds) {
    const gross = r.order.items.reduce((n, i) => n + i.subtotal - i.discountAmount, 0);
    const house = r.order.items.filter((i) => !i.sellerId).reduce((n, i) => n + i.subtotal - i.discountAmount, 0);
    houseRefunds += gross > 0 ? Math.round((r.amount * house) / gross) : 0;
  }
  return { commissionNet, houseSales, refunds: houseRefunds };
}
