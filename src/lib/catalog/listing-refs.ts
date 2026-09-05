import "server-only";
import { db } from "@/lib/db";

/**
 * Ids typed into listing forms (category, brand, seller) must exist; otherwise
 * Prisma throws a foreign-key error that surfaces as a generic 500 instead of
 * a field message.
 */
export async function listingRefErrors(refs: { categoryId?: string | null; brandId?: string | null; sellerId?: string | null }): Promise<Record<string, string>> {
  const errors: Record<string, string> = {};
  if (refs.categoryId && !(await db.category.findUnique({ where: { id: refs.categoryId }, select: { id: true } }))) errors.categoryId = "Unknown category";
  if (refs.brandId && !(await db.brand.findUnique({ where: { id: refs.brandId }, select: { id: true } }))) errors.brandId = "Unknown brand";
  if (refs.sellerId && !(await db.sellerProfile.findUnique({ where: { id: refs.sellerId }, select: { id: true } }))) errors.sellerId = "Unknown seller";
  return errors;
}
