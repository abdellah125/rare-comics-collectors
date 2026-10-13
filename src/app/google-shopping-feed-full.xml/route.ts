import { gzipSync } from "node:zlib";
import { merchantFeed } from "@/lib/merchant-feed";

/**
 * Trial: the complete feed as XML sent with Content-Encoding: gzip, so one address can carry every
 * listing while the stored response stays far under Vercel's 20 MB limit. If the platform delivers
 * it intact, /google-shopping-feed.xml switches to this.
 */
export const revalidate = 900;

export async function GET() {
  const { xml, included, skipped } = await merchantFeed({ maxBytes: Number.POSITIVE_INFINITY });
  return new Response(new Uint8Array(gzipSync(xml, { level: 9 })), {
    status: 200,
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "content-encoding": "gzip",
      vary: "accept-encoding",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
      "x-robots-tag": "noindex",
      "x-feed-items": String(included),
      "x-feed-skipped": String(skipped.length),
    },
  });
}
