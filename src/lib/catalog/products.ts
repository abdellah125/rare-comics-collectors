import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseJsonArray, parseJsonObject, isString } from "@/lib/json";
import type { ProductSummary } from "@/lib/products";

export type { ProductSummary };

const summaryInclude = { images: { orderBy: { position: "asc" as const }, take: 1, select: { url: true, alt: true } } };
type ProductRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;

export const publishedWhere: Prisma.ProductWhereInput = { status: "published", deletedAt: null };

export function toSummary(p: ProductRow): ProductSummary {
  const s: ProductSummary = {
    slug: p.slug,
    title: p.title,
    issue: p.issue,
    publisher: p.publisher,
    year: p.year,
    era: p.era as ProductSummary["era"],
    grader: p.grader as ProductSummary["grader"],
    grade: p.grade,
    label: p.label,
    price: p.price,
    stock: p.stock,
    creators: { writer: p.writer, artist: p.artist, cover: p.coverArtist },
    palette: [p.paletteFrom, p.paletteTo],
    rating: p.ratingAvg,
    reviewCount: p.ratingCount,
  };
  if (p.compareAt !== null) s.compareAt = p.compareAt;
  if (p.keyIssue) s.keyIssue = p.keyIssue;
  if (p.featured) s.featured = true;
  const image = p.images[0]?.url;
  if (image) s.image = image;
  return s;
}

export type ProductDetail = ProductSummary & {
  id: string;
  sku: string;
  certNumber: string | null;
  summary: string;
  description: string[];
  highlights: string[];
  images: { url: string; alt: string | null }[];
  attributes: Record<string, string>;
  restrictedCountries: string[];
  allowedCountries: string[];
  categorySlug: string | null;
  categoryName: string | null;
  status: string;
  seller: { id: string; slug: string; displayName: string; ratingAvg: number; ratingCount: number; handlingDays: number; shipsFromCountry: string | null; salesCount: number } | null;
  weightGrams: number | null;
};

const detailInclude = {
  images: { orderBy: { position: "asc" as const }, select: { url: true, alt: true } },
  category: { select: { slug: true, name: true } },
  seller: { select: { id: true, slug: true, displayName: true, ratingAvg: true, ratingCount: true, handlingDays: true, shipsFromCountry: true, salesCount: true, status: true } },
};

function toDetail(p: Prisma.ProductGetPayload<{ include: typeof detailInclude }>): ProductDetail {
  const summary = toSummary({ ...p, images: p.images.slice(0, 1) });
  const attrs = parseJsonObject<Record<string, unknown>>(p.attributesJson) ?? {};
  return {
    ...summary,
    id: p.id,
    sku: p.sku,
    certNumber: p.certNumber,
    summary: p.summary,
    description: p.description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
    highlights: parseJsonArray(p.highlightsJson, isString),
    images: p.images,
    attributes: Object.fromEntries(Object.entries(attrs).filter((e): e is [string, string] => typeof e[1] === "string")),
    restrictedCountries: parseJsonArray(p.restrictedCountriesJson, isString),
    allowedCountries: parseJsonArray(p.allowedCountriesJson, isString),
    categorySlug: p.category?.slug ?? null,
    categoryName: p.category?.name ?? null,
    status: p.status,
    seller: p.seller && p.seller.status === "approved" ? p.seller : null,
    weightGrams: p.weightGrams,
  };
}

/** The grid-safe subset of a detail record (what client components receive). */
export function detailToSummary(d: ProductDetail): ProductSummary {
  const s: ProductSummary = {
    slug: d.slug,
    title: d.title,
    issue: d.issue,
    publisher: d.publisher,
    year: d.year,
    era: d.era,
    grader: d.grader,
    grade: d.grade,
    label: d.label,
    price: d.price,
    stock: d.stock,
    creators: d.creators,
    palette: d.palette,
    rating: d.rating,
    reviewCount: d.reviewCount,
  };
  if (d.compareAt !== undefined) s.compareAt = d.compareAt;
  if (d.keyIssue) s.keyIssue = d.keyIssue;
  if (d.featured) s.featured = true;
  if (d.image) s.image = d.image;
  return s;
}

/** Everything currently buyable, for the store grid. */
export const listPublishedProducts = cache(async (): Promise<ProductSummary[]> => {
  const rows = await db.product.findMany({
    where: { ...publishedWhere, OR: [{ sellerId: null }, { seller: { status: "approved" } }] },
    include: summaryInclude,
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
  });
  return rows.map(toSummary);
});

export const getPublishedProduct = cache(async (slug: string): Promise<ProductDetail | null> => {
  const row = await db.product.findFirst({ where: { slug, ...publishedWhere }, include: detailInclude });
  if (!row) return null;
  if (row.seller && row.seller.status !== "approved") return null;
  return toDetail(row);
});

/** Admin/seller view: any status. */
export async function getProductDetailById(id: string): Promise<ProductDetail | null> {
  const row = await db.product.findUnique({ where: { id }, include: detailInclude });
  return row ? toDetail(row) : null;
}

export async function relatedProducts(product: ProductDetail, limit = 4): Promise<ProductSummary[]> {
  const rows = await db.product.findMany({
    where: { ...publishedWhere, slug: { not: product.slug }, OR: [{ title: product.title, publisher: product.publisher }, { era: product.era }] },
    include: summaryInclude,
    take: limit * 3,
  });
  const sameTitle = rows.filter((p) => p.title === product.title && p.publisher === product.publisher);
  const sameEra = rows.filter((p) => !sameTitle.includes(p));
  return [...sameTitle, ...sameEra].slice(0, limit).map(toSummary);
}

export const storeFacets = cache(async () => {
  const rows = await db.product.findMany({ where: publishedWhere, select: { era: true, publisher: true, grader: true } });
  const order = ["Golden Age", "Silver Age", "Bronze Age", "Copper Age", "Modern Age"];
  const eras = order.filter((e) => rows.some((r) => r.era === e)) as ProductSummary["era"][];
  const publishers = [...new Set(rows.map((r) => r.publisher))].sort();
  const graders = ["CGC", "CBCS", "Raw"].filter((g) => rows.some((r) => r.grader === g)) as ProductSummary["grader"][];
  const lowestPrice = await db.product.aggregate({ _min: { price: true }, where: publishedWhere });
  return { eras, publishers, graders, count: rows.length, lowestPrice: lowestPrice._min.price ?? 0 };
});

export const homeProducts = cache(async () => {
  const featured = await db.product.findMany({ where: { ...publishedWhere, featured: true }, include: summaryInclude, orderBy: { publishedAt: "desc" }, take: 8 });
  const bestsellers = await db.product.findMany({ where: { ...publishedWhere, bestseller: true }, include: summaryInclude, orderBy: { soldCount: "desc" }, take: 8 });
  const seen = new Set<string>();
  const grid: ProductSummary[] = [];
  for (const p of [...featured, ...bestsellers]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    grid.push(toSummary(p));
    if (grid.length === 8) break;
  }
  return { hero: featured.slice(0, 3).map(toSummary), grid };
});

export async function countPublished(): Promise<number> {
  return db.product.count({ where: publishedWhere });
}

export async function recordProductView(productId: string) {
  await db.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } } }).catch(() => {});
}
