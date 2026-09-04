import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { notifyUser } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";
import { recordSaleForItem } from "@/lib/finance/ledger";
import { queueTemplateEmail } from "@/lib/mail";

type Tx = Prisma.TransactionClient;

export type ActorRef = { id: string | null; type: "system" | "admin" | "buyer" | "seller" | "webhook" | "job" };
export const SYSTEM_ACTOR: ActorRef = { id: null, type: "system" };

export async function addOrderEvent(tx: Tx | typeof db, orderId: string, type: string, message: string, actor: ActorRef = SYSTEM_ACTOR, data?: unknown) {
  await tx.orderEvent.create({
    data: { orderId, type, message, actorId: actor.id, actorType: actor.type, dataJson: data === undefined ? null : JSON.stringify(data) },
  });
}

/** Returns reserved stock to the products of an order (cancellation / expiry / failed payment). */
export async function releaseOrderStock(tx: Tx, orderId: string, reason: "release" | "return", actorId: string | null = null) {
  const items = await tx.orderItem.findMany({ where: { orderId, kind: "comic", productId: { not: null } }, select: { id: true, productId: true, qty: true, refundedQty: true } });
  for (const item of items) {
    if (!item.productId) continue;
    const qty = reason === "return" ? item.qty - item.refundedQty : item.qty;
    if (qty <= 0) continue;
    await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: qty }, soldCount: { decrement: reason === "return" ? qty : 0 } } });
    await tx.inventoryAdjustment.create({ data: { productId: item.productId, delta: qty, reason, orderId, actorId } });
  }
}

/**
 * Transition an order to paid: item statuses, seller ledger credits, seller
 * notifications and the buyer confirmation email. Idempotent — a second call
 * for an already-paid order is a no-op.
 */
export async function markOrderPaid(orderId: string, payment: { id: string; provider: string }, actor: ActorRef = SYSTEM_ACTOR): Promise<boolean> {
  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.paymentStatus === "paid") return null;
    await tx.order.update({ where: { id: orderId }, data: { status: "paid", paymentStatus: "paid", paidAt: new Date() } });
    await tx.orderItem.updateMany({ where: { orderId }, data: { status: "paid" } });
    for (const item of order.items) await recordSaleForItem(tx, item, order.number);
    for (const item of order.items) {
      if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { soldCount: { increment: item.qty } } });
    }
    await addOrderEvent(tx, orderId, "payment.succeeded", `Payment received via ${payment.provider}`, actor, { paymentId: payment.id });
    return order;
  });
  if (!result) return false;

  const settings = await getSettings();
  const itemsList = result.items.map((i) => `• ${i.title} × ${i.qty} — ${formatMoney(i.subtotal)}`).join("\n");
  if (settings["notifications.orderConfirmation"]) {
    if (result.userId) {
      await notifyUser(result.userId, {
        type: "order.paid",
        title: `Order ${result.number} confirmed`,
        body: `We've received your payment of ${formatMoney(result.total)}.`,
        href: `/account/orders/${result.number}`,
        email: { templateKey: "order_confirmation", vars: { orderNumber: result.number, total: formatMoney(result.total), itemsList } },
      });
    } else {
      await queueTemplateEmail("order_confirmation", result.email, { name: "there", orderNumber: result.number, total: formatMoney(result.total), itemsList });
    }
  }
  if (settings["notifications.sellerNewOrder"]) {
    const sellerIds = [...new Set(result.items.map((i) => i.sellerId).filter((s): s is string => Boolean(s)))];
    for (const sellerId of sellerIds) {
      const seller = await db.sellerProfile.findUnique({ where: { id: sellerId }, select: { userId: true, handlingDays: true } });
      if (!seller) continue;
      const first = result.items.find((i) => i.sellerId === sellerId)!;
      await notifyUser(seller.userId, {
        type: "seller.new_order",
        title: `New sale: ${first.title}`,
        body: `Order ${result.number} — ship within ${seller.handlingDays} business days.`,
        href: `/dashboard/orders`,
        category: "sellerAlerts",
        email: { templateKey: "seller_new_order", vars: { itemTitle: first.title, orderNumber: result.number, handlingDays: seller.handlingDays } },
      });
    }
  }
  return true;
}

export async function markOrderPaymentFailed(orderId: string, reason: string, actor: ActorRef = SYSTEM_ACTOR) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true, status: true } });
    if (!order || order.paymentStatus === "paid") return;
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: "failed", status: "failed" } });
    await addOrderEvent(tx, orderId, "payment.failed", `Payment failed: ${reason}`, actor);
  });
}

export async function cancelOrder(orderId: string, reason: string, actor: ActorRef, opts: { notify?: boolean } = {}) {
  const order = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, status: true, userId: true, email: true, paymentStatus: true } });
    if (!order) throw new Error("Order not found");
    if (["cancelled", "refunded", "completed"].includes(order.status)) return order;
    if (["shipped", "partially_shipped", "delivered"].includes(order.status)) throw new Error("Shipped orders must be handled through returns or refunds");
    await releaseOrderStock(tx, orderId, "release", actor.id);
    await tx.order.update({ where: { id: orderId }, data: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason } });
    await tx.orderItem.updateMany({ where: { orderId }, data: { status: "cancelled" } });
    await addOrderEvent(tx, orderId, "order.cancelled", `Order cancelled: ${reason}`, actor);
    return order;
  });
  if (opts.notify !== false && order.status !== "cancelled") {
    if (order.userId) {
      await notifyUser(order.userId, {
        type: "order.cancelled",
        title: `Order ${order.number} cancelled`,
        body: reason,
        href: `/account/orders/${order.number}`,
        email: { templateKey: "order_cancelled", vars: { orderNumber: order.number, reason } },
      });
    } else {
      await queueTemplateEmail("order_cancelled", order.email, { name: "there", orderNumber: order.number, reason });
    }
  }
}

/** Job: cancel unpaid orders past the configured window and release their stock. */
export async function expireUnpaidOrders(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings["commerce.autoCancelUnpaidHours"] * 3_600_000);
  const stale = await db.order.findMany({ where: { status: "pending_payment", placedAt: { lt: cutoff } }, select: { id: true } });
  for (const o of stale) {
    try {
      await cancelOrder(o.id, "Payment was not received in time", { id: null, type: "job" });
    } catch (err) {
      console.error(`[jobs] could not expire order ${o.id}`, err);
    }
  }
  return stale.length;
}

/** Job: delivered orders older than the return window become completed. */
export async function autoCompleteOrders(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings["commerce.autoCompleteDays"] * 86_400_000);
  const orders = await db.order.findMany({
    where: { status: "delivered", shipments: { every: { deliveredAt: { lt: cutoff } } } },
    select: { id: true },
  });
  for (const o of orders) {
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: o.id }, data: { status: "completed", completedAt: new Date() } });
      await tx.orderItem.updateMany({ where: { orderId: o.id, status: "delivered" }, data: { status: "delivered" } });
      await addOrderEvent(tx, o.id, "order.completed", "Order completed automatically after the inspection window", { id: null, type: "job" });
    });
  }
  return orders.length;
}

/** Recomputes the derived status columns from items/shipments/payments. */
export async function syncOrderStatus(tx: Tx | typeof db, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { status: true, kind: true } }, shipments: { select: { status: true } }, refunds: { where: { status: "succeeded" }, select: { amount: true } } },
  });
  if (!order) return;
  const physical = order.items.filter((i) => i.kind === "comic" && i.status !== "cancelled" && i.status !== "refunded");
  const shipped = physical.filter((i) => ["shipped", "delivered"].includes(i.status)).length;
  const delivered = physical.filter((i) => i.status === "delivered").length;
  const refunded = order.refunds.reduce((n, r) => n + r.amount, 0);

  let fulfillmentStatus = "unfulfilled";
  if (physical.length > 0 && delivered === physical.length) fulfillmentStatus = "delivered";
  else if (physical.length > 0 && shipped === physical.length) fulfillmentStatus = "fulfilled";
  else if (shipped > 0) fulfillmentStatus = "partial";

  let paymentStatus = order.paymentStatus;
  if (refunded > 0) paymentStatus = refunded >= order.total ? "refunded" : "partially_refunded";

  let status = order.status;
  if (!["cancelled", "failed", "pending_payment"].includes(status)) {
    if (paymentStatus === "refunded") status = "refunded";
    else if (fulfillmentStatus === "delivered") status = status === "completed" ? "completed" : "delivered";
    else if (fulfillmentStatus === "fulfilled") status = "shipped";
    else if (fulfillmentStatus === "partial") status = "partially_shipped";
    else if (paymentStatus === "partially_refunded") status = "partially_refunded";
    else if (paymentStatus === "paid") status = status === "processing" ? "processing" : "paid";
  }
  await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus, paymentStatus, status } });
}

export async function recomputeSellerStats(sellerId: string) {
  const [reviews, sales] = await Promise.all([
    db.review.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { sellerId, status: "published" } }),
    db.orderItem.count({ where: { sellerId, status: { in: ["paid", "processing", "shipped", "delivered"] } } }),
  ]);
  await db.sellerProfile.update({
    where: { id: sellerId },
    data: { ratingAvg: Math.round((reviews._avg.rating ?? 0) * 10) / 10, ratingCount: reviews._count._all, salesCount: sales },
  });
}
