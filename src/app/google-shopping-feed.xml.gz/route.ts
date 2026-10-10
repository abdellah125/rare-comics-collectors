import { gzipSync } from "node:zlib";
import { merchantFeed } from "@/lib/merchant-feed";
import { FEED_MAX_BYTES } from "@/lib/merchant-feed-xml";

/**
 * The complete Google Merchant Center feed, gzip-compressed: https://<site>/google-shopping-feed.xml.gz
 *
 * The plain /google-shopping-feed.xml has to stay under Vercel's 20 MB limit for cached responses,
 * which the catalogue has outgrown, so it leaves the oldest listings out. Compressed, every listing
 * fits many times over. Merchant Center reads .gz files directly: point the data source's fetch URL here.
 * Same schedule and invalidation as the plain feed.
 */
export const revalidate = 900;

export async function GET() {
  const { xml, included, skipped } = await merchantFeed({ maxBytes: Number.POSITIVE_INFINITY });
  const body = gzipSync(xml, { level: 9 });
  if (body.byteLength > FEED_MAX_BYTES) console.error(`[merchant-feed] compressed feed is ${body.byteLength} bytes, over the ${FEED_MAX_BYTES} limit`);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": "application/gzip",
      "content-disposition": 'inline; filename="google-shopping-feed.xml.gz"',
      "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
      "x-robots-tag": "noindex",
      "x-feed-items": String(included),
      "x-feed-skipped": String(skipped.length),
    },
  });
}
