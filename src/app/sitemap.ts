import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/sitemap-entries";

/** Regenerated at most hourly; product, seller, collection and publisher entries come from the live catalogue. */
export const revalidate = 3600;

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries();
}
