import "server-only";
import { revalidatePath } from "next/cache";
import { pingListing } from "@/lib/indexnow";
import { FEED_PATHS } from "@/lib/merchant-feed-xml";

/**
 * Everything that must follow a listing being published, edited, hidden or removed
 * besides the page itself: the cached catalogue documents are dropped so the next
 * fetch rebuilds them, and IndexNow-capable search engines are pinged.
 */
export async function listingChanged(slug: string): Promise<void> {
  for (const path of [...FEED_PATHS, "/sitemap.xml", "/sitemaps/site.xml", "/collections", "/publishers", "/characters"]) revalidatePath(path);
  await pingListing(slug);
}
