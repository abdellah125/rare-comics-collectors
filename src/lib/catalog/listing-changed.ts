import "server-only";
import { revalidatePath } from "next/cache";
import { pingListing } from "@/lib/indexnow";

/**
 * Everything that must follow a listing being published, edited, hidden or removed
 * besides the page itself: the cached catalogue documents are dropped so the next
 * fetch rebuilds them, and IndexNow-capable search engines are pinged.
 */
export async function listingChanged(slug: string): Promise<void> {
  for (const path of ["/google-shopping-feed.xml", "/sitemap.xml", "/collections", "/publishers"]) revalidatePath(path);
  await pingListing(slug);
}
