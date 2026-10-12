import { sitemapFileDates } from "@/lib/sitemap-entries";
import { sitemapHeaders, sitemapIndexXml } from "@/lib/sitemap-xml";
import { site } from "@/lib/site";

/**
 * Sitemap index. Hubs, price guides and the other pages live in /sitemaps/site.xml; every product
 * is in one of /sitemaps/products-N.xml (5,000 each) and every guide in /sitemaps/guides-N.xml
 * (2,000 each). Each file's lastmod is the newest change among its URLs, not the time of the request.
 */
export const revalidate = 3600;

export async function GET() {
  const dates = await sitemapFileDates();
  const files = [
    { loc: `${site.url}/sitemaps/site.xml`, lastModified: dates.site },
    { loc: `${site.url}/sitemaps/news.xml`, lastModified: dates.site },
    ...dates.products.map((d, i) => ({ loc: `${site.url}/sitemaps/products-${i + 1}.xml`, lastModified: d })),
    ...dates.guides.map((d, i) => ({ loc: `${site.url}/sitemaps/guides-${i + 1}.xml`, lastModified: d })),
  ];
  return new Response(sitemapIndexXml(files), { headers: sitemapHeaders });
}
