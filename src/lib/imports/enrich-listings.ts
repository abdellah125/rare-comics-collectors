import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { coverAlt, isKnown } from "@/lib/catalog/labels";
import { isChallengePage, parseListingPage, storedPhotoPath, type ListingPhoto } from "@/lib/imports/listing-page";
import { robotsAllows, robotsRules, type RobotsRules } from "@/lib/imports/robots";
import { IMPORT_SOURCE } from "@/lib/imports/status";
import { parseJsonObject } from "@/lib/json";

/**
 * Reads each released listing's own page at the source, once: every photo of the listing is copied
 * into our storage (so product pages no longer load pictures from the source's servers), and the
 * details the seller filled in ("Item Specifics") complete what the product does not know yet.
 *
 * How the source is approached, on purpose:
 *  - as itself: a named user agent with a contact address, never a disguised browser;
 *  - only listing pages, only when robots.txt allows the path, one at a time, waiting the
 *    Crawl-delay it asks for (5 s at the time of writing) between pages;
 *  - a refusal (403, 429, an anti-bot page) ends the run and nothing is tried to get around it.
 * Nothing is invented: a detail is filled only when the product has none, with the seller's own value.
 */
export const SOURCE_BOT_UA = "RareComicsCollectorsBot/1.0 (+https://www.rarecomicscollectors.com/contact; contact@rarecomicscollectors.com)";
const SOURCE_ORIGIN = "https://www.hipcomic.com";
const LISTING_PATH = /^\/listing\/[^?#]+$/;
const PHOTO_HOST = "https://img.hipcomic.com/";
const MAX_PHOTOS = 8;
const MAX_ATTEMPTS = 3;

class SourceRefused extends Error {}

export type EnrichResult = { done: number; photos: number; filled: number; gone: number; failed: number; remaining: number; stopped?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadRobots(): Promise<RobotsRules | null> {
  try {
    const res = await fetch(`${SOURCE_ORIGIN}/robots.txt`, { headers: { "user-agent": SOURCE_BOT_UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return robotsRules(await res.text(), SOURCE_BOT_UA);
  } catch {
    return null;
  }
}

async function fetchPhoto(url: string): Promise<{ buf: Buffer; type: string } | null> {
  const res = await fetch(url, { headers: { "user-agent": SOURCE_BOT_UA, accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new SourceRefused(`the photo host answered HTTP ${res.status}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") ?? "image/jpeg";
  return buf.length >= 2_000 && type.startsWith("image/") ? { buf, type } : null;
}

/** Writes one file into our photo storage and returns its public address. */
export type PhotoStore = (path: string, buf: Buffer, contentType: string) => Promise<string>;

const blobStore: PhotoStore = async (path, buf, contentType) => {
  const { put } = await import("@vercel/blob");
  return (await put(path, buf, { access: "public", addRandomSuffix: false, allowOverwrite: true, token: env.blobToken, cacheControlMaxAge: 31_536_000, contentType })).url;
};

/** Copies a photo (800 px and its 300 px sibling) into our storage; the address of the 800 px copy, or null. */
async function storePhoto(p: ListingPhoto, save: PhotoStore): Promise<string | null> {
  const large = await fetchPhoto(p.large);
  if (!large) return null;
  const small = await fetchPhoto(p.small);
  // The small copy first: a product must never point at a large photo whose small sibling is missing.
  await save(storedPhotoPath(p.hash, 300), (small ?? large).buf, (small ?? large).type);
  return save(storedPhotoPath(p.hash, 800), large.buf, large.type);
}

export async function enrichListings(opts: { budgetMs?: number; max?: number; store?: PhotoStore; ids?: string[] } = {}): Promise<EnrichResult> {
  const result: EnrichResult = { done: 0, photos: 0, filled: 0, gone: 0, failed: 0, remaining: 0 };
  const where = { source: IMPORT_SOURCE, enrichedAt: null, enrichAttempts: { lt: MAX_ATTEMPTS }, sourceUrl: { not: null }, productId: { not: null }, ...(opts.ids ? { id: { in: opts.ids } } : {}) };
  const save = opts.store ?? blobStore;
  const finish = async (stopped?: string): Promise<EnrichResult> => ({ ...result, remaining: await db.importItem.count({ where }), ...(stopped ? { stopped } : {}) });
  if (!opts.store && !env.blobToken) return finish("photo storage (BLOB_READ_WRITE_TOKEN) is not configured");
  if ((await db.importItem.count({ where })) === 0) return finish();

  const rules = await loadRobots();
  if (!rules) return finish("the source's robots.txt could not be read");
  const delayMs = Math.max(5, rules.crawlDelay ?? 5) * 1000;
  const deadline = Date.now() + (opts.budgetMs ?? 200_000);
  const publishers = new Map((await db.product.groupBy({ by: ["publisher"], _count: { _all: true } })).filter((p) => isKnown(p.publisher)).map((p) => [p.publisher.toLowerCase(), p.publisher]));
  const publisherName = (raw: string) => publishers.get(raw.toLowerCase()) ?? publishers.get(`${raw.toLowerCase()} comics`) ?? raw;

  let lastPage = 0;
  let emptyInARow = 0;
  try {
    for (let n = 0; n < (opts.max ?? 1_000) && Date.now() < deadline; n++) {
      const item = await db.importItem.findFirst({
        where,
        orderBy: { id: "asc" },
        select: { id: true, sourceUrl: true, enrichAttempts: true, attributesJson: true, product: { select: { id: true, title: true, issue: true, publisher: true, year: true, grader: true, grade: true, label: true, attributesJson: true } } },
      });
      if (!item || !item.product) break;
      const product = item.product;
      const settle = (data: { enrichNote: string; done?: boolean }) => db.importItem.update({ where: { id: item.id }, data: { enrichNote: data.enrichNote.slice(0, 300), ...(data.done ? { enrichedAt: new Date() } : { enrichAttempts: item.enrichAttempts + 1 }) } });

      let url: URL;
      try {
        url = new URL(item.sourceUrl!);
      } catch {
        await settle({ enrichNote: "the listing address is not a valid URL", done: true });
        continue;
      }
      if (url.origin !== SOURCE_ORIGIN || !LISTING_PATH.test(url.pathname) || !robotsAllows(rules, url.pathname)) {
        await settle({ enrichNote: "not a listing page the source's robots.txt allows", done: true });
        continue;
      }

      const wait = lastPage + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastPage = Date.now();
      let res: Response;
      try {
        res = await fetch(`${SOURCE_ORIGIN}${url.pathname}`, { headers: { "user-agent": SOURCE_BOT_UA, accept: "text/html" }, signal: AbortSignal.timeout(25_000) });
      } catch (err) {
        result.failed += 1;
        await settle({ enrichNote: `the listing page could not be fetched: ${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 429 || res.headers.get("cf-mitigated")) throw new SourceRefused(`the source answered HTTP ${res.status} for a listing page`);
      if (res.status === 404 || res.status === 410) {
        result.gone += 1;
        await settle({ enrichNote: `the listing page no longer exists at the source (HTTP ${res.status})`, done: true });
        continue;
      }
      if (!res.ok) {
        result.failed += 1;
        await settle({ enrichNote: `the listing page answered HTTP ${res.status}` });
        continue;
      }
      const html = await res.text();
      if (isChallengePage(html)) throw new SourceRefused("the source showed an anti-bot page");
      const page = parseListingPage(html);
      if (page.photos.length === 0) {
        result.failed += 1;
        emptyInARow += 1;
        await settle({ enrichNote: "no photos were found on the listing page" });
        // Several in a row means the page layout changed: stop rather than mark the whole catalogue as failed.
        if (emptyInARow >= 5) return finish("listing pages no longer have the expected photo gallery");
        continue;
      }
      emptyInARow = 0;

      const stored: string[] = [];
      for (const p of page.photos.slice(0, MAX_PHOTOS)) {
        const saved = await storePhoto(p, save).catch((err) => {
          if (err instanceof SourceRefused) throw err;
          console.error(`[import enrich] photo ${p.hash} of item ${item.id} not stored: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        });
        if (saved) stored.push(saved);
        await sleep(250);
      }
      if (stored.length === 0) {
        result.failed += 1;
        await settle({ enrichNote: "the listing's photos could not be copied" });
        continue;
      }

      // Details the seller filled in, only where the product has none.
      const attributes = (parseJsonObject<Record<string, unknown>>(product.attributesJson) ?? {}) as Record<string, unknown>;
      const filled: string[] = [];
      const add = (key: string, value: string | undefined) => {
        if (!value || (typeof attributes[key] === "string" && (attributes[key] as string).trim())) return;
        attributes[key] = value;
        filled.push(key.toLowerCase());
      };
      add("Character", page.specifics["Main Character"]);
      add("Genre", page.specifics["Genre"]);
      add("Series", page.specifics["Series Name"]);
      const publisher = !isKnown(product.publisher) && page.specifics["Publisher"] ? publisherName(page.specifics["Publisher"]) : null;
      if (publisher) filled.push("publisher");

      const facts = { ...product, publisher: publisher ?? product.publisher };
      await db.$transaction([
        // Photos shown from the source's servers, and any earlier copy of ours, make way for the full set.
        db.productImage.deleteMany({ where: { productId: product.id, OR: [{ url: { startsWith: PHOTO_HOST } }, { url: { contains: "/products/hip/" } }] } }),
        db.productImage.updateMany({ where: { productId: product.id }, data: { position: { increment: stored.length } } }),
        db.productImage.createMany({ data: stored.map((u, i) => ({ productId: product.id, url: u, position: i, alt: coverAlt(facts, { index: i + 1, total: stored.length }) })) }),
        db.product.update({ where: { id: product.id }, data: { attributesJson: JSON.stringify(attributes), ...(publisher ? { publisher } : {}) } }),
        db.importItem.update({
          where: { id: item.id },
          data: {
            imageUrl: stored[0],
            enrichedAt: new Date(),
            enrichNote: `${stored.length} photo(s) stored${filled.length ? `; filled ${filled.join(", ")}` : ""}${page.availability === "out_of_stock" ? "; the source shows this listing as no longer available" : ""}`.slice(0, 300),
            ...(publisher ? { publisher } : {}),
          },
        }),
      ]);
      result.done += 1;
      result.photos += stored.length;
      if (filled.length) result.filled += 1;
    }
  } catch (err) {
    if (err instanceof SourceRefused) return finish(`${err.message}; stopped, nothing was tried to get around it`);
    throw err;
  }
  return finish();
}

/** For the admin page: how far the photo copy and the listing-page pass have come. */
export async function enrichProgress(): Promise<{ stored: number; onSource: number; failed: number; pagesDone: number; pagesTotal: number; pagesPausedUntil: Date | null; soldAtSource: number }> {
  const base = { source: IMPORT_SOURCE, productId: { not: null } };
  const [stored, onSource, failed, pagesTotal, pagesDone, soldAtSource, pause] = await Promise.all([
    db.productImage.count({ where: { url: { contains: "/products/hip/" } } }),
    db.productImage.count({ where: { url: { startsWith: `${PHOTO_HOST}p/` }, copyAttempts: { lt: MAX_ATTEMPTS } } }),
    db.productImage.count({ where: { url: { startsWith: `${PHOTO_HOST}p/` }, copyAttempts: { gte: MAX_ATTEMPTS } } }),
    db.importItem.count({ where: base }),
    db.importItem.count({ where: { ...base, enrichedAt: { not: null } } }),
    db.importItem.count({ where: { ...base, enrichNote: { contains: "no longer available" } } }),
    db.setting.findUnique({ where: { key: "imports.enrich.pagesRefusedUntil" } }),
  ]);
  const until = pause ? new Date(JSON.parse(pause.value) as string) : null;
  return { stored, onSource, failed, pagesDone, pagesTotal, pagesPausedUntil: until && until > new Date() ? until : null, soldAtSource };
}

export type CopyResult = { copied: number; failed: number; remaining: number; stopped?: string };

/**
 * Copies photos that products still show from the source's photo host into our storage, and gives
 * each a descriptive alt text. Needs no listing page: the photo address came with the import data.
 * One photo at a time with a short pause; a refusal by the photo host ends the run.
 */
export async function copySourcePhotos(opts: { budgetMs?: number; max?: number; store?: PhotoStore; productIds?: string[] } = {}): Promise<CopyResult> {
  const result: CopyResult = { copied: 0, failed: 0, remaining: 0 };
  const where = { url: { startsWith: `${PHOTO_HOST}p/` }, copyAttempts: { lt: MAX_ATTEMPTS }, ...(opts.productIds ? { productId: { in: opts.productIds } } : {}) };
  const finish = async (stopped?: string): Promise<CopyResult> => ({ ...result, remaining: await db.productImage.count({ where }), ...(stopped ? { stopped } : {}) });
  if (!opts.store && !env.blobToken) return finish("photo storage (BLOB_READ_WRITE_TOKEN) is not configured");
  const save = opts.store ?? blobStore;
  const deadline = Date.now() + (opts.budgetMs ?? 150_000);
  try {
    while (Date.now() < deadline && result.copied + result.failed < (opts.max ?? 100_000)) {
      const batch = await db.productImage.findMany({
        where,
        orderBy: { id: "asc" },
        take: 25,
        select: { id: true, url: true, position: true, productId: true, product: { select: { title: true, issue: true, publisher: true, year: true, grader: true, grade: true, label: true, _count: { select: { images: true } } } } },
      });
      if (batch.length === 0) break;
      for (const img of batch) {
        if (Date.now() >= deadline) break;
        const hash = /\/p\/([0-9a-f]{16,64})(?:-\d+)?\.jpe?g$/i.exec(img.url)?.[1];
        let stored: string | null = null;
        if (hash) {
          stored = await storePhoto({ hash, large: `${PHOTO_HOST}p/${hash}-800.jpg`, small: `${PHOTO_HOST}p/${hash}-300.jpg` }, save).catch((err) => {
            if (err instanceof SourceRefused) throw err;
            console.error(`[import photos] ${img.url} not copied: ${err instanceof Error ? err.message : String(err)}`);
            return null;
          });
        }
        if (!stored) {
          result.failed += 1;
          await db.productImage.update({ where: { id: img.id }, data: { copyAttempts: { increment: 1 } } });
        } else {
          await db.$transaction([
            db.productImage.update({ where: { id: img.id }, data: { url: stored, sourceUrl: img.url, alt: coverAlt(img.product, { index: img.position + 1, total: img.product._count.images }) } }),
            // The queue item's own copy of the address follows, when it was this photo.
            db.importItem.updateMany({ where: { productId: img.productId, OR: [{ imageUrl: img.url }, { imageUrl: null, sourceImage: img.url }] }, data: { imageUrl: stored } }),
          ]);
          result.copied += 1;
        }
        await sleep(150);
      }
    }
  } catch (err) {
    if (err instanceof SourceRefused) return finish(`${err.message}; stopped, nothing was tried to get around it`);
    throw err;
  }
  return finish();
}
