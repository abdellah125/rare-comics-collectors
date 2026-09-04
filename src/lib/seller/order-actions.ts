"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSeller, AuthError } from "@/lib/auth/session";
import { notifyUser } from "@/lib/notifications";
import { createShipment, FulfillmentError, updateShipmentStatus } from "@/lib/orders/fulfillment";
import { addOrderEvent } from "@/lib/orders/lifecycle";
import { issueRefund, RefundError } from "@/lib/payments/payment-service";
import { queueTemplateEmail } from "@/lib/mail";
import { formatMoney } from "@/lib/money";
import { failState, fieldErrors, formToObject, okState, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const ShipSchema = z.object({
  orderId: zId,
  itemIds: z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v : [v])),
  carrierId: zOptionalTrimmed(64),
  carrierName: zOptionalTrimmed(80),
  trackingNumber: zOptionalTrimmed(80),
  trackingUrl: zOptionalTrimmed(500),
  note: zOptionalTrimmed(500),
});

export async function shipItemsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const parsed = ShipSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    if (parsed.data.trackingUrl && !/^https:\/\//.test(parsed.data.trackingUrl)) return failState("Tracking links must start with https://", { trackingUrl: "Invalid URL" });
    await createShipment({ ...parsed.data, sellerId: user.seller.id, actor: { id: user.id, email: user.email, type: "seller" } });
    revalidatePath("/dashboard/orders");
    return okState(undefined, "Shipment recorded and the buyer has been notified.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof FulfillmentError) return failState(err.message);
    throw err;
  }
}

export async function sellerShipmentStatusAction(shipmentId: string, status: "in_transit" | "out_for_delivery" | "delivered" | "exception"): Promise<ActionState> {
  try {
    const user = await assertSeller();
    await updateShipmentStatus(shipmentId, status, { id: user.id, type: "seller" }, { sellerId: user.seller.id });
    revalidatePath("/dashboard/orders");
    return okState(undefined, `Shipment marked ${status.replace(/_/g, " ")}.`);
  } catch (err) {
    if (err instanceof AuthError || err instanceof FulfillmentError) return failState(err.message);
    throw err;
  }
}

const ReturnDecisionSchema = z.object({ returnId: zId, decision: z.enum(["approve", "reject", "received"]), note: zOptionalTrimmed(1000) });

/** Seller responds to a return request on their own item. */
export async function sellerReturnDecisionAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const parsed = ReturnDecisionSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.");
    const rr = await db.returnRequest.findUnique({ where: { id: parsed.data.returnId }, include: { orderItem: true, order: { select: { id: true, number: true, userId: true, email: true } } } });
    if (!rr || rr.orderItem?.sellerId !== user.seller.id) throw new AuthError("Return not found", 403);
    const map = { approve: "approved", reject: "rejected", received: "received" } as const;
    const next = map[parsed.data.decision];
    if (next === "approved" && rr.status !== "requested") return failState("This return isn't awaiting a decision.");
    if (next === "rejected" && rr.status !== "requested") return failState("This return isn't awaiting a decision.");
    if (next === "received" && !["approved", "shipped_back"].includes(rr.status)) return failState("Approve the return before marking it received.");
    await db.returnRequest.update({ where: { id: rr.id }, data: { status: next, sellerNote: parsed.data.note ?? rr.sellerNote, resolution: next === "rejected" ? "rejected" : rr.resolution } });
    await db.caseMessage.create({ data: { caseType: "return", caseId: rr.id, authorId: user.id, authorRole: "seller", body: `${next === "approved" ? "Return approved." : next === "rejected" ? "Return declined." : "Item received."}${parsed.data.note ? ` ${parsed.data.note}` : ""}` } });
    await addOrderEvent(db, rr.orderId, `return.${next}`, `Return ${next} by seller`, { id: user.id, type: "seller" });
    const vars = { orderNumber: rr.order.number, status: next, note: parsed.data.note ?? "" };
    if (rr.order.userId) await notifyUser(rr.order.userId, { type: "return.update", title: `Return ${next} — order ${rr.order.number}`, body: parsed.data.note, href: `/account/orders/${rr.order.number}`, email: { templateKey: "return_update", vars } });
    else await queueTemplateEmail("return_update", rr.order.email, { name: "there", ...vars });
    revalidatePath("/dashboard/returns");
    return okState(undefined, `Return ${next}.`);
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}

const SellerRefundSchema = z.object({ orderId: zId, orderItemId: zId, qty: z.coerce.number().int().min(1).max(25), reason: zTrimmed(40), note: zOptionalTrimmed(500), restock: z.string().optional(), returnRequestId: zOptionalTrimmed(64) });

/** Sellers can refund their own items (full item value per unit). */
export async function sellerRefundAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const parsed = SellerRefundSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const item = await db.orderItem.findFirst({ where: { id: parsed.data.orderItemId, orderId: parsed.data.orderId, sellerId: user.seller.id } });
    if (!item) throw new AuthError("Item not found", 403);
    const perUnit = Math.round((item.subtotal - item.discountAmount) / item.qty);
    const amount = perUnit * parsed.data.qty;
    const result = await issueRefund({
      orderId: item.orderId,
      amount,
      reason: parsed.data.reason === "return" ? "return" : "requested_by_customer",
      note: parsed.data.note ?? null,
      items: [{ orderItemId: item.id, qty: parsed.data.qty }],
      restock: parsed.data.restock === "on",
      actor: { id: user.id, email: user.email, type: "seller" },
      idempotencyKey: `seller_${item.id}_${item.refundedQty}_${parsed.data.qty}`,
      returnRequestId: parsed.data.returnRequestId || null,
    });
    if (parsed.data.returnRequestId) await db.returnRequest.update({ where: { id: parsed.data.returnRequestId }, data: { status: "refunded", resolution: "refund", refundAmount: amount } }).catch(() => {});
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/returns");
    return okState(undefined, `Refund of ${formatMoney(amount)} ${result.status === "pending" ? "is pending with the payment provider" : "issued"}.`);
  } catch (err) {
    if (err instanceof AuthError || err instanceof RefundError) return failState(err.message);
    throw err;
  }
}

const ReplySchema = z.object({ reviewId: zId, reply: zTrimmed(2000).min(1, { error: "Write a reply" }) });

export async function replyToReviewAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const parsed = ReplySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Write a reply.", fieldErrors(parsed.error));
    const review = await db.review.findFirst({ where: { id: parsed.data.reviewId, OR: [{ sellerId: user.seller.id }, { product: { sellerId: user.seller.id } }] }, include: { product: { select: { title: true, issue: true, slug: true } } } });
    if (!review) throw new AuthError("Review not found", 403);
    await db.review.update({ where: { id: review.id }, data: { sellerReply: parsed.data.reply, sellerRepliedAt: new Date() } });
    await notifyUser(review.userId, { type: "review.reply", title: `${user.seller.displayName} replied to your review`, body: parsed.data.reply.slice(0, 120), href: "/account/reviews", email: { templateKey: "review_reply", vars: { sellerName: user.seller.displayName, productTitle: review.product ? `${review.product.title} ${review.product.issue}` : "your purchase", reply: parsed.data.reply } } });
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "review.reply", targetType: "review", targetId: review.id, summary: `${user.seller.displayName} replied to a review` });
    revalidatePath("/dashboard/reviews");
    if (review.product) revalidatePath(`/store/${review.product.slug}`);
    return okState(undefined, "Reply posted.");
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}
