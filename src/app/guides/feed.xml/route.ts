import { categoryOf } from "@/lib/content/categories";
import { listGuides } from "@/lib/guides/data";
import { escapeXml } from "@/lib/merchant-feed-xml";
import { site } from "@/lib/site";

/** RSS 2.0 feed of the 50 newest guides, news items and stories. */
export const dynamic = "force-dynamic";

export async function GET() {
  const { items } = await listGuides({ take: 50 });
  const rows = items
    .map((g) => `<item><title>${escapeXml(g.title)}</title><link>${site.url}/guides/${g.slug}</link><guid isPermaLink="true">${site.url}/guides/${g.slug}</guid><pubDate>${(g.publishedAt ?? g.updatedAt).toUTCString()}</pubDate><category>${escapeXml(categoryOf(g).name)}</category><description>${escapeXml(g.answer)}</description></item>`)
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(site.name)}: guides, news and stories</title><link>${site.url}/guides</link><description>Guides, news and stories for comic collectors.</description><language>en-us</language><atom:link href="${site.url}/guides/feed.xml" rel="self" type="application/rss+xml"/>\n${rows}\n</channel></rss>\n`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}
