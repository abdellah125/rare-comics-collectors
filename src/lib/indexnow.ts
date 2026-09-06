import "server-only";
import { env } from "@/lib/env";
import { buildIndexNowPayload, INDEXNOW_ENDPOINT, isValidIndexNowKey } from "@/lib/indexnow-payload";
import { enqueueJob } from "@/lib/jobs/queue";
import { site } from "@/lib/site";

/**
 * IndexNow integration: Bing (and Yandex, Seznam, Naver) learn about new, changed and
 * removed pages the moment a listing is saved instead of on their next crawl. The key
 * is public by design — search engines fetch /<key>.txt to confirm we control the host —
 * so a built-in default is fine; INDEXNOW_KEY overrides it.
 */
const DEFAULT_KEY = "indexnow-6c6ba387ef6cc74605a16c7a7090607d";

export function indexNowKey(): string {
  const configured = env.indexNow.key.trim();
  return isValidIndexNowKey(configured) ? configured : DEFAULT_KEY;
}

export type IndexNowResult = { ok: boolean; status: number; submitted: number; skipped?: string };

/** Submits absolute canonical URLs. Never called from a request directly — go through the job queue. */
export async function submitIndexNow(paths: string[]): Promise<IndexNowResult> {
  const payload = buildIndexNowPayload(site.url, indexNowKey(), paths);
  if (payload.urlList.length === 0) return { ok: true, status: 0, submitted: 0, skipped: "nothing to submit" };
  if (!env.indexNow.enabled) return { ok: true, status: 0, submitted: 0, skipped: "disabled outside production" };
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const ok = res.status === 200 || res.status === 202;
  if (ok) console.log(`[indexnow] submitted ${payload.urlList.length} url(s) (${res.status})`);
  else console.warn(`[indexnow] endpoint answered ${res.status} for ${payload.urlList.length} url(s)`);
  return { ok, status: res.status, submitted: payload.urlList.length };
}

/** Queues a ping for changed pages. Never throws: telling search engines must not break a save. */
export async function pingIndexNow(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await enqueueJob("indexnow_ping", { paths }, { maxAttempts: 3 });
  } catch (err) {
    console.error("[indexnow] could not queue ping", err);
  }
}

/** A listing was published, edited, hidden or removed: its page and the store index changed. */
export function pingListing(slug: string): Promise<void> {
  return pingIndexNow([`/store/${slug}`, "/store", "/collections", "/publishers"]);
}

/**
 * Paths for the weekly sync: everything in the sitemap on the first run, afterwards only
 * entries whose lastModified is newer than the previous run (static pages carry none).
 */
export async function sitemapPaths(since: Date | null): Promise<string[]> {
  const { sitemapEntries } = await import("@/lib/sitemap-entries");
  const entries = await sitemapEntries();
  return entries
    .filter((e) => {
      if (!since) return true;
      const m = e.lastModified instanceof Date ? e.lastModified : e.lastModified ? new Date(e.lastModified) : null;
      return m !== null && m.getTime() > since.getTime();
    })
    .map((e) => e.url);
}
