import "server-only";
import { publishedWhere } from "@/lib/catalog/products";
import { cheapestDeliveryOption, shippingQuoter } from "@/lib/commerce/pricing";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isString, parseJsonArray, parseJsonObject } from "@/lib/json";
import { buildFeedXml, fitFeedItems, productToFeedItem, type FeedItem, type FeedShipping, type FeedSkip } from "@/lib/merchant-feed-xml";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export type MerchantFeedResult = { xml: string; included: number; skipped: FeedSkip[] };

/**
 * Google Merchant Center product feed built from the live catalogue: every
 * buyable listing (published, not deleted, approved seller, stock on hand).
 * Sold-out books are unique slabs that never come back, so they are left out
 * rather than listed as out of stock. Listings that would be disapproved by
 * Google (no image, no price, no SKU) are skipped and logged.
 */
/** Listings in the feed at most; the plain .xml is cut to its size limit afterwards, the .xml.gz carries them all. */
const FEED_MAX_ITEMS = 50_000;
const PAGE = 2_000;

const feedSelect = {
  id: true, sku: true, slug: true, title: true, issue: true, publisher: true, year: true, era: true, grader: true, grade: true, label: true, certNumber: true,
  price: true, compareAt: true, stock: true, keyIssue: true, summary: true, description: true, highlightsJson: true, attributesJson: true, weightGrams: true,
  categoryId: true, sellerId: true, publishedAt: true,
} as const;

/**
 * Every buyable fixed-price listing with its photos, category and seller, newest first.
 *
 * Read in pages of plain rows and joined here, not with one `findMany({ include })`: the catalogue
 * changes while it is read (imports, releases, price syncs), and Prisma's own joining of a 12,000-row
 * result then failed with "no entry found for key", which left the feed frozen at its last good copy.
 * A listing whose photos vanish between the two reads is simply left out of this run.
 */
async function feedRows() {
  const products: Prisma.ProductGetPayload<{ select: typeof feedSelect }>[] = [];
  let cursor: string | undefined;
  while (products.length < FEED_MAX_ITEMS) {
    // Merchant Center needs a fixed price: products sold by bidding are not submitted.
    const page = await db.product.findMany({ where: { ...publishedWhere, stock: { gt: 0 }, saleType: "fixed" }, select: feedSelect, orderBy: { id: "asc" }, take: PAGE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    products.push(...page);
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].id;
  }
  products.sort((x, y) => (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0) || (x.id < y.id ? -1 : 1));
  const kept = products.slice(0, FEED_MAX_ITEMS);

  const images = new Map<string, { url: string }[]>();
  for (let i = 0; i < kept.length; i += PAGE) {
    const ids = kept.slice(i, i + PAGE).map((p) => p.id);
    for (const img of await db.productImage.findMany({ where: { productId: { in: ids } }, select: { productId: true, url: true }, orderBy: [{ productId: "asc" }, { position: "asc" }] })) {
      const list = images.get(img.productId);
      if (list) list.push({ url: img.url });
      else images.set(img.productId, [{ url: img.url }]);
    }
  }
  const [categories, sellers] = await Promise.all([db.category.findMany({ select: { id: true, name: true } }), db.sellerProfile.findMany({ select: { id: true, slug: true, displayName: true } })]);
  const categoryOf = new Map(categories.map((x) => [x.id, { name: x.name }]));
  const sellerOf = new Map(sellers.map((x) => [x.id, { slug: x.slug, displayName: x.displayName }]));
  return kept.map((p) => ({ ...p, images: images.get(p.id) ?? [], category: p.categoryId ? (categoryOf.get(p.categoryId) ?? null) : null, seller: p.sellerId ? (sellerOf.get(p.sellerId) ?? null) : null }));
}

export async function merchantFeed(opts: { maxBytes?: number } = {}): Promise<MerchantFeedResult> {
  const settings = await getSettings();
  const rows = await feedRows();

  // The cheapest option a lone copy would ship with to the marketplace's home country —
  // the same figure the product page quotes. The methods are loaded once and priced in memory:
  // a query per distinct price made the feed take over a minute once the catalogue passed
  // 10,000 listings, which broke the production build (it is prerendered at build time).
  const country = settings["marketplace.defaultCountry"];
  const quote = await shippingQuoter(country);
  const shippingByPrice = new Map<number, FeedShipping | undefined>();
  const shippingFor = async (price: number): Promise<FeedShipping | undefined> => {
    if (shippingByPrice.has(price)) return shippingByPrice.get(price);
    const cheapest = cheapestDeliveryOption(quote(price));
    const shipping = cheapest ? { country, service: cheapest.name, price: cheapest.price } : undefined;
    shippingByPrice.set(price, shipping);
    return shipping;
  };

  const items: FeedItem[] = [];
  const skipped: FeedSkip[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const mapped = productToFeedItem(
      {
        ...row,
        highlights: parseJsonArray(row.highlightsJson, isString),
        attributes: Object.fromEntries(Object.entries(parseJsonObject<Record<string, unknown>>(row.attributesJson) ?? {}).filter((e): e is [string, string] => typeof e[1] === "string")),
      },
      { siteUrl: site.url, currency: site.currency, houseSellerId: "rare-comics-collectors", houseSellerName: settings["marketplace.name"], shipping: await shippingFor(row.price) },
    );
    if ("skip" in mapped) {
      skipped.push(mapped.skip);
      continue;
    }
    if (seen.has(mapped.item.id)) {
      skipped.push({ id: mapped.item.id, reason: "duplicate id" });
      continue;
    }
    seen.add(mapped.item.id);
    items.push(mapped.item);
  }
  for (const s of skipped) console.warn(`[merchant-feed] skipped ${s.id}: ${s.reason}`);
  const fitted = fitFeedItems(items, opts.maxBytes);
  const omittedForSize = items.length - fitted.length;
  console.log(`[merchant-feed] ${fitted.length} items, ${skipped.length} skipped${omittedForSize ? `, ${omittedForSize} older left out to stay under the size limit` : ""}`);

  const xml = buildFeedXml({
    title: `${settings["marketplace.name"]} — graded comics`,
    link: site.url,
    description: `Graded and raw collectible comic books for sale at ${settings["marketplace.name"]}.`,
    items: fitted,
    skipped,
    generatedAt: new Date(),
    omittedForSize,
  });
  return { xml, included: fitted.length, skipped };
}
