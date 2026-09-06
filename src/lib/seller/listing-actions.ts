"use server";
import { pingListing } from "@/lib/indexnow";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertSeller, AuthError } from "@/lib/auth/session";
import { deleteMedia, saveUpload, UploadError } from "@/lib/media";
import { notifyAdmins } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { listingRefErrors } from "@/lib/catalog/listing-refs";
import { ListingSchema, listingData } from "@/lib/catalog/listing-schema";
import { failState, fieldErrors, formToObject, okState, slugify, type ActionState } from "@/lib/validation";

async function uniqueSlug(base: string, excludeId?: string) {
  let slug = slugify(base);
  for (let i = 0; i < 6; i++) {
    const taken = await db.product.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return slug;
    slug = `${slugify(base)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  throw new Error("Could not allocate a listing slug");
}

async function uniqueSku(sellerSlug: string) {
  for (let i = 0; i < 10; i++) {
    const sku = `${sellerSlug.slice(0, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const taken = await db.product.findUnique({ where: { sku }, select: { id: true } });
    if (!taken) return sku;
  }
  throw new Error("Could not allocate a SKU");
}

async function handleImages(formData: FormData, productId: string, ownerId: string, existingCount: number, max: number) {
  let position = existingCount;
  for (const f of formData.getAll("images")) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (position >= max) break;
    const saved = await saveUpload(f, { purpose: "product_image", ownerId, visibility: "public" });
    await db.productImage.create({ data: { productId, url: saved.url, mediaId: saved.id, position: position++ } });
  }
}

export async function createListingAction(_prev: ActionState<{ id: string }> | undefined, formData: FormData): Promise<ActionState<{ id: string }>> {
  let createdId: string | null = null;
  let intent: "draft" | "publish" = "draft";
  try {
    const user = await assertSeller();
    const seller = await db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id } });
    if (!seller.canList) return failState("Listing is currently disabled on your account. Contact support.");
    const settings = await getSettings();
    const parsed = ListingSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    intent = d.intent;
    const refErrors = await listingRefErrors({ categoryId: d.categoryId });
    if (Object.keys(refErrors).length > 0) return failState("Check the highlighted fields.", refErrors);
    if (d.price < settings["listings.minPrice"] || d.price > settings["listings.maxPrice"]) return failState("Price is outside the allowed range.", { price: "Out of range" });
    const active = await db.product.count({ where: { sellerId: seller.id, status: { in: ["published", "pending"] }, deletedAt: null } });
    const limit = seller.maxActiveListings ?? settings["sellers.maxActiveListings"];
    if (d.intent === "publish" && active >= limit) return failState(`You've reached the limit of ${limit} active listings.`);
    const images = formData.getAll("images").filter((f) => f instanceof File && f.size > 0);
    if (settings["listings.requireImage"] && d.intent === "publish" && images.length === 0) return failState("Add at least one photo before publishing.", { images: "Required" });

    const slug = await uniqueSlug(`${d.title} ${d.issue} ${d.grader} ${d.grade}`);
    const sku = await uniqueSku(seller.slug);
    const needsReview = seller.requiresListingReview || settings["listings.requireReview"];
    const status = d.intent === "draft" ? "draft" : needsReview ? "pending" : "published";
    const product = await db.product.create({
      data: { ...listingData(d), slug, sku, sellerId: seller.id, status, publishedAt: status === "published" ? new Date() : null },
    });
    createdId = product.id;
    await handleImages(formData, product.id, user.id, 0, settings["listings.maxImages"]);
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "listing.create", targetType: "product", targetId: product.id, summary: `${seller.displayName} created listing ${d.title} ${d.issue} (${status})` });
    if (status === "pending") await notifyAdmins("products.manage", { type: "listing.pending", title: `Listing awaiting review: ${d.title} ${d.issue}`, body: seller.displayName, href: `/admin/products/${product.id}` });
    revalidatePath("/dashboard/listings");
    revalidatePath("/store");
    if (status === "published") await pingListing(slug);
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
  redirect(`/dashboard/listings/${createdId}?created=${intent}`);
}

export async function updateListingAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const id = String(formData.get("id") ?? "");
    const product = await db.product.findFirst({ where: { id, sellerId: user.seller.id, deletedAt: null }, include: { images: true } });
    if (!product) throw new AuthError("Listing not found", 403);
    const settings = await getSettings();
    const parsed = ListingSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.price < settings["listings.minPrice"] || d.price > settings["listings.maxPrice"]) return failState("Price is outside the allowed range.", { price: "Out of range" });
    const refErrors = await listingRefErrors({ categoryId: d.categoryId });
    if (Object.keys(refErrors).length > 0) return failState("Check the highlighted fields.", refErrors);

    const removeIds = formData.getAll("removeImage").map(String);
    for (const imgId of removeIds) {
      const img = product.images.find((i) => i.id === imgId);
      if (!img) continue;
      await db.productImage.delete({ where: { id: img.id } });
      if (img.mediaId) await deleteMedia(img.mediaId);
    }
    const remaining = product.images.length - removeIds.length;
    await handleImages(formData, product.id, user.id, remaining, settings["listings.maxImages"]);

    const seller = await db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id } });
    const needsReview = seller.requiresListingReview || settings["listings.requireReview"];
    let status = product.status;
    if (d.intent === "publish" && ["draft", "hidden"].includes(product.status)) status = needsReview ? "pending" : "published";
    if (product.status === "suspended") status = "suspended";
    const data = listingData(d);
    if (product.stock !== d.stock) {
      await db.inventoryAdjustment.create({ data: { productId: product.id, delta: d.stock - product.stock, reason: "correction", actorId: user.id, note: "Seller edit" } });
    }
    await db.product.update({ where: { id: product.id }, data: { ...data, status, publishedAt: status === "published" && !product.publishedAt ? new Date() : product.publishedAt } });
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "listing.update", targetType: "product", targetId: product.id, summary: `${seller.displayName} edited ${d.title} ${d.issue}`, before: { price: product.price, stock: product.stock, status: product.status }, after: { price: d.price, stock: d.stock, status } });
    if (status === "pending" && product.status !== "pending") await notifyAdmins("products.manage", { type: "listing.pending", title: `Listing awaiting review: ${d.title} ${d.issue}`, body: seller.displayName, href: `/admin/products/${product.id}` });
    revalidatePath("/dashboard/listings");
    revalidatePath(`/dashboard/listings/${product.id}`);
    revalidatePath(`/store/${product.slug}`);
    revalidatePath("/store");
    if (status === "published" || product.status === "published") await pingListing(product.slug);
    return okState(undefined, status === "pending" ? "Saved — the listing is queued for review." : "Listing saved.");
  } catch (err) {
    if (err instanceof AuthError || err instanceof UploadError) return failState(err.message);
    throw err;
  }
}

export async function setListingStatusAction(id: string, next: "hidden" | "published" | "archived"): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const product = await db.product.findFirst({ where: { id, sellerId: user.seller.id, deletedAt: null } });
    if (!product) throw new AuthError("Listing not found", 403);
    if (product.status === "suspended") return failState("This listing was suspended by the marketplace. Contact support.");
    const settings = await getSettings();
    const seller = await db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id } });
    let status: string = next;
    if (next === "published") {
      if (settings["listings.requireImage"]) {
        const images = await db.productImage.count({ where: { productId: id } });
        if (images === 0) return failState("Add a photo before publishing.");
      }
      if (product.status !== "hidden" && (seller.requiresListingReview || settings["listings.requireReview"])) status = "pending";
    }
    await db.product.update({ where: { id }, data: { status, publishedAt: status === "published" && !product.publishedAt ? new Date() : product.publishedAt } });
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "listing.status", targetType: "product", targetId: id, summary: `${product.title} ${product.issue}: ${product.status} → ${status}` });
    revalidatePath("/dashboard/listings");
    revalidatePath(`/store/${product.slug}`);
    revalidatePath("/store");
    if (status === "published" || product.status === "published") await pingListing(product.slug);
    return okState(undefined, `Listing ${status === "pending" ? "submitted for review" : status}.`);
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}

export async function deleteListingAction(id: string): Promise<ActionState> {
  try {
    const user = await assertSeller();
    const product = await db.product.findFirst({ where: { id, sellerId: user.seller.id, deletedAt: null }, include: { _count: { select: { orderItems: true } } } });
    if (!product) throw new AuthError("Listing not found", 403);
    if (product._count.orderItems > 0) {
      await db.product.update({ where: { id }, data: { status: "archived" } });
    } else {
      await db.product.update({ where: { id }, data: { status: "archived", deletedAt: new Date() } });
    }
    await audit({ actor: { id: user.id, email: user.email, type: "seller" }, action: "listing.delete", targetType: "product", targetId: id, summary: `${product.title} ${product.issue} removed by seller` });
    revalidatePath("/dashboard/listings");
    revalidatePath("/store");
    if (product.status === "published") await pingListing(product.slug);
    return okState(undefined, "Listing removed.");
  } catch (err) {
    if (err instanceof AuthError) return failState(err.message);
    throw err;
  }
}
