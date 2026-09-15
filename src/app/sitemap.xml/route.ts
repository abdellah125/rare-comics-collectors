import { guideSitemapPages } from "@/lib/sitemap-entries";
import { sitemapHeaders, sitemapIndexXml } from "@/lib/sitemap-xml";
import { site } from "@/lib/site";

/**
 * Sitemap index. The catalogue and every hub live in /sitemaps/site.xml; guides are
 * split into /sitemaps/guides-N.xml files of 2,000 URLs so the knowledge base can
 * grow to tens of thousands of articles without breaking the 50,000-URL limit.
 */
export const revalidate = 3600;

export async function GET() {
  const pages = await guideSitemapPages();
  const now = new Date();
  const files = [{ loc: `${site.url}/sitemaps/site.xml`, lastModified: now }, ...Array.from({ length: pages }, (_, i) => ({ loc: `${site.url}/sitemaps/guides-${i + 1}.xml`, lastModified: now }))];
  return new Response(sitemapIndexXml(files), { headers: sitemapHeaders });
}
