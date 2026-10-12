import "server-only";
import type { MetadataRoute } from "next";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { publishedWhere } from "@/lib/catalog/products";
import { db } from "@/lib/db";
import { listCharacters, publishedGuideWhere } from "@/lib/guides/data";
import { GUIDE_TOPICS } from "@/lib/guides/topics";
import { CATEGORIES } from "@/lib/content/categories";
import { categoryCounts } from "@/lib/guides/data";
import { policies } from "@/lib/policies";
import { services } from "@/lib/services";
import { getSettings } from "@/lib/settings";
import { TRANSLATED_LOCALES, localizePath } from "@/lib/i18n/config";
import { site } from "@/lib/site";
import { listPriceGuides } from "@/lib/catalog/price-guide";

export type SitemapEntry = MetadataRoute.Sitemap[number];

/** Guides are split into files of this many URLs; the index at /sitemap.xml lists them all. */
export const GUIDE_SITEMAP_SIZE = 2000;
/** Products are split into files of this many URLs (every listing is in one; the protocol allows 50,000 per file). */
export const PRODUCT_SITEMAP_SIZE = 5000;

const url = (path: string) => `${site.url}${path}`;

/**
 * Every indexable URL apart from individual guides, with lastModified from the
 * live catalogue. Shared by /sitemaps/site.xml and the IndexNow sync job so the
 * two never disagree. Account, cart, checkout, dashboards and the admin are
 * noindex and deliberately absent.
 */
/** Pages translated in full: the only ones that exist as separate, indexable URLs per language. */
export const TRANSLATED_PATHS = ["/", "/store", "/contact"] as const;

export async function sitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSettings();

  const [sellers, latestProduct, collections, publishers, characters, latestGuide, priceGuides] = await Promise.all([
    settings["features.sellerStorefronts"] ? db.sellerProfile.findMany({ where: { status: "approved" }, select: { slug: true, updatedAt: true } }) : Promise.resolve([]),
    // The last visible change in the catalogue (not the last stock sync), so hub pages are not "new" every day.
    db.product.findFirst({ where: publishedWhere, orderBy: { contentUpdatedAt: "desc" }, select: { contentUpdatedAt: true } }),
    listCollections(),
    listPublishers(),
    listCharacters(),
    db.article.findFirst({ where: publishedGuideWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    listPriceGuides(),
  ]);
  const storeChanged = latestProduct?.contentUpdatedAt ?? new Date();
  const guidesChanged = latestGuide?.updatedAt ?? storeChanged;

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: storeChanged, changeFrequency: "daily", priority: 1 },
    { url: url("/store"), lastModified: storeChanged, changeFrequency: "daily", priority: 0.95 },
    { url: url("/guides"), lastModified: guidesChanged, changeFrequency: "daily", priority: 0.9 },
    { url: url("/services"), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/characters"), lastModified: guidesChanged, changeFrequency: "weekly", priority: 0.8 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/contact"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/faq"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/support"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/policies"), changeFrequency: "yearly", priority: 0.4 },
  ];

  const collectionUrls: MetadataRoute.Sitemap = [
    { url: url("/collections"), lastModified: storeChanged, changeFrequency: "weekly", priority: 0.85 },
    ...collections.map((c) => ({ url: url(`/collections/${c.slug}`), lastModified: storeChanged, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
  const publisherUrls: MetadataRoute.Sitemap = [
    { url: url("/publishers"), lastModified: storeChanged, changeFrequency: "weekly", priority: 0.7 },
    ...publishers.map((p) => ({ url: url(`/publishers/${p.slug}`), lastModified: storeChanged, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
  const priceGuideUrls: MetadataRoute.Sitemap = priceGuides.length
    ? [
        { url: url("/price-guide"), lastModified: storeChanged, changeFrequency: "weekly", priority: 0.8 },
        ...priceGuides.map((g) => ({ url: url(`/price-guide/${g.slug}`), lastModified: g.changedAt, changeFrequency: "weekly" as const, priority: 0.75 })),
      ]
    : [];
  const topicUrls: MetadataRoute.Sitemap = GUIDE_TOPICS.map((t) => ({ url: url(`/guides/topics/${t.slug}`), lastModified: guidesChanged, changeFrequency: "weekly" as const, priority: 0.75 }));
  // Category pages exist for search engines only once they have something in them.
  const counts = await categoryCounts();
  const categoryUrls: MetadataRoute.Sitemap = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0).map((c) => ({ url: url(`/guides/category/${c.slug}`), lastModified: guidesChanged, changeFrequency: c.fresh ? ("daily" as const) : ("weekly" as const), priority: 0.75 }));
  const characterUrls: MetadataRoute.Sitemap = characters.map((c) => ({ url: url(`/characters/${c.slug}`), lastModified: guidesChanged, changeFrequency: "weekly" as const, priority: 0.7 }));
  const sellerUrls: MetadataRoute.Sitemap = sellers.map((s) => ({ url: url(`/sellers/${s.slug}`), lastModified: s.updatedAt, changeFrequency: "weekly", priority: 0.6 }));
  const serviceUrls: MetadataRoute.Sitemap = services.map((s) => ({ url: url(`/services/${s.slug}`), changeFrequency: "monthly", priority: 0.75 }));
  const policyUrls: MetadataRoute.Sitemap = policies.map((p) => ({ url: url(`/policies/${p.slug}`), lastModified: new Date(p.updated), changeFrequency: "yearly", priority: 0.3 }));

  // Language versions of the pages whose copy is translated (the same list carries hreflang in the page head).
  const enabled = new Set((await db.locale.findMany({ where: { isEnabled: true }, select: { code: true } })).map((l) => l.code));
  const localizedUrls: MetadataRoute.Sitemap = TRANSLATED_LOCALES.filter((l) => enabled.has(l)).flatMap((l) =>
    TRANSLATED_PATHS.map((p) => ({ url: url(localizePath(p, l)), lastModified: storeChanged, changeFrequency: "weekly" as const, priority: 0.6 })),
  );

  return [...core, ...localizedUrls, ...collectionUrls, ...publisherUrls, ...priceGuideUrls, ...topicUrls, ...categoryUrls, ...characterUrls, ...sellerUrls, ...serviceUrls, ...policyUrls];
}

export async function productSitemapPages(): Promise<number> {
  return Math.max(1, Math.ceil((await db.product.count({ where: publishedWhere })) / PRODUCT_SITEMAP_SIZE));
}

/**
 * One file of product URLs (1-based), oldest listing first so a product keeps its file as new ones
 * arrive. lastmod is the last visible change (contentUpdatedAt), with the main photo for image search.
 */
export async function productSitemapEntries(page: number): Promise<MetadataRoute.Sitemap> {
  const rows = await db.product.findMany({
    where: publishedWhere,
    select: { slug: true, contentUpdatedAt: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } },
    orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PRODUCT_SITEMAP_SIZE,
    take: PRODUCT_SITEMAP_SIZE,
  });
  const absolute = (imageUrl: string) => (imageUrl.startsWith("http") ? imageUrl : url(imageUrl));
  return rows.map((p) => ({ url: url(`/store/${p.slug}`), lastModified: p.contentUpdatedAt, changeFrequency: "weekly" as const, priority: 0.8, images: p.images[0]?.url ? [absolute(p.images[0].url)] : undefined }));
}

/** The newest lastmod in each sitemap file, for the index (a file only counts as changed when a URL in it did). */
export async function sitemapFileDates(): Promise<{ site: Date; products: Date[]; guides: Date[] }> {
  const [productPages, guidePages, latestGuide] = await Promise.all([productSitemapPages(), guideSitemapPages(), db.article.findFirst({ where: publishedGuideWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })]);
  const products = await Promise.all(
    Array.from({ length: productPages }, async (_, i) => {
      const ids = await db.product.findMany({ where: publishedWhere, orderBy: [{ publishedAt: "asc" }, { id: "asc" }], skip: i * PRODUCT_SITEMAP_SIZE, take: PRODUCT_SITEMAP_SIZE, select: { id: true } });
      const r = await db.product.aggregate({ _max: { contentUpdatedAt: true }, where: { id: { in: ids.map((x) => x.id) } } });
      return r._max.contentUpdatedAt ?? new Date(0);
    }),
  );
  const guides = await Promise.all(
    Array.from({ length: guidePages }, async (_, i) => {
      const rows = await db.article.findMany({ where: publishedGuideWhere, orderBy: [{ publishedAt: "asc" }, { id: "asc" }], skip: i * GUIDE_SITEMAP_SIZE, take: GUIDE_SITEMAP_SIZE, select: { updatedAt: true } });
      return rows.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), new Date(0));
    }),
  );
  const latestProduct = products.reduce((m, d) => (d > m ? d : m), new Date(0));
  const siteDate = latestGuide && latestGuide.updatedAt > latestProduct ? latestGuide.updatedAt : latestProduct;
  return { site: siteDate, products, guides };
}

export async function guideSitemapPages(): Promise<number> {
  const total = await db.article.count({ where: publishedGuideWhere });
  return Math.ceil(total / GUIDE_SITEMAP_SIZE);
}

/** One page of guide URLs (1-based), oldest first so page membership is stable as guides are added. */
export async function guideSitemapEntries(page: number): Promise<MetadataRoute.Sitemap> {
  const rows = await db.article.findMany({ where: publishedGuideWhere, select: { slug: true, updatedAt: true }, orderBy: [{ publishedAt: "asc" }, { id: "asc" }], skip: (page - 1) * GUIDE_SITEMAP_SIZE, take: GUIDE_SITEMAP_SIZE });
  return rows.map((g) => ({ url: url(`/guides/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 }));
}

/** News articles published in the last two days, newest first (the window a news sitemap covers). */
export async function newsSitemapItems(): Promise<{ url: string; title: string; publishedAt: Date }[]> {
  const rows = await db.article.findMany({ where: { ...publishedGuideWhere, format: "news", publishedAt: { gte: new Date(Date.now() - 2 * 86_400_000), lte: new Date() } }, select: { slug: true, title: true, publishedAt: true }, orderBy: { publishedAt: "desc" }, take: 1000 });
  return rows.map((r) => ({ url: url(`/guides/${r.slug}`), title: r.title, publishedAt: r.publishedAt! }));
}

/** Everything, for the IndexNow sync. */
export async function allSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [pages, productPages] = await Promise.all([guideSitemapPages(), productSitemapPages()]);
  const guides = await Promise.all(Array.from({ length: pages }, (_, i) => guideSitemapEntries(i + 1)));
  const products = await Promise.all(Array.from({ length: productPages }, (_, i) => productSitemapEntries(i + 1)));
  return [...(await sitemapEntries()), ...products.flat(), ...guides.flat()];
}
