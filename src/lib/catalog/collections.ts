import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { publishedWhere, summaryInclude, toSummary, type ProductSummary } from "@/lib/catalog/products";
import { slugify } from "@/lib/validation";

/**
 * Indexable landing pages for the catalogue: one per active category
 * ("collection", keyed by the admin's category slug) and one per publisher.
 * Only groups with at least one buyable listing are listed, linked and put in
 * the sitemap, so the site never grows thin or empty category pages.
 */
export type Collection = {
  id: string;
  slug: string;
  name: string;
  /** Name without a trailing parenthetical, e.g. "Golden Age" — for breadcrumbs and chips. */
  shortName: string;
  /** Document title, e.g. "Golden Age (1938–1956) Comics for Sale". */
  seoTitle: string;
  description: string | null;
  count: number;
};
export type Publisher = { name: string; slug: string; count: number };

const collectionSelect = { id: true, slug: true, name: true, description: true, _count: { select: { products: { where: publishedWhere } } } } as const;
type CollectionRow = { id: string; slug: string; name: string; description: string | null; _count: { products: number } };

function toCollection(r: CollectionRow): Collection {
  const shortName = r.name.replace(/\s*\([^)]*\)\s*$/, "").trim() || r.name;
  const seoTitle = /comic|book|lot/i.test(r.name) ? `${r.name} for Sale` : `${r.name} Comics for Sale`;
  return { id: r.id, slug: r.slug, name: r.name, shortName, seoTitle, description: r.description, count: r._count.products };
}

export const listCollections = cache(async (): Promise<Collection[]> => {
  const rows = await db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: collectionSelect });
  return rows.map(toCollection).filter((c) => c.count > 0);
});

export const getCollection = cache(async (slug: string): Promise<Collection | null> => {
  const r = await db.category.findFirst({ where: { slug, isActive: true }, select: collectionSelect });
  return r ? toCollection(r) : null;
});

/** Cards on a collection or publisher page. The store browser lists (and filters) everything; these hubs show the newest. */
export const HUB_PAGE_SIZE = 96;

export async function collectionProducts(categoryId: string): Promise<ProductSummary[]> {
  const rows = await db.product.findMany({ where: { ...publishedWhere, categoryId }, include: summaryInclude, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: HUB_PAGE_SIZE });
  return rows.map(toSummary);
}

/** Year span and eras of everything a publisher has on sale, not only the cards shown. */
export async function publisherSpan(name: string): Promise<{ minYear: number | null; maxYear: number | null; eras: string[] }> {
  const where = { ...publishedWhere, publisher: name };
  const [years, eras] = await Promise.all([db.product.aggregate({ _min: { year: true }, _max: { year: true }, where }), db.product.groupBy({ by: ["era"], where })]);
  const order = ["Golden Age", "Silver Age", "Bronze Age", "Copper Age", "Modern Age"];
  return { minYear: years._min.year, maxYear: years._max.year, eras: eras.map((e) => e.era).sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
}

/** Lowest asking price across a whole hub, not only the cards shown. */
export async function lowestPrice(where: { categoryId: string } | { publisher: string }): Promise<number | null> {
  const r = await db.product.aggregate({ _min: { price: true }, where: { ...publishedWhere, ...where } });
  return r._min.price;
}

export const listPublishers = cache(async (): Promise<Publisher[]> => {
  const rows = await db.product.groupBy({ by: ["publisher"], where: publishedWhere, _count: { _all: true } });
  return rows
    .map((r) => ({ name: r.publisher, slug: slugify(r.publisher), count: r._count._all }))
    .filter((p) => p.slug.length > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
});

export const getPublisher = cache(async (slug: string): Promise<Publisher | null> => (await listPublishers()).find((p) => p.slug === slug) ?? null);

export async function publisherProducts(name: string): Promise<ProductSummary[]> {
  const rows = await db.product.findMany({ where: { ...publishedWhere, publisher: name }, include: summaryInclude, orderBy: [{ featured: "desc" }, { year: "asc" }], take: HUB_PAGE_SIZE });
  return rows.map(toSummary);
}

export const publisherHref = (publisher: string) => `/publishers/${slugify(publisher)}`;
export const collectionHref = (slug: string) => `/collections/${slug}`;
