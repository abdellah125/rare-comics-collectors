"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { failState, fieldErrors, formToObject, okState, slugify, zBool, zOptionalTrimmed, zSlug, zTrimmed, type ActionState } from "@/lib/validation";

const CategorySchema = z.object({
  id: zOptionalTrimmed(64),
  name: zTrimmed(120).min(2),
  slug: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zSlug.optional()),
  description: zOptionalTrimmed(1000),
  parentId: zOptionalTrimmed(64),
  position: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: zBool.optional(),
});

export async function saveCategoryAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("catalog.manage", async (admin) => {
    const parsed = CategorySchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    const slug = d.slug ?? slugify(d.name);
    if (d.parentId && d.parentId === d.id) return failState("A category can't be its own parent.");
    const clash = await db.category.findFirst({ where: { slug, ...(d.id ? { NOT: { id: d.id } } : {}) } });
    if (clash) return failState("That slug is already used.", { slug: "In use" });
    const data = { name: d.name, slug, description: d.description ?? null, parentId: d.parentId || null, position: d.position, isActive: d.isActive ?? true };
    const cat = d.id ? await db.category.update({ where: { id: d.id }, data }) : await db.category.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "category.update" : "category.create", targetType: "category", targetId: cat.id, summary: `Category ${d.name}` });
    revalidatePath("/admin/catalog");
    revalidatePath("/store");
    return okState(undefined, "Category saved.");
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  return runAdmin("catalog.manage", async (admin) => {
    const cat = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    if (!cat) return failState("Category not found.");
    if (cat._count.children > 0) return failState("Move or delete the subcategories first.");
    await db.category.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "category.delete", targetType: "category", targetId: id, summary: `Deleted category ${cat.name} (${cat._count.products} listings unassigned)` });
    revalidatePath("/admin/catalog");
    return okState(undefined, "Category deleted.");
  });
}

const BrandSchema = z.object({ id: zOptionalTrimmed(64), name: zTrimmed(120).min(1), slug: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zSlug.optional()), isActive: zBool.optional() });

export async function saveBrandAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("catalog.manage", async (admin) => {
    const parsed = BrandSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    const slug = d.slug ?? slugify(d.name);
    const clash = await db.brand.findFirst({ where: { slug, ...(d.id ? { NOT: { id: d.id } } : {}) } });
    if (clash) return failState("That slug is already used.", { slug: "In use" });
    const data = { name: d.name, slug, isActive: d.isActive ?? true };
    const brand = d.id ? await db.brand.update({ where: { id: d.id }, data }) : await db.brand.create({ data });
    await audit({ actor: actorOf(admin), action: d.id ? "brand.update" : "brand.create", targetType: "brand", targetId: brand.id, summary: `Brand ${d.name}` });
    revalidatePath("/admin/catalog");
    return okState(undefined, "Brand saved.");
  });
}

export async function deleteBrandAction(id: string): Promise<ActionState> {
  return runAdmin("catalog.manage", async (admin) => {
    const brand = await db.brand.findUnique({ where: { id }, select: { name: true } });
    if (!brand) return failState("Brand not found.");
    await db.brand.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "brand.delete", targetType: "brand", targetId: id, summary: `Deleted brand ${brand.name}` });
    revalidatePath("/admin/catalog");
    return okState(undefined, "Brand deleted.");
  });
}
