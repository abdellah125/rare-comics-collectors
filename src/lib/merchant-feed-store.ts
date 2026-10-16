import "server-only";
import { gzipSync } from "node:zlib";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { merchantFeed } from "@/lib/merchant-feed";
import { FEED_MAX_BYTES } from "@/lib/merchant-feed-xml";

/**
 * The Google Merchant Center feed is built by a job (feed_publish, every 15 minutes) and kept as one
 * gzip file in our Blob storage. Both feed addresses stream that one file.
 *
 * Before this, each address was a cached page that Vercel regenerated on its own. Copies of different
 * ages lived side by side (per region and per Accept-Encoding variant), so one request got the current
 * feed and the next a copy three days old, with prices and stock that no longer matched the site:
 * exactly what makes Merchant Center disapprove products. One file, one age, everywhere.
 */
const PATH = "feeds/google-shopping-feed.xml.gz";
const META_KEY = "feed.google.latest";

export type PublishedFeed = { url: string; generatedAt: string; items: number; skipped: number; bytes: number };

export async function publishedFeed(): Promise<PublishedFeed | null> {
  const row = await db.setting.findUnique({ where: { key: META_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as PublishedFeed;
  } catch {
    return null;
  }
}

/** Builds the feed and replaces the stored file. Returns what was published. */
export async function publishFeed(): Promise<PublishedFeed> {
  const { xml, included, skipped } = await merchantFeed({ maxBytes: Number.POSITIVE_INFINITY });
  const body = gzipSync(xml, { level: 9 });
  if (body.byteLength > FEED_MAX_BYTES) console.error(`[merchant-feed] compressed feed is ${body.byteLength} bytes`);
  const { put } = await import("@vercel/blob");
  const saved = await put(PATH, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/gzip", cacheControlMaxAge: 60, token: env.blobToken });
  const meta: PublishedFeed = { url: saved.url, generatedAt: new Date().toISOString(), items: included, skipped: skipped.length, bytes: body.byteLength };
  await db.setting.upsert({ where: { key: META_KEY }, create: { key: META_KEY, value: JSON.stringify(meta) }, update: { value: JSON.stringify(meta) } });
  return meta;
}

/**
 * The gzip bytes of the current feed and its counts. Without Blob storage (local development) the feed
 * is built for the request; with it, the stored file is streamed and only built here the very first time.
 */
export async function feedBody(): Promise<{ body: BodyInit; items: number; skipped: number; generatedAt: string } | null> {
  if (!env.blobToken) {
    const { xml, included, skipped } = await merchantFeed({ maxBytes: Number.POSITIVE_INFINITY });
    return { body: new Uint8Array(gzipSync(xml, { level: 9 })) as Uint8Array<ArrayBuffer>, items: included, skipped: skipped.length, generatedAt: new Date().toISOString() };
  }
  const meta = (await publishedFeed()) ?? (await publishFeed());
  // A cache-busting query: the file is replaced in place under the same name.
  const res = await fetch(`${meta.url}?v=${encodeURIComponent(meta.generatedAt)}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok || !res.body) return null;
  return { body: res.body, items: meta.items, skipped: meta.skipped, generatedAt: meta.generatedAt };
}

export const feedHeaders = (f: { items: number; skipped: number; generatedAt: string }) => ({
  // Short: the file changes every 15 minutes, and Merchant Center must never see an old copy.
  "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
  "x-robots-tag": "noindex",
  "x-feed-items": String(f.items),
  "x-feed-skipped": String(f.skipped),
  "x-feed-generated": f.generatedAt,
  "last-modified": new Date(f.generatedAt).toUTCString(),
});
