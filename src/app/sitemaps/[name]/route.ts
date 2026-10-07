import { guideSitemapEntries, guideSitemapPages, newsSitemapItems, sitemapEntries } from "@/lib/sitemap-entries";
import { newsSitemapXml, sitemapHeaders, urlsetXml } from "@/lib/sitemap-xml";
import { site } from "@/lib/site";

/** /sitemaps/site.xml (catalogue + hubs), /sitemaps/guides-N.xml (2,000 guides each) and /sitemaps/news.xml (news of the last two days). */
export const revalidate = 3600;

export async function GET(_req: Request, ctx: RouteContext<"/sitemaps/[name]">) {
  const { name } = await ctx.params;
  if (name === "site.xml") return new Response(urlsetXml(await sitemapEntries()), { headers: sitemapHeaders });
  if (name === "news.xml") return new Response(newsSitemapXml(await newsSitemapItems(), site.name), { headers: { ...sitemapHeaders, "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  const m = name.match(/^guides-(\d{1,4})\.xml$/);
  if (m) {
    const page = Number.parseInt(m[1], 10);
    if (page >= 1 && page <= (await guideSitemapPages())) return new Response(urlsetXml(await guideSitemapEntries(page)), { headers: sitemapHeaders });
  }
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}
