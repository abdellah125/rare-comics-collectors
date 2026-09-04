import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { notifyUser, notifyAdmins } from "@/lib/notifications";
import { queueTemplateEmail } from "@/lib/mail";
import { recordRefundForItem } from "@/lib/finance/ledger";
import { addOrderEvent, markOrderPaid, releaseOrderStock, syncOrderStatus, type ActorRef } from "@/lib/orders/lifecycle";
import { getProvider } from "@/lib/payments/registry";
import type { PaymentDetails } from "@/lib/payments/types";

/** Records provider details on a payment and moves the order to paid (idempotent). */
export async function applyPaymentSuccess(paymentId: string, details: PaymentDetails | undefined, actor: ActorRef) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return;
  if (payment.status !== "succeeded") {
    const existingRaw = payment.rawJson ? (JSON.parse(payment.rawJson) as Record<string, unknown>) : {};
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: "succeeded",
        capturedAt: new Date(),
        cardBrand: details?.cardBrand ?? payment.cardBrand,
        cardLast4: details?.cardLast4 ?? payment.cardLast4,
        feeAmount: details?.feeAmount ?? payment.feeAmount,
        rawJson: JSON.stringify({ ...existingRaw, ...((details?.raw as Record<string, unknown>) ?? {}) }),
      },
    });
  }
  await markOrderPaid(payment.orderId, { id: payment.id, provider: payment.provider }, actor);
}

export type RefundRequest = {
  orderId: string;
  /** base-currency minor units */
  amount: number;
  reason: string;
  note?: string | null;
  items?: { orderItemId: string; qty: number }[];
  restock?: boolean;
  actor: { id: string; email: string; type: "admin" | "seller" };
  idempotencyKey: string;
  returnRequestId?: string | null;
  disputeId?: string | null;
};

export class RefundError extends Error {}

/**
 * Issues a refund through the payment's provider and books it: payment
 * refundedAmount, item refunded quantities, seller ledger reversals, stock
 * (optional), order status and buyer notification. The gateway call happens
 * outside the DB transaction; the refund row records the outcome either way.
 */
export async function issueRefund(input: RefundRequest): Promise<{ refundId: string; status: string }> {
  const existing = await db.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { refundId: existing.id, status: existing.status };

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { items: true, payments: { where: { status: { in: ["succeeded", "partially_refunded"] } }, orderBy: { createdAt: "desc" } } },
  });
  if (!order) throw new RefundError("Order not found");
  const payment = order.payments[0];
  if (!payment) throw new RefundError("This order has no successful payment to refund");
  const remaining = payment.amount - payment.refundedAmount;
  if (input.amount <= 0) throw new RefundError("Refund amount must be greater than zero");
  if (input.amount > remaining) throw new RefundError(`Only ${formatMoney(remaining)} is left to refund on this payment`);
  for (const it of input.items ?? []) {
    const item = order.items.find((i) => i.id === it.orderItemId);
    if (!item) throw new RefundError("Refund item does not belong to this order");
    if (it.qty < 1 || it.qty > item.qty - item.refundedQty) throw new RefundError(`Invalid quantity for ${item.title}`);
  }
  const provider = getProvider(payment.provider);
  if (!provider) throw new RefundError("Payment provider is not available");

  const refund = await db.refund.create({
    data: {
      paymentId: payment.id,
      orderId: order.id,
      amount: input.amount,
      currency: payment.currency,
      reason: input.reason,
      note: input.note ?? null,
      status: "pending",
      itemsJson: JSON.stringify(input.items ?? []),
      restock: Boolean(input.restock),
      createdById: input.actor.id,
      returnRequestId: input.returnRequestId ?? null,
      disputeId: input.disputeId ?? null,
      idempotencyKey: input.idempotencyKey,
    },
  });

  const presentmentAmount = payment.amount > 0 ? Math.round((input.amount * payment.presentmentAmount) / payment.amount) : input.amount;
  let result;
  try {
    result = await provider.refund({
      providerRef: payment.providerRef ?? "",
      paymentRaw: payment.rawJson ? JSON.parse(payment.rawJson) : null,
      amountMinor: presentmentAmount,
      currency: payment.currency,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.refund.update({ where: { id: refund.id }, data: { status: "failed", failureMessage: message.slice(0, 500) } });
    await addOrderEvent(db, order.id, "refund.failed", `Refund of ${formatMoney(input.amount)} failed: ${message}`, { id: input.actor.id, type: input.actor.type });
    throw new RefundError(`The gateway rejected the refund: ${message}`);
  }

  if (result.status === "failed") {
    await db.refund.update({ where: { id: refund.id }, data: { status: "failed", failureMessage: result.message ?? null, providerRef: result.providerRef ?? null } });
    await addOrderEvent(db, order.id, "refund.failed", `Refund of ${formatMoney(input.amount)} failed: ${result.message ?? "unknown"}`, { id: input.actor.id, type: input.actor.type });
    throw new RefundError(result.message ?? "Refund failed");
  }

  await finalizeRefund(refund.id, result.status, result.providerRef ?? null, { id: input.actor.id, type: input.actor.type });
  await audit({
    actor: input.actor,
    action: "order.refund",
    targetType: "order",
    targetId: order.id,
    summary: `Refund ${formatMoney(input.amount)} on ${order.number} (${input.reason}) — ${result.status}`,
    after: { refundId: refund.id, items: input.items, restock: input.restock },
  });
  return { refundId: refund.id, status: result.status };
}

/** Books a refund that the provider reported as succeeded (or pending for offline refunds). */
export async function finalizeRefund(refundId: string, status: "succeeded" | "pending", providerRef: string | null, actor: ActorRef) {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { order: { include: { items: true } }, payment: true } });
  if (!refund || refund.status === "succeeded") return;
  await db.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refundId }, data: { status, providerRef } });
    if (status !== "succeeded") return;
    const items = JSON.parse(refund.itemsJson) as { orderItemId: string; qty: number }[];
    await tx.payment.update({ where: { id: refund.paymentId }, data: { refundedAmount: { increment: refund.amount } } });
    const fullyRefunded = refund.payment.refundedAmount + refund.amount >= refund.payment.amount;
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: fullyRefunded ? "refunded" : "partially_refunded" } });

    // Distribute the refund over the listed items (or proportionally over all items).
    const targets = items.length > 0 ? items : refund.order.items.map((i) => ({ orderItemId: i.id, qty: 0 }));
    const totalGross = refund.order.items.reduce((n, i) => n + i.subtotal - i.discountAmount, 0) || 1;
    for (const t of targets) {
      const item = refund.order.items.find((i) => i.id === t.orderItemId);
      if (!item) continue;
      const gross = item.subtotal - item.discountAmount;
      const share = items.length > 0 ? Math.round((gross * (t.qty / item.qty))) : Math.round((refund.amount * gross) / totalGross);
      const amountRefunded = Math.min(share, gross);
      await recordRefundForItem(tx, item, { id: refundId, qtyRefunded: t.qty, amountRefunded }, refund.order.number);
      if (t.qty > 0) {
        const newRefundedQty = Math.min(item.qty, item.refundedQty + t.qty);
        await tx.orderItem.update({ where: { id: item.id }, data: { refundedQty: newRefundedQty, status: newRefundedQty >= item.qty ? "refunded" : item.status } });
        if (refund.restock && item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: t.qty } } });
          await tx.inventoryAdjustment.create({ data: { productId: item.productId, delta: t.qty, reason: "return", orderId: refund.orderId, actorId: actor.id } });
        }
      }
    }
    if (items.length === 0 && refund.restock) await releaseOrderStock(tx, refund.orderId, "return", actor.id);
    await addOrderEvent(tx, refund.orderId, "refund.succeeded", `Refund of ${formatMoney(refund.amount)} issued (${refund.reason})`, actor, { refundId });
    await syncOrderStatus(tx, refund.orderId);
  });
  if (status === "succeeded") {
    const order = refund.order;
    if (order.userId) {
      await notifyUser(order.userId, {
        type: "order.refund",
        title: `Refund of ${formatMoney(refund.amount)} issued`,
        body: `Order ${order.number}`,
        href: `/account/orders/${order.number}`,
        email: { templateKey: "refund_issued", vars: { orderNumber: order.number, amount: formatMoney(refund.amount) } },
      });
    } else {
      await queueTemplateEmail("refund_issued", order.email, { name: "there", orderNumber: order.number, amount: formatMoney(refund.amount) });
    }
  }
}

/**
 * A refund initiated at the gateway (dashboard) arrives via webhook. Book the
 * difference between the provider's refunded total and ours.
 */
export async function applyProviderRefund(paymentId: string, providerRefundedPresentment: number, actor: ActorRef, opts: { absolute?: boolean } = {}) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { id: true, number: true } } } });
  if (!payment) return;
  const refundedBase = opts.absolute === false
    ? providerRefundedPresentment
    : payment.presentmentAmount > 0
      ? Math.round((providerRefundedPresentment * payment.amount) / payment.presentmentAmount)
      : providerRefundedPresentment;
  const delta = refundedBase - payment.refundedAmount;
  if (delta <= 0) return;
  const refund = await db.refund.create({
    data: {
      paymentId,
      orderId: payment.orderId,
      amount: delta,
      currency: payment.currency,
      reason: "other",
      note: "Refund reported by the payment provider",
      status: "pending",
      idempotencyKey: `provider_${paymentId}_${refundedBase}`,
    },
  });
  await finalizeRefund(refund.id, "succeeded", null, actor);
}

export async function openChargeback(paymentId: string, input: { providerRef: string; amountPresentment: number; reason: string | null; evidenceDueAt: Date | null }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { id: true, number: true } } } });
  if (!payment) return;
  const existing = await db.chargeback.findFirst({ where: { providerRef: input.providerRef } });
  if (existing) return;
  const amount = payment.presentmentAmount > 0 ? Math.round((input.amountPresentment * payment.amount) / payment.presentmentAmount) : input.amountPresentment;
  await db.chargeback.create({
    data: { paymentId, orderId: payment.orderId, providerRef: input.providerRef, amount, currency: payment.currency, reason: input.reason, evidenceDueAt: input.evidenceDueAt },
  });
  await addOrderEvent(db, payment.orderId, "chargeback.opened", `Chargeback opened for ${formatMoney(amount)}${input.reason ? ` (${input.reason})` : ""}`, { id: null, type: "webhook" });
  await notifyAdmins("disputes.manage", { type: "chargeback.opened", title: `Chargeback on order ${payment.order.number}`, body: formatMoney(amount), href: `/admin/disputes/chargebacks` });
}

export async function closeChargeback(providerRef: string, outcome: "won" | "lost" | "closed") {
  const cb = await db.chargeback.findFirst({ where: { providerRef } });
  if (!cb) return;
  await db.chargeback.update({ where: { id: cb.id }, data: { status: outcome } });
  await addOrderEvent(db, cb.orderId, "chargeback.closed", `Chargeback ${outcome}`, { id: null, type: "webhook" });
  if (outcome === "lost") {
    const payment = await db.payment.findUnique({ where: { id: cb.paymentId } });
    if (payment) await applyProviderRefund(payment.id, payment.presentmentAmount, { id: null, type: "webhook" });
  }
}
