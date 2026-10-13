/**
 * Google Merchant Center product feed: https://<site>/google-shopping-feed.xml
 *
 * Every buyable listing, as XML sent gzip-encoded (Content-Encoding: gzip), which every feed reader
 * and browser undoes on arrival: uncompressed the feed is over 100 MB, compressed about 5 MB.
 *
 * The bytes are those of /google-shopping-feed.xml.gz, passed through as they arrive. That route is
 * the one that builds and caches the feed (every 15 minutes, and when a listing changes). Building
 * it here as a cached page of its own did not work: Vercel served the encoded copy made at deploy
 * time for ever and never stored a refreshed one, so Google kept reading a frozen feed.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const upstream = await fetch(new URL("/google-shopping-feed.xml.gz", req.url), { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) return new Response("The feed is being rebuilt. Try again in a few minutes.", { status: 503, headers: { "retry-after": "300", "cache-control": "no-store" } });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "content-encoding": "gzip",
      vary: "accept-encoding",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=900",
      // A machine-read feed, not a page for the web index.
      "x-robots-tag": "noindex",
      "x-feed-items": upstream.headers.get("x-feed-items") ?? "",
      "x-feed-skipped": upstream.headers.get("x-feed-skipped") ?? "",
    },
  });
}
