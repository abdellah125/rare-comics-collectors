/**
 * Pure helpers for IndexNow (https://www.indexnow.org/documentation) — the
 * protocol Bing, Yandex, Seznam and Naver use to learn about new, changed and
 * removed URLs immediately instead of waiting for a crawl. Google does not
 * consume IndexNow; it relies on the sitemap and Search Console.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] };

/**
 * Where the key file lives ("Option 2" hosting): /indexnow/<key>.txt on the canonical
 * origin. Every submission names it as keyLocation so the engines know where to verify.
 */
export function indexNowKeyLocation(siteUrl: string, key: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/indexnow/${key}.txt`;
}

/** Absolute URLs on the canonical origin only, de-duplicated and capped at the protocol's batch limit. */
export function buildIndexNowPayload(siteUrl: string, key: string, paths: string[]): IndexNowPayload {
  const origin = siteUrl.replace(/\/+$/, "");
  const host = new URL(origin).host;
  const urls = new Set<string>();
  for (const raw of paths) {
    const p = raw.trim();
    if (!p) continue;
    const url = /^https?:\/\//i.test(p) ? p : `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
    if (url === origin || url.startsWith(`${origin}/`)) urls.add(url);
  }
  return { host, key, keyLocation: indexNowKeyLocation(origin, key), urlList: [...urls].slice(0, INDEXNOW_MAX_URLS) };
}

/** IndexNow keys are 8–128 characters from [a-zA-Z0-9-]. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key);
}
