import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publishedWhere, summaryInclude, toSummary, type ProductSummary } from "@/lib/catalog/products";
import { PRICE_BANDS, gradeValue, type StoreFilters } from "@/lib/catalog/store-filters";

/** Fields a search word may match, the same ones the store has always searched. */
const SEARCH_FIELDS = ["title", "issue", "publisher", "era", "grader", "grade", "keyIssue", "writer", "artist"] as const;

function whereFor(f: StoreFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [publishedWhere];
  if (f.era) and.push({ era: f.era });
  if (f.publisher) and.push({ publisher: f.publisher });
  if (f.grader) and.push({ grader: f.grader });
  if (f.keysOnly) and.push({ keyIssue: { not: null } }, { keyIssue: { not: "" } });
  if (f.band !== null) {
    const band = PRICE_BANDS[f.band];
    and.push({ price: band.max === null ? { gte: band.min } : { gte: band.min, lt: band.max } });
  }
  // Every word has to appear somewhere in the listing, in any order.
  const words = f.q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const word of words) and.push({ OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: word, mode: "insensitive" } }) as Prisma.ProductWhereInput) });
  return { AND: and };
}

const ORDER: Record<Exclude<StoreFilters["sort"], "grade-desc">, Prisma.ProductOrderByWithRelationInput[]> = {
  featured: [{ featured: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
  "price-asc": [{ price: "asc" }, { id: "asc" }],
  "price-desc": [{ price: "desc" }, { id: "asc" }],
  "year-asc": [{ year: "asc" }, { id: "asc" }],
  "year-desc": [{ year: "desc" }, { id: "asc" }],
};

/**
 * One page of the store: the listings that match the filters, sorted, cut to `show` cards, and
 * how many match in all. The database does the work, so the response stays the same size however
 * large the catalogue grows.
 */
export async function searchStore(f: StoreFilters): Promise<{ products: ProductSummary[]; total: number }> {
  const where = whereFor(f);
  if (f.sort === "grade-desc") {
    // Grades are text ("9.8", "VF 8.0"), so they are ranked here from two small columns and
    // only the rows for this page are then read in full.
    const all = await db.product.findMany({ where, select: { id: true, grade: true }, orderBy: { id: "asc" } });
    const ids = all.sort((a, b) => gradeValue(b.grade) - gradeValue(a.grade)).slice(0, f.show).map((r) => r.id);
    const rows = await db.product.findMany({ where: { id: { in: ids } }, include: summaryInclude });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return { products: ids.flatMap((id) => (byId.has(id) ? [toSummary(byId.get(id)!)] : [])), total: all.length };
  }
  const [rows, total] = await Promise.all([db.product.findMany({ where, include: summaryInclude, orderBy: ORDER[f.sort], take: f.show }), db.product.count({ where })]);
  return { products: rows.map(toSummary), total };
}
