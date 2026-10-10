import "server-only";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { buildIndexNowPayload, canonicalIndexNowUrls, INDEXNOW_ENDPOINT, INDEXNOW_MAX_URLS, indexNowKeyLocation, isValidIndexNowKey, parseRetryAfter } from "@/lib/indexnow-payload";
import { PermanentJobError, TransientJobError, jobPriority } from "@/lib/jobs/policy";
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

export type IndexNowResult = {
  ok: boolean;
  /** the endpoint's HTTP status; 0 when nothing was sent or the request got no answer */
  status: number;
  submitted: number;
  skipped?: string;
  keyLocation: string;
  urls: string[];
  /** paths that are not on the canonical origin and were left out */
  rejected: string[];
  /** network failure or timeout */
  error?: string;
  retryAfterMs?: number;
};

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

/**
 * Submits absolute canonical URLs, in requests of at most 10,000 (the protocol's limit), stopping
 * at the first request that is not accepted. Called by the job queue and by the admin IndexNow tool.
 * "Accepted" (200/202) means the endpoint received the URLs; it says nothing about indexing.
 */
export async function submitIndexNow(paths: string[]): Promise<IndexNowResult> {
  const key = indexNowKey();
  const { urls, rejected } = canonicalIndexNowUrls(site.url, paths);
  if (rejected.length) console.warn(`[indexnow] ${rejected.length} path(s) not on ${site.url} left out: ${rejected.slice(0, 5).join(", ")}`);
  const base = { keyLocation: indexNowKeyLocationUrl(), urls, rejected };
  if (urls.length === 0) return { ...base, ok: true, status: 0, submitted: 0, skipped: "nothing to submit" };
  if (!env.indexNow.enabled) return { ...base, ok: true, status: 0, submitted: 0, skipped: "disabled outside production" };
  let submitted = 0;
  let status = 0;
  for (let i = 0; i < urls.length; i += INDEXNOW_MAX_URLS) {
    const payload = buildIndexNowPayload(site.url, key, urls.slice(i, i + INDEXNOW_MAX_URLS), env.indexNow.keyLocation);
    let res: Response;
    try {
      res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn(`[indexnow] request failed after ${submitted} url(s): ${error}`);
      return { ...base, ok: false, status: 0, submitted, error };
    }
    status = res.status;
    if (status !== 200 && status !== 202) {
      console.warn(`[indexnow] endpoint answered ${status} for ${payload.urlList.length} url(s) keyLocation=${payload.keyLocation}`);
      return { ...base, ok: false, status, submitted, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")) };
    }
    submitted += payload.urlList.length;
    console.log(`[indexnow] submitted ${payload.urlList.length} url(s) (${status}) keyLocation=${payload.keyLocation}`);
  }
  return { ...base, ok: true, status, submitted };
}

/**
 * What a job does with a submission: a summary when it was accepted (or deliberately not sent),
 * otherwise an error the queue can classify. Rate limits, server errors and network failures are
 * retried later; a refused key or out-of-scope URLs will not get better by retrying.
 */
export function indexNowJobOutcome(result: IndexNowResult): string {
  const left = result.rejected.length ? `; ${result.rejected.length} path(s) not on this site left out (${result.rejected.slice(0, 3).join(", ")})` : "";
  if (result.skipped) return `Not sent: ${result.skipped}${left}`;
  if (result.ok) return `IndexNow ${result.status}: ${result.submitted} URL(s) ${result.status === 200 ? "accepted" : "received (key validation pending)"}${left}`;
  const done = result.submitted ? ` after ${result.submitted} URL(s) had been accepted` : "";
  if (result.status === 0) throw new TransientJobError(`IndexNow request failed${done}: ${result.error ?? "no response"}`);
  if (result.status === 429) throw new TransientJobError(`IndexNow is rate-limiting this host (429)${done}.`, Math.max(result.retryAfterMs ?? 0, 10 * 60_000));
  if (result.status >= 500) throw new TransientJobError(`IndexNow server error ${result.status}${done}.`, result.retryAfterMs);
  if ([400, 403, 422].includes(result.status)) throw new PermanentJobError(`IndexNow refused the submission (${result.status})${done}: ${describeIndexNowStatus(result.status)} keyLocation ${result.keyLocation}`);
  throw new TransientJobError(`IndexNow answered ${result.status}${done}.`, result.retryAfterMs);
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

/** The one waiting ping that new paths are added to. */
export const INDEXNOW_OPEN_BATCH = "indexnow_ping:open";
/** A new batch waits this long for more paths before it is sent, so a burst of saves becomes one request. */
const COALESCE_MS = 60_000;

/**
 * Queues changed pages for IndexNow. Paths are added to the waiting batch (under a lock) instead
 * of one job per save; a full batch is sealed and a new one opened. Never throws: telling search
 * engines must not break a save.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  const fresh = [...new Set(paths.filter((p) => typeof p === "string" && p.trim()))];
  if (fresh.length === 0) return;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4207150002)`;
      let todo = fresh;
      const open = await tx.job.findFirst({ where: { type: "indexnow_ping", status: "pending", dedupeKey: INDEXNOW_OPEN_BATCH }, select: { id: true, payloadJson: true } });
      if (open) {
        const merged = [...new Set([...pathsOf(open.payloadJson), ...todo])];
        await tx.job.update({ where: { id: open.id }, data: { payloadJson: JSON.stringify({ paths: merged.slice(0, INDEXNOW_MAX_URLS) }), ...(merged.length >= INDEXNOW_MAX_URLS ? { dedupeKey: null } : {}) } });
        todo = merged.slice(INDEXNOW_MAX_URLS);
      }
      for (let i = 0; i < todo.length; i += INDEXNOW_MAX_URLS) {
        const chunk = todo.slice(i, i + INDEXNOW_MAX_URLS);
        await tx.job.create({ data: { type: "indexnow_ping", payloadJson: JSON.stringify({ paths: chunk }), runAt: new Date(Date.now() + COALESCE_MS), maxAttempts: 5, priority: jobPriority("indexnow_ping"), dedupeKey: chunk.length < INDEXNOW_MAX_URLS ? INDEXNOW_OPEN_BATCH : null } });
      }
    });
  } catch (err) {
    console.error("[indexnow] could not queue ping", err);
  }
}

export function pathsOf(payloadJson: string): string[] {
  try {
    const p = JSON.parse(payloadJson) as { paths?: unknown };
    return Array.isArray(p.paths) ? p.paths.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
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
