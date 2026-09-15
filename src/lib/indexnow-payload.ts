/**
 * Pure helpers for IndexNow (https://www.indexnow.org/documentation) — the
 * protocol Bing, Yandex, Seznam and Naver use to learn about new, changed and
 * removed URLs immediately instead of waiting for a crawl. Google does not
 * consume IndexNow; it relies on the sitemap and Search Console.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] };

/** The key file is served at the site root and under /indexnow/; both hold exactly the key. */
export const INDEXNOW_KEY_FOLDER = "/indexnow";

/**
 * The keyLocation sent with every submission. IndexNow scopes a key to the folder its
 * file sits in — a file at /indexnow/<key>.txt only verifies URLs under /indexnow/ (the
 * endpoint answers 422 for anything else, confirmed live on 2026-09-15) — so the root
 * copy, which verifies the whole site, is the default. `override` (INDEXNOW_KEY_LOCATION)
 * forces a specific absolute URL.
 */
export function indexNowKeyLocation(siteUrl: string, key: string, override = ""): string {
  const forced = override.trim();
  if (/^https:\/\/\S+\.txt$/i.test(forced)) return forced;
  return `${siteUrl.replace(/\/+$/, "")}/${key}.txt`;
}

/** Absolute URLs on the canonical origin only, de-duplicated and capped at the protocol's batch limit. */
export function buildIndexNowPayload(siteUrl: string, key: string, paths: string[], keyLocationOverride = ""): IndexNowPayload {
  const origin = siteUrl.replace(/\/+$/, "");
  const host = new URL(origin).host;
  const urls = new Set<string>();
  for (const raw of paths) {
    const p = raw.trim();
    if (!p) continue;
    const url = /^https?:\/\//i.test(p) ? p : `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
    if (url === origin || url.startsWith(`${origin}/`)) urls.add(url);
  }
  return { host, key, keyLocation: indexNowKeyLocation(origin, key, keyLocationOverride), urlList: [...urls].slice(0, INDEXNOW_MAX_URLS) };
}

/** IndexNow keys are 8–128 characters from [a-zA-Z0-9-]. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key);
}
