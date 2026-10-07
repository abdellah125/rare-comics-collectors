import type { MetadataRoute } from "next";
import { escapeXml } from "@/lib/merchant-feed-xml";

/** Serialises sitemap entries the way Next's metadata route does, image extension included. */
export function urlsetXml(entries: MetadataRoute.Sitemap): string {
  const items = entries
    .map((e) => {
      const last = e.lastModified ? (e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified)).toISOString() : null;
      return `<url><loc>${escapeXml(e.url)}</loc>${last ? `<lastmod>${last}</lastmod>` : ""}${e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : ""}${e.priority !== undefined ? `<priority>${e.priority}</priority>` : ""}${(e.images ?? []).map((i) => `<image:image><image:loc>${escapeXml(i)}</image:loc></image:image>`).join("")}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${items}\n</urlset>\n`;
}

export function sitemapIndexXml(files: { loc: string; lastModified?: Date }[]): string {
  const items = files.map((f) => `<sitemap><loc>${escapeXml(f.loc)}</loc>${f.lastModified ? `<lastmod>${f.lastModified.toISOString()}</lastmod>` : ""}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

/** Google News sitemap: news articles of the last two days only, as the format requires. */
export function newsSitemapXml(items: { url: string; title: string; publishedAt: Date }[], publication: string): string {
  const rows = items.map((i) => `<url><loc>${escapeXml(i.url)}</loc><news:news><news:publication><news:name>${escapeXml(publication)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${i.publishedAt.toISOString()}</news:publication_date><news:title>${escapeXml(i.title)}</news:title></news:news></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${rows}\n</urlset>\n`;
}

export const sitemapHeaders = { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-robots-tag": "noindex" };
