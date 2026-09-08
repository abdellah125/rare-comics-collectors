import { merchantFeed } from "@/lib/merchant-feed";

/**
 * Google Merchant Center product feed: https://<site>/google-shopping-feed.xml
 * Public (Google fetches it without credentials), regenerated at most every 15
 * minutes and invalidated immediately when a listing changes (listingChanged()),
 * so it never competes with page traffic yet tracks the catalogue closely.
 */
export const revalidate = 900;

export async function GET() {
  const { xml, included, skipped } = await merchantFeed();
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
      // A machine-read feed, not a page for the web index.
      "x-robots-tag": "noindex",
      "x-feed-items": String(included),
      "x-feed-skipped": String(skipped.length),
    },
  });
}
