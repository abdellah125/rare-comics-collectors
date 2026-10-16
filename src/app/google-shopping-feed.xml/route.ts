import { feedBody, feedHeaders } from "@/lib/merchant-feed-store";

/**
 * Google Merchant Center product feed: https://<site>/google-shopping-feed.xml
 *
 * Every buyable listing, as XML sent gzip-encoded (Content-Encoding: gzip), which feed readers and
 * browsers undo on arrival (uncompressed the feed is over 90 MB, compressed about 5 MB). The bytes
 * are the file the feed_publish job writes every 15 minutes (see merchant-feed-store.ts).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await feedBody();
  if (!feed) return new Response("The feed is being rebuilt. Try again in a few minutes.", { status: 503, headers: { "retry-after": "300", "cache-control": "no-store" } });
  return new Response(feed.body, { status: 200, headers: { ...feedHeaders(feed), "content-type": "application/rss+xml; charset=utf-8", "content-encoding": "gzip", vary: "accept-encoding" } });
}
