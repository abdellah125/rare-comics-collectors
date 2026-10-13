import { gzipSync } from "node:zlib";
import { merchantFeed } from "@/lib/merchant-feed";
import { FEED_MAX_BYTES } from "@/lib/merchant-feed-xml";

/**
 * Google Merchant Center product feed: https://<site>/google-shopping-feed.xml
 *
 * Every buyable listing. The XML is sent gzip-encoded (Content-Encoding: gzip), which every feed
 * reader and browser undoes on arrival: uncompressed, 37,000 listings are over 100 MB, far past
 * the 20 MB Vercel stores for a cached response, while compressed they are about 5 MB. Public
 * (Google fetches it without credentials), regenerated at most every 15 minutes and invalidated
 * when a listing changes (listingChanged()). The same bytes are also at /google-shopping-feed.xml.gz
 * as a plain .gz file.
 */
export const revalidate = 900;

export async function GET() {
  const { xml, included, skipped } = await merchantFeed({ maxBytes: Number.POSITIVE_INFINITY });
  const body = gzipSync(xml, { level: 9 });
  if (body.byteLength > FEED_MAX_BYTES) console.error(`[merchant-feed] compressed feed is ${body.byteLength} bytes, over the ${FEED_MAX_BYTES} limit`);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "content-encoding": "gzip",
      vary: "accept-encoding",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
      // A machine-read feed, not a page for the web index.
      "x-robots-tag": "noindex",
      "x-feed-items": String(included),
      "x-feed-skipped": String(skipped.length),
    },
  });
}
