import "server-only";
import { env } from "@/lib/env";
import { buildIndexNowPayload, INDEXNOW_ENDPOINT, indexNowKeyLocation, isValidIndexNowKey } from "@/lib/indexnow-payload";
import { enqueueJob } from "@/lib/jobs/queue";
import { site } from "@/lib/site";

/**
 * IndexNow integration: Bing (and Yandex, Seznam, Naver) learn about new, changed and
 * removed pages the moment a listing is saved instead of on their next crawl. The key
 * is public by design — search engines fetch the key file named by keyLocation to
 * confirm we control the host — so a built-in default is fine; INDEXNOW_KEY overrides it.
 * The file is served at /<key>.txt (the keyLocation submissions use, because IndexNow
 * only verifies URLs under the key file's folder) and at /indexnow/<key>.txt, and
 * nowhere else: never in page HTML, robots.txt or the sitemaps.
 */
const DEFAULT_KEY = "dfc2e1d4b27a4fc58d5ad41e60cd5704";

export function indexNowKey(): string {
  const configured = env.indexNow.key.trim();
  return isValidIndexNowKey(configured) ? configured : DEFAULT_KEY;
}

/** Absolute URL of the key file, as sent in every submission's keyLocation. */
export function indexNowKeyLocationUrl(): string {
  return indexNowKeyLocation(site.url, indexNowKey(), env.indexNow.keyLocation);
}

export type IndexNowResult = { ok: boolean; status: number; submitted: number; skipped?: string; keyLocation: string; urls: string[] };

/** What each IndexNow response status means, in the words the admin tool shows. */
export function describeIndexNowStatus(status: number): string {
  switch (status) {
    case 200: return "Accepted: the URLs were submitted and the key was verified.";
    case 202: return "Received: accepted but the key has not been validated yet. Bing also answers 202 for a wrong key, so check the key file below.";
    case 400: return "Bad request: the request was malformed.";
    case 403: return "Forbidden: the key file could not be fetched or its contents do not match the key.";
    case 422: return "Unprocessable: the URLs are outside the scope the key file verifies, or do not belong to this host.";
    case 429: return "Too many requests: the endpoint is rate-limiting this host. Try again later.";
    default: return status === 0 ? "Not sent." : `Unexpected response ${status}.`;
  }
}

/** Submits absolute canonical URLs. Called by the job queue and by the admin IndexNow tool. */
export async function submitIndexNow(paths: string[]): Promise<IndexNowResult> {
  const payload = buildIndexNowPayload(site.url, indexNowKey(), paths, env.indexNow.keyLocation);
  const base = { keyLocation: payload.keyLocation, urls: payload.urlList };
  if (payload.urlList.length === 0) return { ...base, ok: true, status: 0, submitted: 0, skipped: "nothing to submit" };
  if (!env.indexNow.enabled) return { ...base, ok: true, status: 0, submitted: 0, skipped: "disabled outside production" };
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const ok = res.status === 200 || res.status === 202;
  if (ok) console.log(`[indexnow] submitted ${payload.urlList.length} url(s) (${res.status}) keyLocation=${payload.keyLocation}`);
  else console.warn(`[indexnow] endpoint answered ${res.status} for ${payload.urlList.length} url(s) keyLocation=${payload.keyLocation}`);
  return { ...base, ok, status: res.status, submitted: payload.urlList.length };
}

export type IndexNowKeyFileCheck = { url: string; status: number; ok: boolean; body: string; contentType: string };

/** Fetches a key file the way a search engine would and reports whether it holds exactly the key. */
export async function checkIndexNowKeyFile(url: string): Promise<IndexNowKeyFileCheck> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const body = (await res.text()).slice(0, 200);
    return { url, status: res.status, ok: res.status === 200 && body === indexNowKey(), body, contentType: res.headers.get("content-type") ?? "" };
  } catch (err) {
    return { url, status: 0, ok: false, body: err instanceof Error ? err.message : String(err), contentType: "" };
  }
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
  const { allSitemapEntries } = await import("@/lib/sitemap-entries");
  const entries = await allSitemapEntries();
  return entries
    .filter((e) => {
      if (!since) return true;
      const m = e.lastModified instanceof Date ? e.lastModified : e.lastModified ? new Date(e.lastModified) : null;
      return m !== null && m.getTime() > since.getTime();
    })
    .map((e) => e.url);
}
