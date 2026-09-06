"use server";
import { pingIndexNow, pingListing } from "@/lib/indexnow";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { csvRecords } from "@/lib/admin/csv";
import { listingRefErrors } from "@/lib/catalog/listing-refs";
import { ListingSchema, listingData } from "@/lib/catalog/listing-schema";
import { ERAS, GRADERS } from "@/lib/domain";
import { deleteMedia, saveUpload } from "@/lib/media";
import { notifyUser } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, slugify, zBool, zDateOptional, zOptionalTrimmed, type ActionState } from "@/lib/validation";

const AdminSchema = ListingSchema.extend({
  id: zOptionalTrimmed(64),
  sellerId: zOptionalTrimmed(64),
  brandId: zOptionalTrimmed(64),
  status: z.enum(["draft", "pending", "published", "hidden", "suspended", "archived"]).optional(),
  featured: zBool.optional(),
  bestseller: zBool.optional(),
  featuredUntil: zDateOptional,
  moderationNote: zOptionalTrimmed(500),
});

function extras(d: z.infer<typeof AdminSchema>) {
  return {
    brandId: d.brandId || null,
    featured: d.featured ?? false,
    bestseller: d.bestseller ?? false,
    featuredUntil: d.featuredUntil ?? null,
    moderationNote: d.moderationNote ?? null,
  };
}

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base);
  for (let i = 0; i < 6; i++) {
    const taken = await db.product.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Could not allocate a slug");
}

async function uniqueSku(prefix = "RCC") {
  for (let i = 0; i < 10; i++) {
    const sku = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!(await db.product.findUnique({ where: { sku }, select: { id: true } }))) return sku;
  }
  throw new Error("Could not allocate a SKU");
}

async function saveImages(formData: FormData, productId: string, adminId: string, start: number) {
  const settings = await getSettings();
  let position = start;
  for (const f of formData.getAll("images")) {
    if (!(f instanceof File) || f.size === 0 || position >= settings["listings.maxImages"]) continue;
    const saved = await saveUpload(f, { purpose: "product_image", ownerId: adminId, visibility: "public" });
    await db.productImage.create({ data: { productId, url: saved.url, mediaId: saved.id, position: position++ } });
  }
  const url = String(formData.get("imageUrl") ?? "").trim();
  if (url && /^(https?:\/\/|\/)/.test(url)) await db.productImage.create({ data: { productId, url, position: position++ } });
}

export async function createProductAdminAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAdmin("products.manage", async (admin) => {
    const parsed = AdminSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    const refErrors = await listingRefErrors({ categoryId: d.categoryId, brandId: d.brandId, sellerId: d.sellerId });
    if (Object.keys(refErrors).length > 0) return failState("Check the highlighted fields.", refErrors);
    const status = d.status ?? (d.intent === "publish" ? "published" : "draft");
    const product = await db.product.create({
      data: { ...listingData(d), ...extras(d), slug: await uniqueSlug(`${d.title} ${d.issue} ${d.grader} ${d.grade}`), sku: await uniqueSku(), sellerId: d.sellerId || null, status, publishedAt: status === "published" ? new Date() : null },
    });
    await saveImages(formData, product.id, admin.id, 0);
    await audit({ actor: actorOf(admin), action: "product.create", targetType: "product", targetId: product.id, summary: `Created listing ${d.title} ${d.issue} (${status})` });
    revalidatePath("/store");
    if (status === "published") await pingListing(product.slug);
    id = product.id;
    return okState(undefined, "Listing created.");
  });
  if (result.ok && id) redirect(`/admin/products/${id}?created=1`);
  return result;
}

export async function updateProductAdminAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const parsed = AdminSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (!d.id) return failState("Missing id.");
    const refErrors = await listingRefErrors({ categoryId: d.categoryId, brandId: d.brandId, sellerId: d.sellerId });
    if (Object.keys(refErrors).length > 0) return failState("Check the highlighted fields.", refErrors);
    const product = await db.product.findUnique({ where: { id: d.id }, include: { images: true } });
    if (!product) return failState("Listing not found.");
    for (const imgId of formData.getAll("removeImage").map(String)) {
      const img = product.images.find((i) => i.id === imgId);
      if (!img) continue;
      await db.productImage.delete({ where: { id: img.id } });
      if (img.mediaId) await deleteMedia(img.mediaId);
    }
    await saveImages(formData, product.id, admin.id, product.images.length);
    const status = d.status ?? product.status;
    if (product.stock !== d.stock) await db.inventoryAdjustment.create({ data: { productId: product.id, delta: d.stock - product.stock, reason: "correction", actorId: admin.id, note: "Admin edit" } });
    await db.product.update({ where: { id: product.id }, data: { ...listingData(d), ...extras(d), sellerId: d.sellerId || null, status, publishedAt: status === "published" && !product.publishedAt ? new Date() : product.publishedAt } });
    await audit({ actor: actorOf(admin), action: "product.update", targetType: "product", targetId: product.id, summary: `Edited ${d.title} ${d.issue}`, before: { price: product.price, stock: product.stock, status: product.status, sellerId: product.sellerId }, after: { price: d.price, stock: d.stock, status, sellerId: d.sellerId || null } });
    revalidatePath(`/store/${product.slug}`);
    revalidatePath("/store");
    revalidatePath(`/admin/products/${product.id}`);
    if (status === "published" || product.status === "published") await pingListing(product.slug);
    return okState(undefined, "Listing saved.");
  });
}

type Decision = "approve" | "reject" | "suspend" | "reinstate" | "hide" | "publish" | "archive";

export async function moderateListingAction(id: string, decision: Decision, note?: string): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const product = await db.product.findUnique({ where: { id }, include: { seller: { select: { userId: true, displayName: true } } } });
    if (!product) return failState("Listing not found.");
    if ((decision === "reject" || decision === "suspend") && !note?.trim()) return failState("Give the seller a reason.");
    const map: Record<Decision, string> = { approve: "published", reject: "draft", suspend: "suspended", reinstate: "published", hide: "hidden", publish: "published", archive: "archived" };
    const status = map[decision];
    await db.product.update({ where: { id }, data: { status, moderationNote: note?.trim() || (decision === "approve" || decision === "reinstate" ? null : product.moderationNote), publishedAt: status === "published" && !product.publishedAt ? new Date() : product.publishedAt } });
    await audit({ actor: actorOf(admin), action: `product.${decision}`, targetType: "product", targetId: id, summary: `${product.title} ${product.issue}: ${product.status} → ${status}${note ? ` (${note})` : ""}` });
    if (product.seller) {
      const titles: Record<Decision, string> = { approve: "Listing approved", reject: "Listing needs changes", suspend: "Listing suspended", reinstate: "Listing reinstated", hide: "Listing hidden by marketplace", publish: "Listing published", archive: "Listing archived" };
      await notifyUser(product.seller.userId, { type: `listing.${decision}`, title: `${titles[decision]}: ${product.title} ${product.issue}`, body: note, href: `/dashboard/listings/${id}`, category: "sellerAlerts" });
    }
    revalidatePath(`/store/${product.slug}`);
    revalidatePath("/store");
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    if (status === "published" || product.status === "published") await pingListing(product.slug);
    return okState(undefined, `Listing ${status}.`);
  });
}

export async function adjustStockAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const id = String(formData.get("id") ?? "");
    const delta = Number.parseInt(String(formData.get("delta") ?? "0"), 10);
    const note = String(formData.get("note") ?? "").trim();
    if (!id || !Number.isFinite(delta) || delta === 0) return failState("Enter a non-zero adjustment.");
    const product = await db.product.findUnique({ where: { id }, select: { stock: true, title: true, issue: true } });
    if (!product) return failState("Listing not found.");
    if (product.stock + delta < 0) return failState("Stock can't go negative.");
    await db.$transaction([
      db.product.update({ where: { id }, data: { stock: { increment: delta } } }),
      db.inventoryAdjustment.create({ data: { productId: id, delta, reason: delta > 0 ? "restock" : "correction", note: note || null, actorId: admin.id } }),
    ]);
    await audit({ actor: actorOf(admin), action: "product.stock", targetType: "product", targetId: id, summary: `${product.title} ${product.issue} stock ${delta > 0 ? "+" : ""}${delta}${note ? ` (${note})` : ""}` });
    revalidatePath(`/admin/products/${id}`);
    return okState(undefined, "Stock adjusted.");
  });
}

export async function deleteProductAction(id: string, reason?: string): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const product = await db.product.findUnique({ where: { id }, select: { title: true, issue: true, slug: true, _count: { select: { orderItems: true } } } });
    if (!product) return failState("Listing not found.");
    await db.product.update({ where: { id }, data: { status: "archived", deletedAt: product._count.orderItems > 0 ? null : new Date(), moderationNote: reason ?? null } });
    await audit({ actor: actorOf(admin), action: "product.delete", targetType: "product", targetId: id, summary: `${product.title} ${product.issue} ${product._count.orderItems > 0 ? "archived (has orders)" : "deleted"}` });
    revalidatePath("/store");
    revalidatePath("/admin/products");
    return okState(undefined, product._count.orderItems > 0 ? "Archived — it has order history so it is kept." : "Listing deleted.");
  });
}

export async function bulkProductsAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const target = ids.slice(0, 500);
    let summary = "";
    switch (actionId) {
      case "publish":
      case "approve":
        await db.product.updateMany({ where: { id: { in: target }, status: { in: ["draft", "pending", "hidden"] } }, data: { status: "published", moderationNote: null } });
        await db.product.updateMany({ where: { id: { in: target }, publishedAt: null, status: "published" }, data: { publishedAt: new Date() } });
        summary = `Published ${target.length} listings`;
        break;
      case "hide":
        await db.product.updateMany({ where: { id: { in: target } }, data: { status: "hidden" } });
        summary = `Hid ${target.length} listings`;
        break;
      case "feature":
        await db.product.updateMany({ where: { id: { in: target } }, data: { featured: true } });
        summary = `Featured ${target.length} listings`;
        break;
      case "unfeature":
        await db.product.updateMany({ where: { id: { in: target } }, data: { featured: false, featuredUntil: null } });
        summary = `Unfeatured ${target.length} listings`;
        break;
      case "archive":
        await db.product.updateMany({ where: { id: { in: target } }, data: { status: "archived" } });
        summary = `Archived ${target.length} listings`;
        break;
      default:
        return failState("Unknown action.");
    }
    await audit({ actor: actorOf(admin), action: `product.bulk.${actionId}`, targetType: "product", summary, after: { ids: target } });
    revalidatePath("/store");
    revalidatePath("/admin/products");
    return okState(undefined, summary);
  });
}

/** CSV import for house inventory: title,issue,publisher,year,era,grader,grade,label,cert_number,price,stock,key_issue,summary,description,image_url,sku */
export async function importProductsAction(_prev: ActionState<{ created: number; errors: string[] }> | undefined, formData: FormData): Promise<ActionState<{ created: number; errors: string[] }>> {
  return runAdmin("products.manage", async (admin) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return failState("Choose a CSV file.");
    if (file.size > 5 * 1024 * 1024) return failState("CSV must be under 5 MB.");
    const publish = formData.get("publish") === "on";
    const records = csvRecords(await file.text());
    if (records.length === 0) return failState("No rows found. The first line must be the header.");
    const errors: string[] = [];
    let created = 0;
    for (const [i, r] of records.entries()) {
      const line = i + 2;
      try {
        const era = ERAS.find((e) => e.toLowerCase() === (r.era ?? "").toLowerCase()) ?? "Modern Age";
        const grader = GRADERS.find((g) => g.toLowerCase() === (r.grader ?? "cgc").toLowerCase()) ?? "Raw";
        const price = Math.round(Number.parseFloat(r.price ?? "") * 100);
        const year = Number.parseInt(r.year ?? "", 10);
        if (!r.title || !r.issue || !Number.isFinite(price) || price <= 0 || !Number.isFinite(year)) {
          errors.push(`Line ${line}: title, issue, numeric year and price are required`);
          continue;
        }
        const sku = r.sku || (await uniqueSku("IMP"));
        if (await db.product.findUnique({ where: { sku }, select: { id: true } })) {
          errors.push(`Line ${line}: SKU ${sku} already exists`);
          continue;
        }
        const issue = r.issue.startsWith("#") ? r.issue : `#${r.issue}`;
        const product = await db.product.create({
          data: {
            slug: await uniqueSlug(`${r.title} ${issue} ${grader} ${r.grade || ""}`),
            sku,
            title: r.title,
            issue,
            publisher: r.publisher || "Unknown",
            year,
            era,
            grader,
            grade: r.grade || (grader === "Raw" ? "N/A" : "8.0"),
            label: r.label || (grader === "Raw" ? "Ungraded" : "Universal Blue"),
            certNumber: r.cert_number || null,
            price,
            stock: Number.parseInt(r.stock || "1", 10) || 1,
            keyIssue: r.key_issue || null,
            summary: r.summary || `${r.title} ${issue} (${year}).`,
            description: r.description || r.summary || `${r.title} ${issue} (${year}).`,
            status: publish ? "published" : "draft",
            publishedAt: publish ? new Date() : null,
            ...(r.image_url ? { images: { create: { url: r.image_url, position: 0 } } } : {}),
          },
        });
        created += 1;
        void product;
      } catch (err) {
        errors.push(`Line ${line}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    await audit({ actor: actorOf(admin), action: "product.import", targetType: "product", summary: `CSV import: ${created} created, ${errors.length} errors` });
    revalidatePath("/store");
    revalidatePath("/admin/products");
    if (publish && created > 0) await pingIndexNow(["/store", "/collections", "/publishers"]);
    return okState({ created, errors }, `${created} listing${created === 1 ? "" : "s"} imported${errors.length ? `, ${errors.length} row${errors.length === 1 ? "" : "s"} skipped` : ""}.`);
  });
}
