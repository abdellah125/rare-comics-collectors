"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { createPayoutForSeller } from "@/lib/finance/ledger";
import { queueTemplateEmail } from "@/lib/mail";
import { bpsToPercent } from "@/lib/money";
import { notifyUser } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, zBool, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

type Decision = "approve" | "reject" | "suspend" | "reactivate";

export async function reviewSellerAction(id: string, decision: Decision, reason?: string): Promise<ActionState> {
  return runAdmin("sellers.manage", async (admin) => {
    const seller = await db.sellerProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, name: true } } } });
    if (!seller) return failState("Seller not found.");
    if ((decision === "reject" || decision === "suspend") && !reason?.trim()) return failState("A reason is required.");
    const settings = await getSettings();
    const map: Record<Decision, string> = { approve: "approved", reject: "rejected", suspend: "suspended", reactivate: "approved" };
    const status = map[decision];
    await db.sellerProfile.update({
      where: { id },
      data: { status, statusReason: reason?.trim() || null, ...(decision === "approve" ? { approvedAt: new Date(), approvedById: admin.id } : {}) },
    });
    await db.user.update({ where: { id: seller.userId }, data: { isSeller: status === "approved" || status === "suspended" } });
    if (decision === "suspend") {
      await db.product.updateMany({ where: { sellerId: id, status: { in: ["published", "pending"] } }, data: { status: "hidden", moderationNote: `Seller suspended: ${reason}` } });
    }
    await audit({ actor: actorOf(admin), action: `seller.${decision}`, targetType: "seller", targetId: id, summary: `${seller.displayName}: ${seller.status} → ${status}${reason ? ` (${reason})` : ""}` });
    if (decision === "approve" || decision === "reactivate") {
      await notifyUser(seller.userId, { type: "seller.approved", title: "Your seller account is live", href: "/dashboard", category: "sellerAlerts", email: { templateKey: "seller_approved", vars: { commission: bpsToPercent(seller.commissionBps ?? settings["commerce.commissionBps"]) } } });
    } else if (decision === "reject") {
      await queueTemplateEmail("seller_rejected", seller.user.email, { name: seller.user.name, reason: reason ?? "" }, { userId: seller.userId });
    } else {
      await notifyUser(seller.userId, { type: "seller.suspended", title: "Your seller account has been suspended", body: reason, href: "/account/seller", category: "security", email: { templateKey: "account_status", vars: { status: "seller account suspended", reason: reason ?? "" } } });
    }
    revalidatePath(`/admin/sellers/${id}`);
    revalidatePath("/admin/sellers");
    return okState(undefined, `Seller ${status}.`);
  });
}

export async function setVerificationAction(id: string, status: "verified" | "rejected" | "pending", note?: string): Promise<ActionState> {
  return runAdmin("sellers.manage", async (admin) => {
    const seller = await db.sellerProfile.findUnique({ where: { id }, select: { displayName: true, userId: true } });
    if (!seller) return failState("Seller not found.");
    if (status === "rejected" && !note?.trim()) return failState("Tell the seller what to fix.");
    await db.sellerProfile.update({ where: { id }, data: { verificationStatus: status, verificationNote: note?.trim() || null, verifiedAt: status === "verified" ? new Date() : null } });
    await audit({ actor: actorOf(admin), action: `seller.verification.${status}`, targetType: "seller", targetId: id, summary: `${seller.displayName} verification → ${status}${note ? ` (${note})` : ""}` });
    await notifyUser(seller.userId, { type: "seller.verification", title: status === "verified" ? "Identity verified — payouts unlocked" : status === "rejected" ? "Verification needs attention" : "Verification pending", body: note, href: "/dashboard/settings#verification", category: "sellerAlerts" });
    revalidatePath(`/admin/sellers/${id}`);
    return okState(undefined, `Verification ${status}.`);
  });
}

export async function reviewDocumentAction(docId: string, status: "accepted" | "rejected", note?: string): Promise<ActionState> {
  return runAdmin("sellers.manage", async (admin) => {
    const doc = await db.sellerDocument.findUnique({ where: { id: docId }, select: { sellerId: true, type: true } });
    if (!doc) return failState("Document not found.");
    await db.sellerDocument.update({ where: { id: docId }, data: { status, note: note?.trim() || null } });
    await audit({ actor: actorOf(admin), action: `seller.document.${status}`, targetType: "seller", targetId: doc.sellerId, summary: `${doc.type} ${status}` });
    revalidatePath(`/admin/sellers/${doc.sellerId}`);
    return okState(undefined, `Document ${status}.`);
  });
}

const SettingsSchema = z.object({
  id: zId,
  displayName: zTrimmed(80).min(3),
  commissionBps: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(10_000).optional()),
  canList: zBool.optional(),
  requiresListingReview: zBool.optional(),
  maxActiveListings: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(100_000).optional()),
  payoutSchedule: z.enum(["", "manual", "weekly", "biweekly", "monthly"]).optional(),
  minPayout: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(0).optional()),
  handlingDays: z.coerce.number().int().min(1).max(14),
  statusReason: zOptionalTrimmed(500),
});

export async function updateSellerSettingsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("sellers.manage", async (admin) => {
    const parsed = SettingsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    const before = await db.sellerProfile.findUnique({ where: { id: d.id }, select: { displayName: true, commissionBps: true, canList: true, requiresListingReview: true, maxActiveListings: true, payoutSchedule: true, minPayout: true, handlingDays: true } });
    if (!before) return failState("Seller not found.");
    await db.sellerProfile.update({
      where: { id: d.id },
      data: {
        displayName: d.displayName,
        commissionBps: d.commissionBps ?? null,
        canList: d.canList ?? false,
        requiresListingReview: d.requiresListingReview ?? false,
        maxActiveListings: d.maxActiveListings ?? null,
        payoutSchedule: d.payoutSchedule ? d.payoutSchedule : null,
        minPayout: d.minPayout ?? null,
        handlingDays: d.handlingDays,
        statusReason: d.statusReason ?? null,
      },
    });
    await audit({ actor: actorOf(admin), action: "seller.settings", targetType: "seller", targetId: d.id, summary: `Seller settings updated for ${d.displayName}`, before, after: d });
    revalidatePath(`/admin/sellers/${d.id}`);
    return okState(undefined, "Seller settings saved.");
  });
}

export async function createPayoutNowAction(sellerId: string, note?: string): Promise<ActionState> {
  return runAdmin("payouts.manage", async (admin) => {
    const seller = await db.sellerProfile.findUnique({ where: { id: sellerId }, select: { displayName: true, verificationStatus: true, payoutMethod: true } });
    if (!seller) return failState("Seller not found.");
    const settings = await getSettings();
    if (settings["sellers.requireVerification"] && seller.verificationStatus !== "verified") return failState("Seller must be verified before a payout can be created.");
    const payout = await createPayoutForSeller(sellerId, { createdById: admin.id, note: note ?? "Manual payout from admin", status: "pending" });
    if (!payout) return failState("No cleared balance to pay out.");
    await audit({ actor: actorOf(admin), action: "payout.create", targetType: "payout", targetId: payout.id, summary: `Payout created for ${seller.displayName}` });
    revalidatePath(`/admin/sellers/${sellerId}`);
    revalidatePath("/admin/finance/payouts");
    return okState(undefined, "Payout created — mark it paid once the transfer is sent.");
  });
}

export async function bulkSellersAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("sellers.manage", async () => {
    let done = 0;
    for (const id of ids.slice(0, 100)) {
      const res = actionId === "approve" ? await reviewSellerAction(id, "approve") : actionId === "reject" ? await reviewSellerAction(id, "reject", "Bulk rejection") : actionId === "suspend" ? await reviewSellerAction(id, "suspend", "Bulk suspension") : null;
      if (res?.ok) done += 1;
    }
    revalidatePath("/admin/sellers");
    return okState(undefined, `${done} seller${done === 1 ? "" : "s"} updated.`);
  });
}
