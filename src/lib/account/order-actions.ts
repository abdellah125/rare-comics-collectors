"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertUser, AuthError } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/jobs/queue";
import { saveUpload, UploadError } from "@/lib/media";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { addOrderEvent, cancelOrder } from "@/lib/orders/lifecycle";
import { getSettings } from "@/lib/settings";
import { DISPUTE_REASONS, RETURN_REASONS } from "@/lib/domain";
import { failState, fieldErrors, formToObject, okState, zId, zInt, zTrimmed, type ActionState } from "@/lib/validation";

function handle(err: unknown): ActionState {
  if (err instanceof AuthError) return failState(err.message);
  if (err instanceof UploadError) return failState(err.message);
  throw err;
}

async function ownOrder(orderId: string, userId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId }, include: { items: true, shipments: true } });
  if (!order) throw new AuthError("Order not found", 403);
  return order;
}

/** Buyers can cancel while payment is still outstanding. */
export async function cancelOwnOrderAction(orderId: string): Promise<ActionState> {
  try {
    const user = await assertUser();
    const order = await ownOrder(orderId, user.id);
    if (order.status !== "pending_payment") return failState("Only orders awaiting payment can be cancelled here. Contact support for anything else.");
    await cancelOrder(order.id, "Cancelled by the buyer", { id: user.id, type: "buyer" });
    revalidatePath(`/account/orders/${order.number}`);
    return okState(undefined, "Order cancelled.");
  } catch (err) {
    return handle(err);
  }
}

const ReturnSchema = z.object({
  orderId: zId,
  orderItemId: zId,
  qty: zInt.min(1).max(25),
  reason: z.enum(RETURN_REASONS),
  details: zTrimmed(2000).optional(),
});

export async function requestReturnAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = ReturnSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const order = await ownOrder(parsed.data.orderId, user.id);
    const item = order.items.find((i) => i.id === parsed.data.orderItemId);
    if (!item) return failState("That item isn't on this order.");
    if (!["delivered", "completed"].includes(order.status) && item.status !== "delivered") return failState("Returns can be requested once the item is delivered.");
    const settings = await getSettings();
    const delivered = order.shipments.map((s) => s.deliveredAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? order.completedAt ?? order.placedAt;
    if (Date.now() - delivered.getTime() > settings["commerce.returnWindowDays"] * 86_400_000) return failState(`The ${settings["commerce.returnWindowDays"]}-day return window for this order has closed. Contact support if something is wrong with the book.`);
    if (parsed.data.qty > item.qty - item.refundedQty) return failState("Quantity exceeds what was delivered.");
    const open = await db.returnRequest.findFirst({ where: { orderItemId: item.id, status: { in: ["requested", "approved", "shipped_back", "received"] } } });
    if (open) return failState("A return is already open for this item.");
    const rr = await db.returnRequest.create({
      data: { orderId: order.id, orderItemId: item.id, userId: user.id, qty: parsed.data.qty, reason: parsed.data.reason, details: parsed.data.details ?? null },
    });
    await addOrderEvent(db, order.id, "return.requested", `Return requested for ${item.title} (${parsed.data.reason.replace(/_/g, " ")})`, { id: user.id, type: "buyer" });
    await notifyAdmins("returns.manage", { type: "return.requested", title: `Return requested on ${order.number}`, body: item.title, href: `/admin/returns/${rr.id}` });
    if (item.sellerId) {
      const seller = await db.sellerProfile.findUnique({ where: { id: item.sellerId }, select: { userId: true } });
      if (seller) await notifyUser(seller.userId, { type: "return.requested", title: `Return requested: ${item.title}`, body: `Order ${order.number}`, href: `/dashboard/returns`, category: "sellerAlerts" });
    }
    revalidatePath(`/account/orders/${order.number}`);
    return okState(undefined, "Return request sent. We'll email you as soon as it's reviewed.");
  } catch (err) {
    return handle(err);
  }
}

const DisputeSchema = z.object({
  orderId: zId,
  orderItemId: z.string().optional(),
  reason: z.enum(DISPUTE_REASONS),
  details: zTrimmed(4000).min(20, { error: "Please describe the problem in at least 20 characters" }),
});

export async function openDisputeAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const settings = await getSettings();
    if (!settings["features.disputes"]) return failState("Disputes are handled through support tickets at the moment.");
    const parsed = DisputeSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const order = await ownOrder(parsed.data.orderId, user.id);
    if (order.paymentStatus === "unpaid") return failState("Disputes can be opened once the order is paid.");
    const item = parsed.data.orderItemId ? order.items.find((i) => i.id === parsed.data.orderItemId) : null;
    if (parsed.data.orderItemId && !item) return failState("That item isn't on this order.");
    const open = await db.dispute.findFirst({ where: { orderId: order.id, status: { notIn: ["resolved", "closed"] } } });
    if (open) return failState("A dispute is already open on this order.");
    const dispute = await db.dispute.create({
      data: { orderId: order.id, orderItemId: item?.id ?? null, openedById: user.id, sellerId: item?.sellerId ?? null, openedByRole: "buyer", reason: parsed.data.reason, details: parsed.data.details, status: item?.sellerId ? "awaiting_seller" : "under_review" },
    });
    await db.caseMessage.create({ data: { caseType: "dispute", caseId: dispute.id, authorId: user.id, authorRole: "buyer", body: parsed.data.details } });
    await addOrderEvent(db, order.id, "dispute.opened", `Dispute opened (${parsed.data.reason.replace(/_/g, " ")})`, { id: user.id, type: "buyer" });
    if (settings["notifications.adminNewDispute"]) await notifyAdmins("disputes.manage", { type: "dispute.opened", title: `Dispute opened on ${order.number}`, body: parsed.data.reason.replace(/_/g, " "), href: `/admin/disputes/${dispute.id}` });
    if (item?.sellerId) {
      const seller = await db.sellerProfile.findUnique({ where: { id: item.sellerId }, select: { userId: true } });
      if (seller) await notifyUser(seller.userId, { type: "dispute.opened", title: `Dispute opened: ${item.title}`, body: `Order ${order.number} — please respond within 3 business days.`, href: `/dashboard/disputes/${dispute.id}`, category: "sellerAlerts", email: { templateKey: "dispute_update", vars: { orderNumber: order.number, status: "opened", note: "A buyer opened a dispute. Reply from your seller dashboard." } } });
    }
    revalidatePath(`/account/orders/${order.number}`);
    return okState(undefined, "Dispute opened. We'll review it and keep you posted here and by email.");
  } catch (err) {
    return handle(err);
  }
}

const MessageSchema = z.object({ caseType: z.enum(["return", "dispute"]), caseId: zId, body: zTrimmed(4000).min(1, { error: "Write a message" }) });

/** Participants (buyer, seller of the item, admins) add messages and evidence to a case. */
export async function addCaseMessageAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = MessageSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Write a message before sending.", fieldErrors(parsed.error));
    const { caseType, caseId, body } = parsed.data;
    let role: "buyer" | "seller" | "admin" | null = null;
    let sellerUserId: string | null = null;
    let buyerId: string | null = null;
    let orderNumber = "";
    if (caseType === "dispute") {
      const d = await db.dispute.findUnique({ where: { id: caseId }, include: { order: { select: { userId: true, number: true } }, seller: { select: { userId: true } } } });
      if (!d) return failState("Case not found.");
      if (["resolved", "closed"].includes(d.status)) return failState("This case is closed.");
      buyerId = d.order.userId;
      sellerUserId = d.seller?.userId ?? null;
      orderNumber = d.order.number;
    } else {
      const r = await db.returnRequest.findUnique({ where: { id: caseId }, include: { order: { select: { userId: true, number: true } }, orderItem: { select: { seller: { select: { userId: true } } } } } });
      if (!r) return failState("Case not found.");
      buyerId = r.order.userId;
      sellerUserId = r.orderItem?.seller?.userId ?? null;
      orderNumber = r.order.number;
    }
    if (user.isAdmin && !user.impersonator) role = "admin";
    else if (buyerId === user.id) role = "buyer";
    else if (sellerUserId === user.id) role = "seller";
    if (!role) throw new AuthError("You're not a participant in this case", 403);

    const attachments: string[] = [];
    for (const f of formData.getAll("attachments")) {
      if (f instanceof File && f.size > 0) {
        const saved = await saveUpload(f, { purpose: "attachment", ownerId: user.id, visibility: "private" });
        attachments.push(saved.id);
      }
      if (attachments.length >= 5) break;
    }
    await db.caseMessage.create({ data: { caseType, caseId, authorId: user.id, authorRole: role, body, attachmentsJson: JSON.stringify(attachments) } });
    if (caseType === "dispute") {
      const next = role === "seller" ? "awaiting_buyer" : role === "buyer" ? (sellerUserId ? "awaiting_seller" : "under_review") : undefined;
      if (next) await db.dispute.update({ where: { id: caseId }, data: { status: next } });
    }
    const recipients = [buyerId, sellerUserId].filter((id): id is string => Boolean(id) && id !== user.id);
    for (const r of recipients) {
      await notifyUser(r, { type: `${caseType}.message`, title: `New message on ${caseType} for order ${orderNumber}`, body: body.slice(0, 120), href: r === buyerId ? `/account/orders/${orderNumber}` : `/dashboard/${caseType === "dispute" ? "disputes" : "returns"}`, category: r === buyerId ? "orderUpdates" : "sellerAlerts" });
    }
    if (role !== "admin") await notifyAdmins(caseType === "dispute" ? "disputes.manage" : "returns.manage", { type: `${caseType}.message`, title: `New ${caseType} message on ${orderNumber}`, body: body.slice(0, 120), href: `/admin/${caseType === "dispute" ? "disputes" : "returns"}/${caseId}` });
    revalidatePath(`/account/orders/${orderNumber}`);
    revalidatePath(`/admin/${caseType === "dispute" ? "disputes" : "returns"}/${caseId}`);
    return okState(undefined, "Message sent.");
  } catch (err) {
    return handle(err);
  }
}

const ReviewSchema = z.object({ orderItemId: zId, rating: zInt.min(1).max(5), title: zTrimmed(120).optional(), body: zTrimmed(3000).min(10, { error: "Write at least 10 characters" }) });

export async function submitReviewAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    if (user.restrictions.includes("no_review")) return failState("Reviews are restricted on this account.");
    const settings = await getSettings();
    if (!settings["features.reviews"] || !settings["buyers.allowReviews"]) return failState("Reviews are currently disabled.");
    const parsed = ReviewSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const item = await db.orderItem.findFirst({ where: { id: parsed.data.orderItemId, order: { userId: user.id } }, include: { order: { select: { id: true, number: true, status: true } } } });
    if (!item || !item.productId) return failState("That item can't be reviewed.");
    if (!["delivered", "completed"].includes(item.order.status) && item.status !== "delivered") return failState("You can review a book once it's delivered.");
    const existing = await db.review.findFirst({ where: { orderItemId: item.id } });
    if (existing) return failState("You've already reviewed this item.");
    const review = await db.review.create({
      data: { productId: item.productId, sellerId: item.sellerId, userId: user.id, orderId: item.order.id, orderItemId: item.id, rating: parsed.data.rating, title: parsed.data.title ?? null, body: parsed.data.body, isVerifiedPurchase: true, status: "published" },
    });
    const agg = await db.review.aggregate({ _avg: { rating: true }, _count: { _all: true }, where: { productId: item.productId, status: "published" } });
    await db.product.update({ where: { id: item.productId }, data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count._all } });
    if (item.sellerId) await enqueueJob("recompute_seller_stats", { sellerId: item.sellerId });
    await audit({ actor: { id: user.id, email: user.email, type: "user" }, action: "review.create", targetType: "review", targetId: review.id, summary: `${user.email} reviewed ${item.title} (${parsed.data.rating}/5)` });
    revalidatePath(`/account/orders/${item.order.number}`);
    revalidatePath(`/store/${item.slug}`);
    return okState(undefined, "Thanks — your review is live.");
  } catch (err) {
    return handle(err);
  }
}
