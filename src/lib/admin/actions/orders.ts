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
import { addOrderEvent, cancelOrder, syncOrderStatus } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess, finalizeRefund, issueRefund } from "@/lib/payments/payment-service";
import { failState, fieldErrors, formToObject, okState, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

/** Finance confirms an offline (bank transfer) payment arrived. */
export async function markPaidManuallyAction(orderId: string, reference?: string): Promise<ActionState> {
  return runAdmin("finance.manage", async (admin) => {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!order) return failState("Order not found.");
    if (order.paymentStatus === "paid") return failState("Already paid.");
    if (order.status === "cancelled") return failState("Order is cancelled — the stock was released. Ask the buyer to reorder.");
    const payment = order.payments[0] ?? (await db.payment.create({ data: { orderId, provider: "bank_transfer", method: "bank_transfer", status: "pending", amount: order.total, currency: order.currency, presentmentAmount: order.presentmentTotal } }));
    await applyPaymentSuccess(payment.id, { raw: { reference: reference ?? "manual", confirmedBy: admin.email } }, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: "order.mark_paid", targetType: "order", targetId: orderId, summary: `${order.number} marked paid manually${reference ? ` (ref ${reference})` : ""}` });
    revalidatePath(`/admin/orders/${orderId}`);
    return okState(undefined, "Order marked as paid.");
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
