"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { COUPON_SCOPES, COUPON_TYPES } from "@/lib/domain";
import { failState, fieldErrors, formToObject, okState, slugify, zBool, zDateOptional, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const optInt = z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : v), z.coerce.number().int().min(0).optional());
const optMoney = z.preprocess((v) => (v === "" || v === undefined || v === null ? undefined : v), z.coerce.number().min(0).optional());

const CouponSchema = z.object({
  id: zOptionalTrimmed(64),
  code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/, "Letters, numbers, - and _ only"),
  name: zOptionalTrimmed(120),
  type: z.enum(COUPON_TYPES),
  value: z.coerce.number().min(0),
  minSubtotal: optMoney,
  maxDiscount: optMoney,
  maxUses: optInt,
  perUserLimit: optInt,
  startsAt: zDateOptional,
  endsAt: zDateOptional,
  isActive: zBool.optional(),
  sellerId: zOptionalTrimmed(64),
  scope: z.enum(COUPON_SCOPES),
  scopeIds: zOptionalTrimmed(4000),
  eligibility: z.enum(["all", "new_customers"]),
});

/** Turns a comma list of ids / SKUs / slugs into ids for the coupon scope. */
async function resolveScopeIds(scope: string, raw: string | undefined): Promise<{ ids: string[]; unknown: string[] }> {
  const tokens = (raw ?? "").split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
  if (scope === "order" || tokens.length === 0) return { ids: [], unknown: [] };
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const t of tokens) {
    let id: string | null = null;
    if (scope === "product") id = (await db.product.findFirst({ where: { OR: [{ id: t }, { sku: t }, { slug: t }] }, select: { id: true } }))?.id ?? null;
    else if (scope === "category") id = (await db.category.findFirst({ where: { OR: [{ id: t }, { slug: t }] }, select: { id: true } }))?.id ?? null;
    else if (scope === "seller") id = (await db.sellerProfile.findFirst({ where: { OR: [{ id: t }, { slug: t }] }, select: { id: true } }))?.id ?? null;
    if (id) ids.push(id);
    else unknown.push(t);
  }
  return { ids: [...new Set(ids)], unknown };
}

export async function saveCouponAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const parsed = CouponSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.type === "percent" && d.value > 100) return failState("Percent can't exceed 100.", { value: "Max 100" });
    if (d.endsAt && d.startsAt && d.endsAt < d.startsAt) return failState("End date is before start date.", { endsAt: "Before start" });
    const { ids, unknown } = await resolveScopeIds(d.scope, d.scopeIds);
    if (unknown.length > 0) return failState(`Unknown ${d.scope}s: ${unknown.join(", ")}`, { scopeIds: "Fix the list" });
    if (d.scope !== "order" && ids.length === 0) return failState(`List at least one ${d.scope}.`, { scopeIds: "Required" });
    if (d.sellerId) {
      const seller = await db.sellerProfile.findFirst({ where: { OR: [{ id: d.sellerId }, { slug: d.sellerId }] }, select: { id: true } });
      if (!seller) return failState("Unknown seller.", { sellerId: "Not found" });
      d.sellerId = seller.id;
    }
    const clash = await db.coupon.findFirst({ where: { code: d.code, ...(d.id ? { NOT: { id: d.id } } : {}) }, select: { id: true } });
    if (clash) return failState("That code already exists.", { code: "In use" });
    const value = d.type === "percent" ? Math.round(d.value * 100) : d.type === "fixed" ? Math.round(d.value * 100) : 0;
    const data = {
      code: d.code,
      name: d.name ?? null,
      type: d.type,
      value,
      minSubtotal: d.minSubtotal !== undefined ? Math.round(d.minSubtotal * 100) : null,
      maxDiscount: d.maxDiscount !== undefined ? Math.round(d.maxDiscount * 100) : null,
      maxUses: d.maxUses ?? null,
      perUserLimit: d.perUserLimit ?? null,
      startsAt: d.startsAt ?? null,
      endsAt: d.endsAt ?? null,
      isActive: d.isActive ?? true,
      sellerId: d.sellerId || null,
      scope: d.scope,
      scopeIdsJson: JSON.stringify(ids),
      eligibility: d.eligibility,
    };
    const coupon = d.id ? await db.coupon.update({ where: { id: d.id }, data }) : await db.coupon.create({ data: { ...data, createdById: admin.id } });
    await audit({ actor: actorOf(admin), action: d.id ? "coupon.update" : "coupon.create", targetType: "coupon", targetId: coupon.id, summary: `Coupon ${d.code} (${d.type} ${d.value})`, after: data });
    revalidatePath("/admin/promotions");
    return okState(undefined, `Coupon ${d.code} saved.`);
  });
}

export async function toggleCouponAction(id: string, isActive: boolean): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const c = await db.coupon.update({ where: { id }, data: { isActive } });
    await audit({ actor: actorOf(admin), action: isActive ? "coupon.enable" : "coupon.disable", targetType: "coupon", targetId: id, summary: `Coupon ${c.code} ${isActive ? "enabled" : "disabled"}` });
    revalidatePath("/admin/promotions");
    return okState(undefined, `Coupon ${isActive ? "enabled" : "disabled"}.`);
  });
}

export async function deleteCouponAction(id: string): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const c = await db.coupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!c) return failState("Coupon not found.");
    if (c._count.redemptions > 0) return failState("This code has been redeemed — disable it instead so order history stays intact.");
    await db.coupon.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "coupon.delete", targetType: "coupon", targetId: id, summary: `Coupon ${c.code} deleted` });
    revalidatePath("/admin/promotions");
    return okState(undefined, "Coupon deleted.");
  });
}

const CampaignSchema = z.object({
  id: zOptionalTrimmed(64),
  name: zTrimmed(120).min(2),
  slug: zOptionalTrimmed(120),
  type: z.enum(["banner", "hero", "promo"]),
  title: zTrimmed(200).min(2),
  body: zOptionalTrimmed(2000),
  ctaLabel: zOptionalTrimmed(60),
  ctaHref: zOptionalTrimmed(300),
  placement: z.enum(["global_bar", "home", "store"]),
  startsAt: zDateOptional,
  endsAt: zDateOptional,
  isActive: zBool.optional(),
});

export async function saveCampaignAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const parsed = CampaignSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.ctaHref && !/^(\/|https?:\/\/)/.test(d.ctaHref)) return failState("Link must start with / or https://", { ctaHref: "Invalid" });
    const slug = slugify(d.slug || d.name);
    const clash = await db.campaign.findFirst({ where: { slug, ...(d.id ? { NOT: { id: d.id } } : {}) }, select: { id: true } });
    if (clash) return failState("Slug already used.", { slug: "In use" });
    const data = { name: d.name, slug, type: d.type, title: d.title, body: d.body ?? null, ctaLabel: d.ctaLabel ?? null, ctaHref: d.ctaHref ?? null, placement: d.placement, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, isActive: d.isActive ?? true };
    const c = d.id ? await db.campaign.update({ where: { id: d.id }, data }) : await db.campaign.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "campaign.update" : "campaign.create", targetType: "campaign", targetId: c.id, summary: `Campaign ${d.name} (${d.placement})` });
    revalidatePath("/admin/promotions/campaigns");
    revalidatePath("/", "layout");
    return okState(undefined, "Campaign saved.");
  });
}

export async function deleteCampaignAction(id: string): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    await db.campaign.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "campaign.delete", targetType: "campaign", targetId: id, summary: "Campaign deleted" });
    revalidatePath("/admin/promotions/campaigns");
    revalidatePath("/", "layout");
    return okState(undefined, "Campaign deleted.");
  });
}

const FeatureSchema = z.object({ product: zTrimmed(120).min(1), until: zDateOptional });

export async function featureProductAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const parsed = FeatureSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Enter a product.", fieldErrors(parsed.error));
    const p = await db.product.findFirst({ where: { OR: [{ id: parsed.data.product }, { sku: parsed.data.product }, { slug: parsed.data.product }], deletedAt: null }, select: { id: true, title: true, status: true } });
    if (!p) return failState("No product with that id, SKU or slug.", { product: "Not found" });
    if (p.status !== "published") return failState("Only published listings can be featured.");
    await db.product.update({ where: { id: p.id }, data: { featured: true, featuredUntil: parsed.data.until ?? null } });
    await audit({ actor: actorOf(admin), action: "product.feature", targetType: "product", targetId: p.id, summary: `Featured ${p.title}${parsed.data.until ? ` until ${parsed.data.until.toISOString().slice(0, 10)}` : ""}` });
    revalidatePath("/admin/promotions/featured");
    revalidatePath("/");
    return okState(undefined, `${p.title} is now featured.`);
  });
}

export async function unfeatureProductAction(id: string): Promise<ActionState> {
  return runAdmin("promotions.manage", async (admin) => {
    const p = await db.product.update({ where: { id }, data: { featured: false, featuredUntil: null }, select: { title: true } });
    await audit({ actor: actorOf(admin), action: "product.unfeature", targetType: "product", targetId: id, summary: `Unfeatured ${p.title}` });
    revalidatePath("/admin/promotions/featured");
    revalidatePath("/");
    return okState(undefined, "Removed from featured.");
  });
}
