"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertUser, AuthError } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { saveUpload, UploadError } from "@/lib/media";
import { queueTemplateEmail } from "@/lib/mail";
import { notifyAdmins } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { PAYOUT_METHODS } from "@/lib/domain";
import { bpsToPercent } from "@/lib/money";
import { failState, fieldErrors, formToObject, okState, slugify, zCountry, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const ApplySchema = z.object({
  displayName: zTrimmed(80).min(3, { error: "Choose a store name of at least 3 characters" }),
  businessType: z.enum(["individual", "company"]),
  businessName: zOptionalTrimmed(160),
  countryCode: zCountry,
  taxId: zOptionalTrimmed(64),
  bio: zOptionalTrimmed(1500),
  applicationNote: zOptionalTrimmed(2000),
  shippingPolicy: zOptionalTrimmed(2000),
  returnPolicy: zOptionalTrimmed(2000),
  terms: z.string().optional(),
});

/** Buyer applies to become a seller. Creates a pending profile (or approves it when auto-approval is on). */
export async function applySellerAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    if (user.impersonator) return failState("Not available during a support session.");
    if (user.restrictions.includes("no_sell")) return failState("Selling is restricted on this account.");
    const settings = await getSettings();
    if (!settings["sellers.enabled"]) return failState("Seller applications are closed at the moment.");
    const parsed = ApplySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    if (parsed.data.terms !== "on") return failState("Please accept the seller terms.", { terms: "Required" });
    const existing = await db.sellerProfile.findUnique({ where: { userId: user.id } });
    if (existing && existing.status !== "rejected") return failState("You already have a seller profile.");
    const country = await db.country.findUnique({ where: { code: parsed.data.countryCode } });
    if (!country || !country.isEnabled || !country.sellersAllowed) return failState("We don't accept sellers from that country yet.", { countryCode: "Not available" });

    let slug = slugify(parsed.data.displayName);
    for (let i = 0; i < 5; i++) {
      const taken = await db.sellerProfile.findFirst({ where: { slug, NOT: { userId: user.id } }, select: { id: true } });
      if (!taken) break;
      slug = `${slugify(parsed.data.displayName)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const autoApprove = settings["sellers.autoApprove"];
    const data = {
      slug,
      displayName: parsed.data.displayName,
      businessType: parsed.data.businessType,
      businessName: parsed.data.businessName ?? null,
      countryCode: parsed.data.countryCode,
      shipsFromCountry: parsed.data.countryCode,
      taxIdEnc: parsed.data.taxId ? encrypt(parsed.data.taxId) : null,
      taxIdLast4: parsed.data.taxId ? parsed.data.taxId.slice(-4) : null,
      bio: parsed.data.bio ?? null,
      applicationNote: parsed.data.applicationNote ?? null,
      shippingPolicy: parsed.data.shippingPolicy ?? null,
      returnPolicy: parsed.data.returnPolicy ?? null,
      status: autoApprove ? "approved" : "pending",
      approvedAt: autoApprove ? new Date() : null,
      verificationStatus: "unverified",
      requiresListingReview: settings["listings.requireReview"],
    };
    const profile = existing
      ? await db.sellerProfile.update({ where: { id: existing.id }, data: { ...data, statusReason: null } })
      : await db.sellerProfile.create({ data: { ...data, userId: user.id } });

    const docs: { type: string; file: File }[] = [];
    for (const type of ["id_front", "id_back", "business_registration"]) {
      const f = formData.get(`doc_${type}`);
      if (f instanceof File && f.size > 0) docs.push({ type, file: f });
    }
    for (const d of docs) {
      const saved = await saveUpload(d.file, { purpose: "seller_document", ownerId: user.id, visibility: "private" });
      await db.sellerDocument.create({ data: { sellerId: profile.id, mediaId: saved.id, type: d.type } });
    }
    if (docs.length > 0) await db.sellerProfile.update({ where: { id: profile.id }, data: { verificationStatus: "pending" } });
    await db.user.update({ where: { id: user.id }, data: { isSeller: true } });

    await audit({ actor: { id: user.id, email: user.email, type: "user" }, action: "seller.apply", targetType: "seller", targetId: profile.id, summary: `${user.email} applied to sell as "${parsed.data.displayName}"` });
    if (autoApprove) {
      await queueTemplateEmail("seller_approved", user.email, { name: user.name, commission: bpsToPercent(settings["commerce.commissionBps"]) }, { userId: user.id });
    } else {
      await queueTemplateEmail("seller_application_received", user.email, { name: user.name }, { userId: user.id });
      if (settings["notifications.adminNewSeller"]) await notifyAdmins("sellers.manage", { type: "seller.applied", title: `New seller application: ${parsed.data.displayName}`, body: user.email, href: `/admin/sellers/${profile.id}` });
    }
    revalidatePath("/account/seller");
    revalidatePath("/dashboard", "layout");
    return okState(undefined, autoApprove ? "You're approved — head to your seller dashboard." : "Application received. We review within two business days.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

const ProfileSchema = z.object({
  displayName: zTrimmed(80).min(3),
  bio: zOptionalTrimmed(1500),
  shippingPolicy: zOptionalTrimmed(2000),
  returnPolicy: zOptionalTrimmed(2000),
  handlingDays: z.coerce.number().int().min(1).max(14),
  shipsFromCountry: zCountry,
  shipsTo: z.preprocess((v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(zCountry).max(250)).optional(),
  customsNote: zOptionalTrimmed(500),
});

export async function updateSellerProfileAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    if (!user.seller) throw new AuthError("Seller account required", 403);
    const parsed = ProfileSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const logo = formData.get("logo");
    let logoMediaId: string | undefined;
    if (logo instanceof File && logo.size > 0) logoMediaId = (await saveUpload(logo, { purpose: "avatar", ownerId: user.id, visibility: "public" })).id;
    const { shipsTo, customsNote, ...rest } = parsed.data;
    const shipsToClean = [...new Set((shipsTo ?? []).map((c) => c.toUpperCase()))].filter((c) => c !== "ALL");
    await db.sellerProfile.update({
      where: { id: user.seller.id },
      data: { ...rest, bio: rest.bio ?? null, shippingPolicy: rest.shippingPolicy ?? null, returnPolicy: rest.returnPolicy ?? null, shipsToJson: JSON.stringify(shipsToClean), customsNote: customsNote ?? null, ...(logoMediaId ? { logoMediaId } : {}) },
    });
    revalidatePath("/dashboard/settings");
    revalidatePath(`/sellers/${user.seller.slug}`);
    return okState(undefined, "Store profile saved.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

/** Sellers upload verification documents; each upload resets verification to "pending" for review. */
export async function uploadSellerDocumentAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    if (!user.seller) throw new AuthError("Seller account required", 403);
    if (user.impersonator) return failState("Not available during a support session.");
    const type = String(formData.get("type") ?? "other");
    if (!["id_front", "id_back", "business_registration", "proof_of_address", "other"].includes(type)) return failState("Unknown document type.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return failState("Choose a file to upload.", { file: "Required" });
    const count = await db.sellerDocument.count({ where: { sellerId: user.seller.id } });
    if (count >= 12) return failState("Document limit reached. Contact support to replace documents.");
    const saved = await saveUpload(file, { purpose: "seller_document", ownerId: user.id, visibility: "private" });
    await db.sellerDocument.create({ data: { sellerId: user.seller.id, mediaId: saved.id, type } });
    await db.sellerProfile.update({ where: { id: user.seller.id }, data: { verificationStatus: "pending", verificationNote: null } });
    await notifyAdmins("sellers.manage", { type: "seller.documents", title: `Verification documents uploaded: ${user.seller.displayName}`, href: `/admin/sellers/${user.seller.id}` });
    revalidatePath("/dashboard/settings");
    return okState(undefined, "Document uploaded. Verification usually takes one business day.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

const PayoutSchema = z.object({
  payoutMethod: z.enum(PAYOUT_METHODS),
  accountName: zOptionalTrimmed(120),
  accountNumber: zOptionalTrimmed(64),
  routingNumber: zOptionalTrimmed(64),
  bankName: zOptionalTrimmed(120),
  paypalEmail: zOptionalTrimmed(200),
  minPayout: z.coerce.number().int().min(0).max(100_000_000).optional(),
  payoutSchedule: z.enum(["manual", "weekly", "biweekly", "monthly", ""]).optional(),
});

/** Payout destination is encrypted at rest; only a masked hint is ever shown again. */
export async function updatePayoutMethodAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    if (!user.seller) throw new AuthError("Seller account required", 403);
    if (user.impersonator) return failState("Payout settings can't be changed during a support session.");
    const parsed = PayoutSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    let details: Record<string, string> = {};
    let masked = "";
    if (d.payoutMethod === "bank") {
      if (!d.accountNumber || !d.accountName) return failState("Account name and number are required for bank payouts.", { accountNumber: "Required" });
      details = { accountName: d.accountName, accountNumber: d.accountNumber, routingNumber: d.routingNumber ?? "", bankName: d.bankName ?? "" };
      masked = `${d.bankName ? `${d.bankName} ` : "Bank "}••••${d.accountNumber.slice(-4)}`;
    } else if (d.payoutMethod === "paypal") {
      if (!d.paypalEmail) return failState("Enter your PayPal email.", { paypalEmail: "Required" });
      details = { paypalEmail: d.paypalEmail };
      const [local, domain] = d.paypalEmail.split("@");
      masked = `PayPal ${local.slice(0, 2)}•••@${domain ?? ""}`;
    } else {
      masked = d.payoutMethod === "stripe_connect" ? "Stripe Connect" : "Manual (arranged with finance)";
    }
    await db.sellerProfile.update({
      where: { id: user.seller.id },
      data: {
        payoutMethod: d.payoutMethod,
        payoutDetailsEnc: Object.keys(details).length ? encrypt(JSON.stringify(details)) : null,
        payoutDetailsMasked: masked,
        minPayout: d.minPayout ?? null,
        payoutSchedule: d.payoutSchedule ? d.payoutSchedule : null,
      },
    });
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "seller.payout_method", targetType: "seller", targetId: user.seller.id, summary: `${user.email} updated payout method (${masked})` });
    revalidatePath("/dashboard/balance");
    revalidatePath("/dashboard/settings");
    return okState(undefined, "Payout method saved.");
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}
