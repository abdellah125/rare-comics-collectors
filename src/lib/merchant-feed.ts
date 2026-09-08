import "server-only";
import { publishedWhere } from "@/lib/catalog/products";
import { cheapestDeliveryOption, shippingOptionsFor } from "@/lib/commerce/pricing";
import { db } from "@/lib/db";
import { isString, parseJsonArray, parseJsonObject } from "@/lib/json";
import { buildFeedXml, productToFeedItem, type FeedItem, type FeedShipping, type FeedSkip } from "@/lib/merchant-feed-xml";
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
export async function merchantFeed(): Promise<MerchantFeedResult> {
  const settings = await getSettings();
  const rows = await db.product.findMany({
    where: { ...publishedWhere, stock: { gt: 0 } },
    include: {
      images: { orderBy: { position: "asc" }, select: { url: true } },
      category: { select: { name: true } },
      seller: { select: { slug: true, displayName: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 10_000,
  });

  // The cheapest option a lone copy would ship with to the marketplace's home country —
  // the same figure the product page quotes. Memoised per price so the feed stays cheap.
  const country = settings["marketplace.defaultCountry"];
  const shippingByPrice = new Map<number, FeedShipping | undefined>();
  const shippingFor = async (price: number): Promise<FeedShipping | undefined> => {
    if (shippingByPrice.has(price)) return shippingByPrice.get(price);
    const cheapest = cheapestDeliveryOption(await shippingOptionsFor(country, price));
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
  console.log(`[merchant-feed] ${items.length} items, ${skipped.length} skipped`);

  const xml = buildFeedXml({
    title: `${settings["marketplace.name"]} — graded comics`,
    link: site.url,
    description: `Graded and raw collectible comic books for sale at ${settings["marketplace.name"]}.`,
    items,
    skipped,
    generatedAt: new Date(),
  });
  return { xml, included: items.length, skipped };
}
