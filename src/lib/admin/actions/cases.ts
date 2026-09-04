"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { saveUpload } from "@/lib/media";
import { queueTemplateEmail } from "@/lib/mail";
import { formatMoney } from "@/lib/money";
import { notifyUser } from "@/lib/notifications";
import { addOrderEvent, releaseOrderStock, syncOrderStatus } from "@/lib/orders/lifecycle";
import { issueRefund } from "@/lib/payments/payment-service";
import { DISPUTE_OUTCOMES, DISPUTE_STATUSES, RETURN_STATUSES } from "@/lib/domain";
import { failState, fieldErrors, formToObject, okState, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const MessageSchema = z.object({ caseType: z.enum(["return", "dispute"]), caseId: zId, body: zTrimmed(4000).min(1), internal: z.string().optional() });

/** Admin reply on a return or dispute thread; may be an internal note. */
export async function adminCaseMessageAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const perm = String(formData.get("caseType")) === "dispute" ? "disputes.manage" : "returns.manage";
  return runAdmin(perm, async (admin) => {
    const parsed = MessageSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Write a message.", fieldErrors(parsed.error));
    const { caseType, caseId, body } = parsed.data;
    const internal = parsed.data.internal === "on";
    const attachments: string[] = [];
    for (const f of formData.getAll("attachments")) {
      if (f instanceof File && f.size > 0 && attachments.length < 5) attachments.push((await saveUpload(f, { purpose: "attachment", ownerId: admin.id, visibility: "private" })).id);
    }
    await db.caseMessage.create({ data: { caseType, caseId, authorId: admin.id, authorRole: "admin", body, isInternal: internal, attachmentsJson: JSON.stringify(attachments) } });
    if (!internal) {
      const rec = caseType === "dispute" ? await db.dispute.findUnique({ where: { id: caseId }, include: { order: { select: { userId: true, number: true } }, seller: { select: { userId: true } } } }) : await db.returnRequest.findUnique({ where: { id: caseId }, include: { order: { select: { userId: true, number: true } }, orderItem: { select: { seller: { select: { userId: true } } } } } });
      if (rec) {
        const buyerId = rec.order.userId;
        const sellerUserId = caseType === "dispute" ? (rec as { seller: { userId: string } | null }).seller?.userId : (rec as { orderItem: { seller: { userId: string } | null } | null }).orderItem?.seller?.userId;
        for (const uid of [buyerId, sellerUserId].filter((v): v is string => Boolean(v))) {
          await notifyUser(uid, { type: `${caseType}.message`, title: `Marketplace replied on your ${caseType} (order ${rec.order.number})`, body: body.slice(0, 120), href: uid === buyerId ? `/account/orders/${rec.order.number}` : `/dashboard/${caseType === "dispute" ? "disputes" : "returns"}`, category: uid === buyerId ? "orderUpdates" : "sellerAlerts" });
        }
      }
    }
    revalidatePath(`/admin/${caseType === "dispute" ? "disputes" : "returns"}/${caseId}`);
    return okState(undefined, internal ? "Internal note added." : "Reply sent.");
  });
}

export async function setReturnStatusAction(id: string, status: string, note?: string): Promise<ActionState> {
  return runAdmin("returns.manage", async (admin) => {
    if (!(RETURN_STATUSES as readonly string[]).includes(status)) return failState("Unknown status.");
    const rr = await db.returnRequest.findUnique({ where: { id }, include: { order: { select: { id: true, number: true, userId: true, email: true } } } });
    if (!rr) return failState("Return not found.");
    await db.returnRequest.update({ where: { id }, data: { status, adminNote: note?.trim() || rr.adminNote, handledById: admin.id, resolution: status === "rejected" ? "rejected" : rr.resolution } });
    await db.caseMessage.create({ data: { caseType: "return", caseId: id, authorId: admin.id, authorRole: "admin", body: `Return ${status.replace(/_/g, " ")}.${note ? ` ${note}` : ""}` } });
    await addOrderEvent(db, rr.orderId, `return.${status}`, `Return ${status.replace(/_/g, " ")} by marketplace`, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: `return.${status}`, targetType: "return", targetId: id, summary: `Return on ${rr.order.number} → ${status}` });
    const vars = { orderNumber: rr.order.number, status: status.replace(/_/g, " "), note: note ?? "" };
    if (rr.order.userId) await notifyUser(rr.order.userId, { type: "return.update", title: `Return ${status.replace(/_/g, " ")} — order ${rr.order.number}`, body: note, href: `/account/orders/${rr.order.number}`, email: { templateKey: "return_update", vars } });
    else await queueTemplateEmail("return_update", rr.order.email, { name: "there", ...vars });
    revalidatePath(`/admin/returns/${id}`);
    revalidatePath("/admin/returns");
    return okState(undefined, `Return ${status.replace(/_/g, " ")}.`);
  });
}

const ReturnRefundSchema = z.object({ returnId: zId, amount: z.coerce.number().positive(), restock: z.string().optional(), note: zOptionalTrimmed(500) });

export async function refundReturnAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("returns.manage", async (admin) => {
    const parsed = ReturnRefundSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Enter a refund amount.", fieldErrors(parsed.error));
    const rr = await db.returnRequest.findUnique({ where: { id: parsed.data.returnId }, include: { orderItem: true } });
    if (!rr) return failState("Return not found.");
    const amount = Math.round(parsed.data.amount * 100);
    const result = await issueRefund({ orderId: rr.orderId, amount, reason: "return", note: parsed.data.note ?? "Return refund", items: rr.orderItemId ? [{ orderItemId: rr.orderItemId, qty: rr.qty }] : [], restock: parsed.data.restock === "on", actor: actorOf(admin), idempotencyKey: `return_${rr.id}_${amount}`, returnRequestId: rr.id });
    await db.returnRequest.update({ where: { id: rr.id }, data: { status: "refunded", resolution: amount < (rr.orderItem ? rr.orderItem.subtotal - rr.orderItem.discountAmount : amount) ? "partial_refund" : "refund", refundAmount: amount, handledById: admin.id } });
    revalidatePath(`/admin/returns/${rr.id}`);
    revalidatePath("/admin/returns");
    return okState(undefined, `Refund of ${formatMoney(amount)} ${result.status === "pending" ? "pending" : "issued"} and return closed.`);
  });
}

export async function setDisputeStatusAction(id: string, status: string, note?: string): Promise<ActionState> {
  return runAdmin("disputes.manage", async (admin) => {
    if (!(DISPUTE_STATUSES as readonly string[]).includes(status)) return failState("Unknown status.");
    const d = await db.dispute.findUnique({ where: { id }, include: { order: { select: { number: true, userId: true } }, seller: { select: { userId: true } } } });
    if (!d) return failState("Dispute not found.");
    await db.dispute.update({ where: { id }, data: { status, priority: status === "escalated" ? "high" : d.priority, escalatedAt: status === "escalated" ? new Date() : d.escalatedAt } });
    if (note) await db.caseMessage.create({ data: { caseType: "dispute", caseId: id, authorId: admin.id, authorRole: "admin", body: note } });
    await audit({ actor: actorOf(admin), action: `dispute.${status}`, targetType: "dispute", targetId: id, summary: `Dispute on ${d.order.number} → ${status}` });
    for (const uid of [d.order.userId, d.seller?.userId].filter((v): v is string => Boolean(v))) {
      await notifyUser(uid, { type: "dispute.update", title: `Dispute ${status.replace(/_/g, " ")} — order ${d.order.number}`, body: note, href: uid === d.order.userId ? `/account/orders/${d.order.number}` : `/dashboard/disputes/${id}`, category: uid === d.order.userId ? "orderUpdates" : "sellerAlerts", email: { templateKey: "dispute_update", vars: { orderNumber: d.order.number, status: status.replace(/_/g, " "), note: note ?? "" } } });
    }
    revalidatePath(`/admin/disputes/${id}`);
    revalidatePath("/admin/disputes");
    return okState(undefined, `Dispute ${status.replace(/_/g, " ")}.`);
  });
}

const DecideSchema = z.object({ disputeId: zId, outcome: z.enum(DISPUTE_OUTCOMES), refundAmount: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().min(0).optional()), decision: zTrimmed(2000).min(5), restock: z.string().optional() });

/** Final ruling: optionally refunds the buyer, notifies both parties and closes the case. */
export async function decideDisputeAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("disputes.manage", async (admin) => {
    const parsed = DecideSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the decision form.", fieldErrors(parsed.error));
    const d = await db.dispute.findUnique({ where: { id: parsed.data.disputeId }, include: { order: { select: { id: true, number: true, userId: true, email: true } }, orderItem: true, seller: { select: { userId: true } } } });
    if (!d) return failState("Dispute not found.");
    const amount = parsed.data.refundAmount ? Math.round(parsed.data.refundAmount * 100) : 0;
    let refundNote = "";
    if (amount > 0 && (parsed.data.outcome === "buyer" || parsed.data.outcome === "split")) {
      const result = await issueRefund({ orderId: d.orderId, amount, reason: "dispute", note: `Dispute ruling: ${parsed.data.outcome}`, items: d.orderItemId ? [{ orderItemId: d.orderItemId, qty: d.orderItem?.qty ?? 1 }] : [], restock: parsed.data.restock === "on", actor: actorOf(admin), idempotencyKey: `dispute_${d.id}_${amount}`, disputeId: d.id });
      refundNote = ` Refund of ${formatMoney(amount)} ${result.status}.`;
    }
    await db.dispute.update({ where: { id: d.id }, data: { status: "resolved", outcome: parsed.data.outcome, refundAmount: amount || null, decision: parsed.data.decision, decidedById: admin.id, decidedAt: new Date() } });
    await db.caseMessage.create({ data: { caseType: "dispute", caseId: d.id, authorId: admin.id, authorRole: "admin", body: `Decision (${parsed.data.outcome}): ${parsed.data.decision}${refundNote}` } });
    await addOrderEvent(db, d.orderId, "dispute.resolved", `Dispute resolved in favour of ${parsed.data.outcome}${refundNote}`, { id: admin.id, type: "admin" });
    if (parsed.data.outcome === "seller" && d.orderItem && parsed.data.restock === "on") {
      await db.$transaction(async (tx) => {
        await releaseOrderStock(tx, d.orderId, "return", admin.id);
        await syncOrderStatus(tx, d.orderId);
      });
    }
    await audit({ actor: actorOf(admin), action: "dispute.decide", targetType: "dispute", targetId: d.id, summary: `Dispute on ${d.order.number} resolved: ${parsed.data.outcome}${refundNote}` });
    const vars = { orderNumber: d.order.number, status: `resolved (${parsed.data.outcome})`, note: parsed.data.decision };
    if (d.order.userId) await notifyUser(d.order.userId, { type: "dispute.resolved", title: `Dispute resolved — order ${d.order.number}`, body: parsed.data.decision, href: `/account/orders/${d.order.number}`, email: { templateKey: "dispute_update", vars } });
    else await queueTemplateEmail("dispute_update", d.order.email, { name: "there", ...vars });
    if (d.seller) await notifyUser(d.seller.userId, { type: "dispute.resolved", title: `Dispute resolved — order ${d.order.number}`, body: parsed.data.decision, href: `/dashboard/disputes/${d.id}`, category: "sellerAlerts", email: { templateKey: "dispute_update", vars } });
    revalidatePath(`/admin/disputes/${d.id}`);
    revalidatePath("/admin/disputes");
    return okState(undefined, `Dispute resolved in favour of the ${parsed.data.outcome}.${refundNote}`);
  });
}

const ChargebackSchema = z.object({ id: zId, status: z.enum(["needs_response", "under_review", "won", "lost", "closed"]), evidence: zOptionalTrimmed(6000) });

export async function updateChargebackAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("disputes.manage", async (admin) => {
    const parsed = ChargebackSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const cb = await db.chargeback.findUnique({ where: { id: parsed.data.id }, include: { order: { select: { number: true } } } });
    if (!cb) return failState("Chargeback not found.");
    await db.chargeback.update({ where: { id: cb.id }, data: { status: parsed.data.status, evidenceJson: parsed.data.evidence ? JSON.stringify({ text: parsed.data.evidence, by: admin.email, at: new Date().toISOString() }) : cb.evidenceJson, submittedAt: parsed.data.status === "under_review" && parsed.data.evidence ? new Date() : cb.submittedAt } });
    await addOrderEvent(db, cb.orderId, `chargeback.${parsed.data.status}`, `Chargeback ${parsed.data.status.replace(/_/g, " ")}${parsed.data.evidence ? " (evidence recorded)" : ""}`, { id: admin.id, type: "admin" });
    await audit({ actor: actorOf(admin), action: `chargeback.${parsed.data.status}`, targetType: "chargeback", targetId: cb.id, summary: `Chargeback on ${cb.order.number} → ${parsed.data.status}` });
    revalidatePath(`/admin/disputes/chargebacks/${cb.id}`);
    revalidatePath("/admin/disputes/chargebacks");
    return okState(undefined, "Chargeback updated. Submit the evidence in the provider dashboard as well.");
  });
}
