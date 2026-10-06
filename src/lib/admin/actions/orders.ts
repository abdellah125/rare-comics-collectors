"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { AddressSchema } from "@/lib/commerce/pricing";
import { REFUND_REASONS } from "@/lib/domain";
import { queueTemplateEmail } from "@/lib/mail";
import { formatMoney } from "@/lib/money";
import { createShipment, updateShipmentStatus } from "@/lib/orders/fulfillment";
import { addOrderEvent, cancelOrder, restoreLatePaidOrder, syncOrderStatus } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess, finalizeRefund, issueRefund } from "@/lib/payments/payment-service";
import { INVOICE_WHATSAPP, invoiceStatusLabel } from "@/lib/payments/paypal-invoice";
import { failState, fieldErrors, formToObject, okState, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

/** Finance confirms an offline payment arrived: a bank transfer, or a PayPal invoice the buyer paid. */
export async function markPaidManuallyAction(orderId: string, reference?: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!order) return failState("Order not found.");
    if (order.paymentStatus === "paid") return failState("Already paid.");
    if (order.status === "cancelled") return failState("Order is cancelled — the stock was released. Ask the buyer to reorder.");
    const payment = order.payments[0] ?? (await db.payment.create({ data: { orderId, provider: "bank_transfer", method: "bank_transfer", status: "pending", amount: order.total, currency: order.currency, presentmentAmount: order.presentmentTotal } }));
    await applyPaymentSuccess(payment.id, { raw: { reference: reference ?? "manual", confirmedBy: admin.email, ...(order.invoiceStatus ? { invoice: true } : {}) } }, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: "order.mark_paid", targetType: "order", targetId: orderId, summary: `${order.number} marked paid manually${reference ? ` (ref ${reference})` : ""}` });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    return okState(undefined, "Order marked as paid.");
  });
}

/**
 * Moves a PayPal invoice request between "Invoice Pending" and "Invoice Sent". Paid and Cancelled
 * are not set here: they go through markPaidManuallyAction and cancelOrderAdminAction, so the
 * stock, the ledger and the buyer emails follow the same path as every other order.
 */
export async function setInvoiceStatusAction(orderId: string, status: "pending" | "sent", reference?: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) return failState("Order not found.");
    if (!order.invoiceStatus) return failState("This order is not a PayPal invoice request.");
    if (order.status !== "pending_payment" || order.paymentStatus === "paid") return failState(`This order is ${order.paymentStatus === "paid" ? "already paid" : order.status}; its invoice status can no longer change.`);
    if (order.invoiceStatus === status) return failState(`Already marked "${invoiceStatusLabel(status)}".`);
    const ref = reference?.trim().slice(0, 80) || null;
    await db.order.update({ where: { id: orderId }, data: status === "sent" ? { invoiceStatus: "sent", invoiceSentAt: new Date(), invoiceRef: ref } : { invoiceStatus: "pending" } });
    const amount = formatMoney(order.presentmentTotal, order.currency);
    await addOrderEvent(db, orderId, `invoice.${status}`, status === "sent" ? `PayPal invoice sent to ${order.paypalEmail} for ${amount}${ref ? ` (invoice ${ref})` : ""}` : "PayPal invoice marked as pending", { id: admin.id, type: "admin" });
    if (status === "sent" && order.paypalEmail) {
      await queueTemplateEmail("paypal_invoice_sent", order.email, { name: order.invoiceName ?? "there", orderNumber: order.number, total: amount, paypalEmail: order.paypalEmail, whatsapp: INVOICE_WHATSAPP.display, whatsappUrl: INVOICE_WHATSAPP.url }, { userId: order.userId });
    }
    await audit({ actor: actorOf(admin), action: `order.invoice_${status}`, targetType: "order", targetId: orderId, summary: `${order.number}: PayPal invoice ${status}${ref ? ` (${ref})` : ""}` });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    return okState(undefined, status === "sent" ? "Marked as Invoice Sent. The buyer has been emailed." : "Marked as Invoice Pending.");
  });
}

/** Asks PayPal / Stripe whether an unpaid order's payment actually went through and books it if so. */
export async function reconcilePaymentAction(orderId: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!order) return failState("Order not found.");
    const payment = order.payments[0];
    if (!payment) return failState("This order has no payment record.");
    const { reconcilePayment } = await import("@/lib/payments/reconcile");
    const outcome = await reconcilePayment(payment.id, { id: admin.id, type: "admin" });
    const fresh = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, paymentStatus: true } });
    // Paid but still cancelled (late money, or stamped before restores existed): try to take the stock back now.
    const restore = fresh.paymentStatus === "paid" && ["cancelled", "failed"].includes(fresh.status) ? await restoreLatePaidOrder(orderId, { id: admin.id, type: "admin" }) : null;
    await audit({ actor: actorOf(admin), action: "order.reconcile_payment", targetType: "order", targetId: orderId, summary: `${order.number}: ${payment.provider} says ${outcome}${restore ? `, restore ${restore}` : ""}` });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    if (restore === "restored") return okState(undefined, "The payment is confirmed and the stock was still available: the order is restored and now paid.");
    if (restore === "unavailable") return failState("The payment is confirmed, but the copy has since been sold to someone else. The order stays cancelled: refund the buyer below.");
    if (outcome === "succeeded") return okState(undefined, order.paymentStatus === "paid" ? "This order is already paid." : "The gateway confirms the payment. The order is now paid.");
    if (outcome === "pending") return okState(undefined, "The gateway has not completed this payment yet (or could not be reached). Try again in a few minutes.");
    if (outcome === "failed") return okState(undefined, "The gateway reports no completed payment for this order.");
    return failState("This payment method cannot be checked automatically.");
  });
}

export async function cancelOrderAdminAction(orderId: string, reason?: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    if (!reason?.trim()) return failState("A reason is required.");
    await cancelOrder(orderId, reason.trim(), { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: "order.cancel", targetType: "order", targetId: orderId, summary: `Order cancelled: ${reason}` });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    return okState(undefined, "Order cancelled. If it was paid, issue a refund below.");
  });
}

export async function setOrderStatusAction(orderId: string, status: "processing" | "completed"): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { number: true, status: true, paymentStatus: true } });
    if (!order) return failState("Order not found.");
    if (order.paymentStatus === "unpaid") return failState("Order isn't paid.");
    await db.order.update({ where: { id: orderId }, data: { status, completedAt: status === "completed" ? new Date() : undefined } });
    await addOrderEvent(db, orderId, `order.${status}`, `Marked ${status} by admin`, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: `order.${status}`, targetType: "order", targetId: orderId, summary: `${order.number} → ${status}` });
    revalidatePath(`/admin/orders/${orderId}`);
    return okState(undefined, `Order marked ${status}.`);
  });
}

const RefundSchema = z.object({
  orderId: zId,
  amount: z.coerce.number().positive(),
  reason: z.enum(REFUND_REASONS),
  note: zOptionalTrimmed(500),
  restock: z.string().optional(),
  items: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function refundOrderAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("orders.refund", async (admin) => {
    const parsed = RefundSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the refund form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const rawItems = Array.isArray(d.items) ? d.items : d.items ? [d.items] : [];
    const items = rawItems
      .map((v) => {
        const qty = Number.parseInt(String(formData.get(`qty_${v}`) ?? "1"), 10) || 1;
        return { orderItemId: v, qty };
      })
      .filter((i) => i.qty > 0);
    const amount = Math.round(d.amount * 100);
    const key = `admin_${d.orderId}_${amount}_${items.map((i) => `${i.orderItemId}:${i.qty}`).join("|")}_${Math.floor(Date.now() / 60_000)}`;
    const result = await issueRefund({ orderId: d.orderId, amount, reason: d.reason, note: d.note ?? null, items, restock: d.restock === "on", actor: actorOf(admin), idempotencyKey: key });
    revalidatePath(`/admin/orders/${d.orderId}`);
    return okState(undefined, result.status === "pending" ? `Refund of ${formatMoney(amount)} recorded as pending — mark it complete once the money is returned.` : `Refund of ${formatMoney(amount)} issued.`);
  });
}

/** For offline providers: finance confirms the refund transfer was sent. */
export async function completeManualRefundAction(refundId: string, reference?: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const refund = await db.refund.findUnique({ where: { id: refundId }, select: { status: true, orderId: true, amount: true } });
    if (!refund) return failState("Refund not found.");
    if (refund.status !== "pending") return failState("Refund isn't pending.");
    await finalizeRefund(refundId, "succeeded", reference ?? null, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: "refund.complete", targetType: "order", targetId: refund.orderId, summary: `Manual refund ${formatMoney(refund.amount)} completed${reference ? ` (${reference})` : ""}` });
    revalidatePath(`/admin/orders/${refund.orderId}`);
    revalidatePath("/admin/payments");
    return okState(undefined, "Refund completed.");
  });
}

const ShipSchema = z.object({ orderId: zId, itemIds: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])), carrierId: zOptionalTrimmed(64), carrierName: zOptionalTrimmed(80), trackingNumber: zOptionalTrimmed(80), trackingUrl: zOptionalTrimmed(500), note: zOptionalTrimmed(500) });

export async function adminShipAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const parsed = ShipSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the shipment form.", fieldErrors(parsed.error));
    await createShipment({ ...parsed.data, sellerId: null, actor: actorOf(admin) });
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    return okState(undefined, "Shipment created and the buyer notified.");
  });
}

export async function adminShipmentStatusAction(shipmentId: string, status: "in_transit" | "out_for_delivery" | "delivered" | "exception"): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    await updateShipmentStatus(shipmentId, status, { id: admin.id, type: "admin" });
    const s = await db.shipment.findUnique({ where: { id: shipmentId }, select: { orderId: true } });
    if (s) revalidatePath(`/admin/orders/${s.orderId}`);
    return okState(undefined, `Shipment marked ${status.replace(/_/g, " ")}.`);
  });
}

export async function addOrderNoteAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("orders.view", async (admin) => {
    const orderId = String(formData.get("orderId") ?? "");
    const body = String(formData.get("body") ?? "").trim();
    if (!orderId || !body) return failState("Write a note.");
    await db.orderNote.create({ data: { orderId, authorId: admin.id, body } });
    revalidatePath(`/admin/orders/${orderId}`);
    return okState(undefined, "Note added.");
  });
}

const AddressUpdateSchema = AddressSchema.extend({ orderId: zId, which: z.enum(["shipping", "billing"]) });

export async function updateOrderAddressAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const parsed = AddressUpdateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the address.", fieldErrors(parsed.error));
    const { orderId, which, ...address } = parsed.data;
    const order = await db.order.findUnique({ where: { id: orderId }, select: { number: true, fulfillmentStatus: true, shippingAddressJson: true, billingAddressJson: true } });
    if (!order) return failState("Order not found.");
    if (which === "shipping" && order.fulfillmentStatus !== "unfulfilled") return failState("The order has already shipped — contact the carrier for redirection.");
    await db.order.update({ where: { id: orderId }, data: which === "shipping" ? { shippingAddressJson: JSON.stringify(address), countryCode: address.countryCode } : { billingAddressJson: JSON.stringify(address) } });
    await addOrderEvent(db, orderId, "order.address_updated", `${which} address updated by admin`, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: "order.address", targetType: "order", targetId: orderId, summary: `${order.number} ${which} address changed`, before: which === "shipping" ? order.shippingAddressJson : order.billingAddressJson, after: address });
    revalidatePath(`/admin/orders/${orderId}`);
    return okState(undefined, "Address updated.");
  });
}

export async function resendConfirmationAction(orderId: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return failState("Order not found.");
    const itemsList = order.items.map((i) => `• ${i.title} × ${i.qty} — ${formatMoney(i.subtotal)}`).join("\n");
    await queueTemplateEmail("order_confirmation", order.email, { name: "there", orderNumber: order.number, total: formatMoney(order.total), itemsList }, { userId: order.userId });
    await addOrderEvent(db, orderId, "email.resent", "Order confirmation re-sent", { id: admin.id, type: "admin" });
    return okState(undefined, "Confirmation email queued.");
  });
}

export async function bulkOrdersAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    let done = 0;
    for (const id of ids.slice(0, 100)) {
      if (actionId === "cancel_unpaid") {
        const o = await db.order.findUnique({ where: { id }, select: { status: true } });
        if (o?.status === "pending_payment") {
          await cancelOrder(id, "Cancelled by admin (bulk)", { id: admin.id, type: "admin" });
          done += 1;
        }
      } else if (actionId === "processing") {
        const r = await db.order.updateMany({ where: { id, status: "paid" }, data: { status: "processing" } });
        if (r.count) {
          await addOrderEvent(db, id, "order.processing", "Marked processing (bulk)", { id: admin.id, type: "admin" });
          done += 1;
        }
      }
    }
    await audit({ actor: actorOf(admin), action: `order.bulk.${actionId}`, targetType: "order", summary: `Bulk ${actionId} on ${done} orders` });
    revalidatePath("/admin/orders");
    return okState(undefined, `${done} order${done === 1 ? "" : "s"} updated.`);
  });
}

const RiskSchema = z.object({ orderId: zId, riskScore: z.coerce.number().int().min(0).max(100), note: zTrimmed(300).optional() });

export async function setRiskAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const parsed = RiskSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Invalid risk score.");
    await db.order.update({ where: { id: parsed.data.orderId }, data: { riskScore: parsed.data.riskScore } });
    await addOrderEvent(db, parsed.data.orderId, "risk.reviewed", `Risk reviewed by admin → ${parsed.data.riskScore}${parsed.data.note ? `: ${parsed.data.note}` : ""}`, { id: admin.id, type: "admin" });
    await syncOrderStatus(db, parsed.data.orderId);
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    return okState(undefined, "Risk score saved.");
  });
}

/* ------------------------------------------------------------ crypto payments */

/** Staff ask the blockchain about an order's crypto payment right now. It only ever reports what the chain shows. */
export async function checkCryptoPaymentAction(orderId: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const row = await db.cryptoPayment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    if (!row) return failState("This order has no crypto payment.");
    const { checkCryptoPayment } = await import("@/lib/crypto-payments/service");
    const fresh = await checkCryptoPayment(row.id, { force: true, actor: { id: admin.id, type: "admin" } });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath("/admin/orders");
    const s = fresh?.status ?? row.status;
    if (s === "paid") return okState(undefined, "The payment is confirmed on chain and the order is paid.");
    if (s === "detected" || s === "confirming") return okState(undefined, `Transaction found: ${fresh?.confirmations ?? 0} of ${row.requiredConfirmations} confirmations.`);
    if (s === "review" || s === "underpaid") return okState(undefined, "A transfer was found but needs your decision: see the note on the crypto payment.");
    return okState(undefined, "No matching transfer on the blockchain yet.");
  });
}

/** Staff point at the transaction that paid an order (for example from the wallet's history). It is verified on chain like a buyer's. */
export async function attachCryptoTxAction(orderId: string, hash?: string): Promise<ActionState> {
  return runAdmin("orders.manage", async (admin) => {
    const row = await db.cryptoPayment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    if (!row) return failState("This order has no crypto payment.");
    if (!hash?.trim()) return failState("Enter the transaction hash.");
    const { submitTxHash } = await import("@/lib/crypto-payments/service");
    const res = await submitTxHash(row.id, hash, "admin", { id: admin.id, type: "admin" });
    if (!res.ok) return failState(res.message);
    await audit({ actor: actorOf(admin), action: "order.crypto_tx_attached", targetType: "order", targetId: orderId, summary: `Crypto transaction ${res.payment.txHash} attached (${res.payment.status})` });
    revalidatePath(`/admin/orders/${orderId}`);
    return okState(undefined, res.payment.status === "paid" ? "Verified on chain: the order is paid." : `Transaction found on chain. Status: ${res.payment.status}.`);
  });
}

/**
 * Finance accepts a crypto payment the automatic rules did not settle (late, short, over, or
 * the blockchain API could not be reached): the person has looked at the wallet and takes the
 * decision. Recorded in the audit log with their name and the reason they give.
 */
export async function markCryptoPaidAction(orderId: string, reason?: string): Promise<ActionState> {
  const row = await db.cryptoPayment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  if (!row) return failState("This order has no crypto payment.");
  if (!row.txHash && !reason?.trim()) return failState("Enter the transaction hash you checked in your wallet, or the reason this order is accepted without one.");
  const res = await markPaidManuallyAction(orderId, `crypto ${row.txHash ? `tx ${row.txHash}` : "accepted by hand"}${reason?.trim() ? ` — ${reason.trim()}` : ""}`);
  if (res.ok) await db.cryptoPayment.update({ where: { id: row.id }, data: { status: "paid", paidAt: new Date(), note: `Accepted by staff${reason?.trim() ? `: ${reason.trim()}` : ""}` } });
  return res;
}
