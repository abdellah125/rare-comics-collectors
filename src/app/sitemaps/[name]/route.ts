import { guideSitemapEntries, guideSitemapPages, sitemapEntries } from "@/lib/sitemap-entries";
import { sitemapHeaders, urlsetXml } from "@/lib/sitemap-xml";

/** /sitemaps/site.xml (catalogue + hubs) and /sitemaps/guides-N.xml (2,000 guides each). */
export const revalidate = 3600;

export async function GET(_req: Request, ctx: RouteContext<"/sitemaps/[name]">) {
  const { name } = await ctx.params;
  if (name === "site.xml") return new Response(urlsetXml(await sitemapEntries()), { headers: sitemapHeaders });
  const m = name.match(/^guides-(\d{1,4})\.xml$/);
  if (m) {
    const page = Number.parseInt(m[1], 10);
    if (page >= 1 && page <= (await guideSitemapPages())) return new Response(urlsetXml(await guideSitemapEntries(page)), { headers: sitemapHeaders });
  }
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}
