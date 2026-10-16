import { feedBody, feedHeaders } from "@/lib/merchant-feed-store";

/**
 * The same feed as a plain .gz file: https://<site>/google-shopping-feed.xml.gz
 * (the file the feed_publish job writes every 15 minutes; see merchant-feed-store.ts).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await feedBody();
  if (!feed) return new Response("The feed is being rebuilt. Try again in a few minutes.", { status: 503, headers: { "retry-after": "300", "cache-control": "no-store" } });
  return new Response(feed.body, { status: 200, headers: { ...feedHeaders(feed), "content-type": "application/gzip", "content-disposition": 'inline; filename="google-shopping-feed.xml.gz"' } });
}
