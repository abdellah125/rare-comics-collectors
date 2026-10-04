import "server-only";
import { revalidatePath } from "next/cache";
import type { ImportItem, ImportRun, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { saveUpload } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import { reprice, retailPrice } from "@/lib/imports/pricing";
import { loadSeoContext, recommendSeo } from "@/lib/imports/seo";
import { defaultSeoTitle, type SeoFacts } from "@/lib/imports/seo-rules";
import { readSource, SourceFormatError, type SourceRow } from "@/lib/imports/source";
import { dedupeKey, releaseProblems } from "@/lib/imports/status";
import { ADULT, PALETTES, buildListing, cadRateOf, slugify, usdPrice } from "../../../scripts/lib/hipcomic-listing.mjs";
import { CGC_GRADES, eraForYear, parseTitle, tidyCase } from "../../../scripts/lib/hipcomic-title.mjs";

/**
 * The import pipeline: source data → review queue → (admin approval) → ready → (admin release) → listing.
 *
 * Nothing becomes public on its own. `runImport` only ever writes ImportItem rows; a Product is
 * created or published in exactly one place, `releaseItems`, which an admin has to call.
 */

type LogEntry = { level: "info" | "warn" | "error"; text: string };
const ERA_CATEGORY: Record<string, string> = { "Golden Age": "golden-age", "Silver Age": "silver-age", "Bronze Age": "bronze-age", "Copper Age": "copper-age", "Modern Age": "modern-age" };
const json = (v: unknown) => JSON.stringify(v);
const list = (s: string): string[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

type BuiltListing = { slug: string; title: string; issue: string; publisher: string; year: number; era: string; grader: string; grade: string; label: string; certNumber: string | null; keyIssue: string | null; summary: string; description: string; highlights: string[]; attributes: Record<string, string>; tags: string[] };
type Parsed = { series: string | null; issue: string | null; volume: string | null; year: number | null; era: string | null; grader: string | null; grade: string | null; label: string | null; pageQuality: string | null; certNumber: string | null; publisher: string | null; notes: string | null; holds: string[] };

/** Title parse plus any structured columns the data carries; a structured value wins over the title. */
function classify(row: SourceRow): { p: Parsed; reasons: string[] } {
  const p = { ...(parseTitle(row.title, { seller: row.seller }) as unknown as Parsed) };
  let holds = [...p.holds];
  const drop = (prefix: string) => {
    holds = holds.filter((h) => !h.startsWith(prefix));
  };
  const x = row.extra;
  if (x.series) {
    p.series = tidyCase(x.series) as string;
    drop("series title could not be read");
  }
  if (x.issue) {
    const n = x.issue.replace(/^#/, "").trim();
    if (/^[\w./-]{1,12}$/.test(n)) {
      p.issue = /^nn$/i.test(n) ? "nn" : `#${n}`;
      drop("no issue number");
    }
  }
  if (x.publisher) {
    p.publisher = x.publisher;
    drop("publisher not stated");
    drop("more than one publisher");
  }
  if (/^(19[3-9]\d|20[0-3]\d)$/.test(x.year)) {
    p.year = Number(x.year);
    p.era = eraForYear(p.year) as string | null;
    drop("no publication year");
    drop("more than one year");
    if (p.era) drop("published before 1938");
  }
  if (/^(CGC|CBCS|PGX)$/i.test(x.grader)) {
    p.grader = x.grader.toUpperCase();
    drop("no grading company");
  }
  const grade = x.grade === "10" ? "10.0" : x.grade;
  if (grade && (CGC_GRADES as Record<string, string>)[grade]) {
    p.grade = grade;
    drop("no numeric grade");
    drop("more than one grade");
  }
  if (/^\d{7,12}(?:-\d{1,3})?$/.test(x.cert)) p.certNumber = x.cert;
  const reasons = [...row.problems];
  if (row.auction) reasons.push("auction listing (current bid, not a fixed price)");
  if (ADULT.test(row.title)) reasons.push("adult-variant wording (needs a manual look before Merchant Center)");
  reasons.push(...holds);
  return { p, reasons };
}

type ExistingItem = Pick<ImportItem, "id" | "sourceId" | "status" | "certNumber" | "dedupeKey" | "sourcePrice" | "retailPrice" | "priceManual" | "markupBps" | "productId" | "editedJson" | "sourceTitle" | "sourceSeller" | "sourceImage" | "available" | "slug" | "imageUrl"> & {
  product: { id: string; price: number; status: string; stock: number; slug: string } | null;
};

export type ImportInput = { source: string; kind: "csv_upload" | "feed"; fileName: string; text: string; snapshot?: boolean; startedById?: string | null };

export async function runImport(input: ImportInput): Promise<ImportRun> {
  const run = await db.importRun.create({ data: { source: input.source, kind: input.kind, fileName: input.fileName.slice(0, 200), startedById: input.startedById ?? null } });
  const log: LogEntry[] = [];
  const say = (level: LogEntry["level"], text: string) => {
    if (log.length < 300) log.push({ level, text });
  };
  const counts = { rows: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, errors: 0, priceChanges: 0, unavailable: 0 };
  try {
    const rows = readSource(input.text, input.fileName);
    counts.rows = rows.length;
    const settings = await getSettings();
    const markupBps = settings["imports.markupBps"];
    const autoSync = settings["imports.autoPriceSync"];
    const cadRate = cadRateOf(rows) as number | null;

    const [items, products] = await Promise.all([
      db.importItem.findMany({
        where: { source: input.source },
        select: { id: true, sourceId: true, status: true, certNumber: true, dedupeKey: true, sourcePrice: true, retailPrice: true, priceManual: true, markupBps: true, productId: true, editedJson: true, sourceTitle: true, sourceSeller: true, sourceImage: true, available: true, slug: true, imageUrl: true, product: { select: { id: true, price: true, status: true, stock: true, slug: true } } },
      }),
      db.product.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, certNumber: true, publisher: true, title: true, issue: true, grade: true, grader: true, label: true } }),
    ]);
    const bySourceId = new Map<string, ExistingItem>(items.map((i) => [i.sourceId, i]));
    const takenSlugs = new Set<string>([...products.map((p) => p.slug), ...items.map((i) => i.slug).filter(Boolean)]);
    const linkedProducts = new Set(items.map((i) => i.productId).filter(Boolean));
    const certOwner = new Map<string, string>();
    const keyOwner = new Map<string, string>();
    for (const p of products) {
      if (linkedProducts.has(p.id)) continue; // an item's own product is not its duplicate
      if (p.certNumber) certOwner.set(p.certNumber, `listing ${p.slug}`);
      const key = dedupeKey(p);
      if (key) keyOwner.set(key, `listing ${p.slug}`);
    }
    for (const i of items) {
      if (i.status === "rejected") continue;
      if (i.certNumber) certOwner.set(i.certNumber, `queue item ${i.sourceId}`);
      if (i.dedupeKey && !keyOwner.has(i.dedupeKey)) keyOwner.set(i.dedupeKey, `queue item ${i.sourceId}`);
    }
    const photoOwner = new Map<string, string>(items.map((i) => [`${i.sourceSeller}|${i.sourceTitle}|${i.sourceImage}`, i.sourceId]));

    const seen = new Set<string>();
    const fresh: { row: SourceRow; data: Prisma.ImportItemCreateManyInput; facts: (SeoFacts & { era: string }) | null }[] = [];
    const touchedSlugs = new Set<string>();

    for (const row of rows) {
      if (!row.sourceId) {
        counts.errors += 1;
        say("error", `${row.file} row ${row.line}: ${row.problems.join("; ") || "no identifier"} — skipped`);
        continue;
      }
      if (seen.has(row.sourceId)) {
        counts.duplicates += 1;
        say("info", `${row.sourceId}: listed twice in the file (page overlap or sponsored repeat) — second row ignored`);
        continue;
      }
      seen.add(row.sourceId);
      const usd = usdPrice(row, cadRate) as { price: number | null; priceNote: string | null; reason: string | null };

      // ── known item: synchronise, never re-create
      const existing = bySourceId.get(row.sourceId);
      if (existing) {
        const data: Prisma.ImportItemUpdateInput = { lastSeenAt: new Date() };
        let changed = false;
        if (row.available === false && existing.available) {
          changed = true;
          counts.unavailable += 1;
          Object.assign(data, await markUnavailable(existing, say));
        } else if (row.available === true && !existing.available) {
          changed = true;
          data.available = true;
          say("warn", `${row.sourceId}: available again at the source. Stock was not changed; review it.`);
        }
        if (usd.price !== null && usd.price >= 100 && usd.price !== existing.sourcePrice) {
          changed = true;
          counts.priceChanges += 1;
          const manual = existing.priceManual || Boolean(existing.product && existing.retailPrice !== null && existing.product.price !== existing.retailPrice);
          const current = manual && existing.product ? existing.product.price : existing.retailPrice;
          const r = reprice({ newSource: usd.price, markupBps: existing.markupBps, currentRetail: current, manual, autoSync });
          Object.assign(data, { sourcePrice: usd.price, sourceAmount: row.price, sourceCurrency: row.currency ?? "USD", priceNote: usd.priceNote, retailPrice: r.retail, priceManual: r.manual, priceChangeNote: r.note });
          if (existing.product && existing.product.price !== r.retail && !r.manual) {
            await db.product.update({ where: { id: existing.product.id }, data: { price: r.retail } });
            if (existing.product.status === "published") touchedSlugs.add(existing.product.slug);
          }
          say(r.manual ? "warn" : "info", `${row.sourceId}: source price ${money(existing.sourcePrice)} → ${money(usd.price)}; ${r.manual ? `manual selling price ${money(r.retail)} kept` : `selling price now ${money(r.retail)}`}`);
        }
        if (row.title && row.title !== existing.sourceTitle) {
          changed = true;
          data.sourceTitle = row.title;
          if (existing.status === "pending_review" || existing.status === "error") {
            Object.assign(data, refreshFields(row, existing, usd, takenSlugs));
            say("info", `${row.sourceId}: source title changed; fields nobody edited were refreshed`);
          } else say("warn", `${row.sourceId}: source title changed after review; our copy was left as it is`);
        }
        if (row.image && !existing.imageUrl && row.image !== existing.sourceImage) {
          changed = true;
          data.sourceImage = row.image;
        }
        await db.importItem.update({ where: { id: existing.id }, data });
        if (changed) counts.updated += 1;
        else counts.unchanged += 1;
        continue;
      }

      // ── new item
      const { p, reasons } = classify(row);
      if (usd.reason) reasons.push(usd.reason);
      if (usd.price !== null && usd.price < 100) reasons.push("price under $1");
      const base: Prisma.ImportItemCreateManyInput = {
        source: input.source,
        sourceId: row.sourceId,
        sourceUrl: row.url,
        sourceSeller: row.seller || null,
        sourceTitle: row.title || "(no title)",
        sourceImage: row.image,
        sourceCurrency: row.currency ?? "USD",
        sourceAmount: row.price,
        sourcePrice: usd.price,
        priceNote: usd.priceNote,
        markupBps,
        retailPrice: usd.price !== null ? retailPrice(usd.price, markupBps) : null,
        available: row.available !== false,
        variant: row.extra.variant || null,
        runId: run.id,
        importFile: row.file,
      };
      if (row.available === false) reasons.push("marked unavailable at the source");
      if (reasons.length > 0) {
        counts.created += 1;
        counts.errors += 1;
        fresh.push({ row, facts: null, data: { ...base, status: "error", problemsJson: json(reasons), title: p.series ?? "", issue: p.issue ?? "", publisher: p.publisher ?? "", year: p.year, era: p.era ?? "", grader: p.grader ?? "", grade: p.grade ?? "", label: p.label ?? "Universal Blue", certNumber: p.certNumber, description: row.extra.description } });
        continue;
      }
      const l = buildListing({ row, p, price: usd.price, priceNote: usd.priceNote }, takenSlugs) as unknown as BuiltListing;
      const key = dedupeKey({ ...l, variant: row.extra.variant });
      let status = "pending_review";
      let duplicateStatus = "unique";
      let duplicateOf: string | null = null;
      const photoKey = `${row.seller}|${row.title}|${row.image}`;
      if (l.certNumber && certOwner.has(l.certNumber)) {
        status = "duplicate";
        duplicateStatus = "duplicate";
        duplicateOf = `Certification number ${l.certNumber} is already on ${certOwner.get(l.certNumber)}`;
      } else if (photoOwner.has(photoKey)) {
        status = "duplicate";
        duplicateStatus = "duplicate";
        duplicateOf = `Same seller, title and photo as queue item ${photoOwner.get(photoKey)}`;
      } else if (key && keyOwner.has(key)) {
        duplicateStatus = "possible";
        duplicateOf = `Same publisher, title, issue, grade, grader and label as ${keyOwner.get(key)} (may be a second copy)`;
      }
      if (status === "duplicate") {
        counts.duplicates += 1;
        takenSlugs.delete(l.slug);
      } else {
        if (l.certNumber) certOwner.set(l.certNumber, `queue item ${row.sourceId}`);
        if (key && !keyOwner.has(key)) keyOwner.set(key, `queue item ${row.sourceId}`);
        photoOwner.set(photoKey, row.sourceId);
      }
      counts.created += 1;
      fresh.push({
        row,
        facts: { title: l.title, issue: l.issue, publisher: l.publisher, year: l.year, grader: l.grader, grade: l.grade, label: l.label, keyIssue: l.keyIssue, slug: l.slug, era: l.era },
        data: { ...base, status, duplicateStatus, duplicateOf, dedupeKey: key, title: l.title, issue: l.issue, publisher: l.publisher, year: l.year, era: l.era, grader: l.grader, grade: l.grade, label: l.label, certNumber: l.certNumber, keyIssue: l.keyIssue, summary: l.summary, description: l.description, highlightsJson: json(l.highlights), attributesJson: json(l.attributes), tagsJson: json(l.tags), slug: l.slug },
      });
    }

    // SEO recommendations for everything new, from one set of lookups.
    const withFacts = fresh.filter((f) => f.facts);
    if (withFacts.length > 0) {
      const ctx = await loadSeoContext(withFacts.map((f) => f.facts!));
      for (const f of withFacts) {
        const rec = recommendSeo(f.facts!, ctx);
        Object.assign(f.data, { seoTitle: rec.seoTitle, seoDescription: rec.seoDescription, primaryKeyword: rec.primaryKeyword, secondaryKeywordsJson: json(rec.secondaryKeywords), searchIntent: rec.searchIntent, internalLinksJson: json(rec.internalLinks), seoNotesJson: json(rec.notes), seoStatus: rec.status });
      }
    }
    for (let i = 0; i < fresh.length; i += 200) await db.importItem.createMany({ data: fresh.slice(i, i + 200).map((f) => f.data), skipDuplicates: true });

    // A complete snapshot: what it no longer lists is no longer for sale at the source.
    if (input.snapshot && rows.length > 0) {
      const gone = items.filter((i) => i.available && !seen.has(i.sourceId) && !["rejected", "duplicate"].includes(i.status));
      for (const item of gone) {
        await db.importItem.update({ where: { id: item.id }, data: await markUnavailable(item, say) });
        counts.unavailable += 1;
      }
    }
    for (const slug of touchedSlugs) revalidatePathSafe(`/store/${slug}`);
    if (touchedSlugs.size > 0 || counts.unavailable > 0) for (const path of ["/store", "/google-shopping-feed.xml"]) revalidatePathSafe(path);

    const message = `${counts.rows} rows: ${counts.created} new (of which ${counts.duplicates} duplicates and ${counts.errors} with errors), ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.priceChanges} price changes, ${counts.unavailable} no longer available.`;
    return await db.importRun.update({ where: { id: run.id }, data: { ...counts, status: "completed", message, logJson: json(log), finishedAt: new Date() } });
  } catch (err) {
    const message = err instanceof SourceFormatError ? err.message : `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    if (!(err instanceof SourceFormatError)) console.error("[import]", err);
    say("error", message);
    return db.importRun.update({ where: { id: run.id }, data: { ...counts, status: "failed", message, logJson: json(log), finishedAt: new Date() } });
  }
}

const money = (minor: number | null) => (minor === null ? "—" : `$${(minor / 100).toFixed(2)}`);

function revalidatePathSafe(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // outside a request (job worker): the documents' own revalidation window applies
  }
}

/** The source no longer has the book: nothing unreleased may go out, and a live listing stops selling. */
async function markUnavailable(item: Pick<ExistingItem, "id" | "sourceId" | "status" | "product">, say: (level: LogEntry["level"], text: string) => void): Promise<Prisma.ImportItemUpdateInput> {
  const data: Prisma.ImportItemUpdateInput = { available: false };
  if (["pending_review", "approved", "ready"].includes(item.status)) {
    data.status = "error";
    data.problemsJson = json(["no longer available at the source"]);
    say("warn", `${item.sourceId}: no longer available at the source — taken out of the release flow`);
  } else if (item.status === "released" && item.product && item.product.stock > 0) {
    await db.$transaction([
      db.product.update({ where: { id: item.product.id }, data: { stock: 0 } }),
      db.inventoryAdjustment.create({ data: { productId: item.product.id, delta: -item.product.stock, reason: "correction", note: "Import sync: no longer available at the source" } }),
    ]);
    say("warn", `${item.sourceId}: no longer available at the source — listing ${item.product.slug} set to sold out`);
  }
  return data;
}

/** Re-derives the normalised fields after the source title changed, keeping whatever an admin edited. */
function refreshFields(row: SourceRow, existing: ExistingItem, usd: { price: number | null; priceNote: string | null }, takenSlugs: Set<string>): Prisma.ImportItemUpdateInput {
  const edited = new Set(list(existing.editedJson));
  const { p, reasons } = classify(row);
  if (reasons.length > 0) return { status: "error", problemsJson: json(reasons) };
  const l = buildListing({ row, p, price: usd.price, priceNote: usd.priceNote }, new Set([...takenSlugs].filter((s) => s !== existing.slug))) as unknown as BuiltListing;
  const data: Record<string, unknown> = {};
  for (const field of ["title", "issue", "publisher", "year", "era", "grader", "grade", "label", "certNumber", "keyIssue", "summary", "description"] as const) if (!edited.has(field)) data[field] = l[field];
  if (!edited.has("description")) Object.assign(data, { highlightsJson: json(l.highlights), attributesJson: json(l.attributes), tagsJson: json(l.tags) });
  return { ...data, status: "pending_review", problemsJson: "[]" };
}

// ───────────────────────────── review ─────────────────────────────

const hasStoredImage = (item: Pick<ImportItem, "imageUrl">) => Boolean(item.imageUrl);

/** Fetches the listing photo from the address the source data gave and keeps our own copy. */
async function storeImage(item: Pick<ImportItem, "id" | "sourceImage" | "slug" | "sourceId">): Promise<string> {
  if (!item.sourceImage || !/^https:\/\//i.test(item.sourceImage)) throw new ImageError("the source gave no photo address", true);
  let res = await fetch(item.sourceImage, { signal: AbortSignal.timeout(20_000), headers: { accept: "image/*" } });
  if (res.status === 404 && /-800\.jpg$/.test(item.sourceImage)) res = await fetch(item.sourceImage.replace(/-800\.jpg$/, ".jpg"), { signal: AbortSignal.timeout(20_000), headers: { accept: "image/*" } });
  // A refusal is an access decision by the source: stop, do not try another way in.
  if (res.status === 401 || res.status === 403) throw new ImageError(`the photo host refused the request (HTTP ${res.status})`, true);
  if (res.status === 404 || res.status === 410) throw new ImageError("the photo no longer exists at the source", true);
  if (!res.ok) throw new ImageError(`the photo host answered HTTP ${res.status}`, false);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000) throw new ImageError("the photo is too small to be a listing photo", true);
  const saved = await saveUpload(new File([new Uint8Array(buf)], `${item.slug || item.sourceId}.jpg`, { type: res.headers.get("content-type") ?? "image/jpeg" }), { purpose: "product_image", ownerId: null, visibility: "public" });
  return saved.url;
}
class ImageError extends Error {
  constructor(message: string, public permanent: boolean) {
    super(message);
  }
}

/** Approved → Ready to Release (photo stored, facts complete) or → Error with the reasons. */
export async function prepareItems(opts: { ids?: string[]; limit?: number } = {}): Promise<{ ready: number; errors: number; waiting: number }> {
  const items = await db.importItem.findMany({ where: { status: "approved", ...(opts.ids ? { id: { in: opts.ids } } : {}) }, orderBy: { reviewedAt: "asc" }, take: opts.limit ?? 25 });
  let ready = 0;
  let errors = 0;
  let waiting = 0;
  for (const item of items) {
    let imageUrl = item.imageUrl;
    if (!imageUrl) {
      try {
        imageUrl = await storeImage(item);
      } catch (err) {
        const permanent = err instanceof ImageError ? err.permanent : false;
        const text = `photo could not be stored: ${err instanceof Error ? err.message : String(err)}`;
        if (permanent || item.attempts + 1 >= 3) {
          await db.importItem.update({ where: { id: item.id }, data: { status: "error", attempts: item.attempts + 1, problemsJson: json([text]) } });
          errors += 1;
        } else {
          await db.importItem.update({ where: { id: item.id }, data: { attempts: item.attempts + 1 } });
          waiting += 1;
        }
        continue;
      }
    }
    const problems = releaseProblems({ ...item, hasImage: Boolean(imageUrl) });
    if (problems.length > 0) {
      await db.importItem.update({ where: { id: item.id }, data: { status: "error", imageUrl, problemsJson: json(problems) } });
      errors += 1;
    } else {
      await db.importItem.update({ where: { id: item.id }, data: { status: "ready", imageUrl, problemsJson: "[]", attempts: 0 } });
      ready += 1;
    }
  }
  return { ready, errors, waiting };
}

export async function approveItems(ids: string[], adminId: string): Promise<{ approved: number; ready: number; errors: number; queued: number; skipped: number }> {
  const items = await db.importItem.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, imageUrl: true } });
  const eligible = items.filter((i) => i.status === "pending_review");
  if (eligible.length === 0) return { approved: 0, ready: 0, errors: 0, queued: 0, skipped: items.length };
  await db.importItem.updateMany({ where: { id: { in: eligible.map((i) => i.id) } }, data: { status: "approved", reviewedById: adminId, reviewedAt: new Date(), attempts: 0 } });
  // Items whose photo is already ours are checked right away; photos still to fetch go to the job,
  // except a handful, which are quick enough to do while the admin waits.
  const needFetch = eligible.filter((i) => !hasStoredImage(i));
  const inline = [...eligible.filter(hasStoredImage).map((i) => i.id), ...(needFetch.length <= 3 ? needFetch.map((i) => i.id) : [])];
  const done = inline.length > 0 ? await prepareItems({ ids: inline, limit: inline.length }) : { ready: 0, errors: 0, waiting: 0 };
  const queued = eligible.length - inline.length + done.waiting;
  if (queued > 0) await enqueueJob("import_prepare", {}, { dedupe: true, maxAttempts: 3 });
  return { approved: eligible.length, ready: done.ready, errors: done.errors, queued, skipped: items.length - eligible.length };
}

export async function rejectItems(ids: string[], adminId: string): Promise<number> {
  const res = await db.importItem.updateMany({ where: { id: { in: ids }, status: { not: "released" } }, data: { status: "rejected", reviewedById: adminId, reviewedAt: new Date() } });
  return res.count;
}

/** Rejected, duplicate or error items go back to Pending Review (an admin decided they deserve another look). */
export async function restoreItems(ids: string[]): Promise<number> {
  const res = await db.importItem.updateMany({ where: { id: { in: ids }, status: { in: ["rejected", "duplicate", "approved", "ready"] } }, data: { status: "pending_review", problemsJson: "[]", attempts: 0 } });
  return res.count;
}

/** Deletes queue records. A released product is never removed here; a never-published draft made for the item goes with it. */
export async function removeItems(ids: string[]): Promise<{ removed: number; kept: number }> {
  const items = await db.importItem.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, productId: true, product: { select: { status: true, publishedAt: true, soldCount: true } } } });
  const removable = items.filter((i) => i.status !== "released");
  const drafts = removable.filter((i) => i.productId && i.product && i.product.status === "draft" && !i.product.publishedAt && i.product.soldCount === 0).map((i) => i.productId!);
  await db.$transaction([
    db.importItem.deleteMany({ where: { id: { in: removable.map((i) => i.id) } } }),
    ...(drafts.length ? [db.product.updateMany({ where: { id: { in: drafts } }, data: { deletedAt: new Date(), status: "archived" } })] : []),
  ]);
  return { removed: removable.length, kept: items.length - removable.length };
}

// ───────────────────────────── release ─────────────────────────────

export type ReleaseResult = { released: number; blocked: number; skipped: number; slugs: string[] };

/**
 * The only place an imported product becomes public. Takes items that are Ready to Release and
 * that the admin selected; everything else is skipped and reported.
 */
export async function releaseItems(ids: string[]): Promise<ReleaseResult> {
  const items = await db.importItem.findMany({ where: { id: { in: ids } }, orderBy: { reviewedAt: "asc" } });
  const ready = items.filter((i) => i.status === "ready");
  const categories = Object.fromEntries((await db.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const out: ReleaseResult = { released: 0, blocked: 0, skipped: items.length - ready.length, slugs: [] };
  for (const item of ready) {
    const problems = releaseProblems({ ...item, hasImage: hasStoredImage(item) });
    if (item.certNumber) {
      const live = await db.product.findFirst({ where: { certNumber: item.certNumber, deletedAt: null, status: "published", ...(item.productId ? { id: { not: item.productId } } : {}) }, select: { slug: true } });
      if (live) problems.push(`certification number ${item.certNumber} is already on sale (${live.slug})`);
    }
    if (problems.length > 0) {
      await db.importItem.update({ where: { id: item.id }, data: { status: "error", problemsJson: json(problems) } });
      out.blocked += 1;
      continue;
    }
    const slug = await db.$transaction(async (tx) => {
      const brandSlug = slugify(item.publisher);
      const brand = await tx.brand.upsert({ where: { slug: brandSlug }, create: { slug: brandSlug, name: item.publisher }, update: {} });
      const sku = `IMP-${item.sourceId}`;
      const own = item.productId ? await tx.product.findFirst({ where: { id: item.productId, deletedAt: null }, select: { id: true, _count: { select: { images: true } } } }) : await tx.product.findFirst({ where: { sku, deletedAt: null }, select: { id: true, _count: { select: { images: true } } } });
      let finalSlug = item.slug;
      const clash = await tx.product.findFirst({ where: { slug: finalSlug, ...(own ? { id: { not: own.id } } : {}) }, select: { id: true } });
      if (clash) finalSlug = `${item.slug}-${item.sourceId}`.slice(0, 110);
      const facts: SeoFacts = { title: item.title, issue: item.issue, publisher: item.publisher, year: item.year, grader: item.grader, grade: item.grade, label: item.label, keyIssue: item.keyIssue, slug: finalSlug };
      const palette = (PALETTES as Record<string, string[]>)[item.era] ?? ["#1c2130", "#e11d48"];
      const data = {
        slug: finalSlug,
        // House inventory: no seller profile, so the storefront presents it as the store's own book.
        sellerId: null,
        brandId: brand.id,
        categoryId: categories[ERA_CATEGORY[item.era]] ?? null,
        title: item.title,
        issue: item.issue,
        publisher: item.publisher,
        year: item.year!,
        era: item.era,
        grader: item.grader,
        grade: item.grade,
        label: item.label,
        certNumber: item.certNumber,
        price: item.retailPrice!,
        keyIssue: item.keyIssue,
        summary: item.summary,
        description: item.description,
        highlightsJson: item.highlightsJson,
        attributesJson: item.attributesJson,
        tagsJson: item.tagsJson,
        paletteFrom: palette[0],
        paletteTo: palette[1],
        // Only an edited title or description is stored; otherwise the page keeps building its own.
        seoTitle: item.seoTitle && item.seoTitle !== defaultSeoTitle(facts) ? item.seoTitle : null,
        seoDescription: item.seoManual && item.seoDescription ? item.seoDescription : null,
        importSource: item.source,
        importFile: item.importFile,
        status: "published",
        publishedAt: new Date(),
        moderationNote: null,
      };
      const alt = `${item.title} ${item.issue} ${item.grader} ${item.grade} slab`;
      let productId: string;
      if (own) {
        await tx.product.update({ where: { id: own.id }, data });
        if (own._count.images === 0) await tx.productImage.create({ data: { productId: own.id, url: item.imageUrl!, alt, position: 0 } });
        productId = own.id;
      } else {
        const created = await tx.product.create({ data: { ...data, sku, stock: 1, weightGrams: 450, images: { create: [{ url: item.imageUrl!, alt, position: 0 }] } }, select: { id: true } });
        productId = created.id;
      }
      await tx.importItem.update({ where: { id: item.id }, data: { status: "released", productId, releasedAt: new Date(), slug: finalSlug, problemsJson: "[]" } });
      return finalSlug;
    });
    out.released += 1;
    out.slugs.push(slug);
  }
  if (out.slugs.length > 0) {
    for (const path of ["/", "/store", "/google-shopping-feed.xml", "/sitemap.xml", "/sitemaps/site.xml", "/collections", "/publishers", "/characters"]) revalidatePathSafe(path);
    for (let i = 0; i < out.slugs.length; i += 100) await enqueueJob("indexnow_ping", { paths: [...out.slugs.slice(i, i + 100).map((s) => `/store/${s}`), ...(i === 0 ? ["/store", "/collections", "/publishers"] : [])] }, { maxAttempts: 3 });
  }
  return out;
}

// ───────────────────────────── edit ─────────────────────────────

export type ItemEdit = {
  title: string;
  issue: string;
  publisher: string;
  year: number | null;
  grader: string;
  grade: string;
  label: string;
  variant: string | null;
  certNumber: string | null;
  keyIssue: string | null;
  summary: string;
  description: string;
  slug: string;
  retailPrice: number | null;
  resetPrice: boolean;
  seoTitle: string;
  seoDescription: string;
  primaryKeyword: string;
};

/** Saves an admin's edit of a queued (not yet released) item and re-checks it. Facts are stored exactly as typed. */
export async function updateItem(id: string, edit: ItemEdit): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  const item = await db.importItem.findUnique({ where: { id } });
  if (!item) return { ok: false, message: "Item not found." };
  if (item.status === "released") return { ok: false, message: "This product is released. Edit the listing itself." };
  const edited = new Set(list(item.editedJson));
  const data: Record<string, unknown> = {};
  const before = item as unknown as Record<string, unknown>;
  const after = edit as unknown as Record<string, unknown>;
  for (const field of ["title", "issue", "publisher", "year", "grader", "grade", "label", "variant", "certNumber", "keyIssue", "summary", "description"]) {
    if (after[field] !== before[field]) {
      data[field] = after[field];
      edited.add(field);
    }
  }
  const year = edit.year;
  const era = year !== null ? ((eraForYear(year) as string | null) ?? "") : "";
  if (era !== item.era) data.era = era;

  // Slug: lower-case words, unique across listings and the queue.
  if (edit.slug !== item.slug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edit.slug) || edit.slug.length > 110) return { ok: false, message: "The URL slug must be lower-case words separated by hyphens." };
    const [p, q] = await Promise.all([db.product.findFirst({ where: { slug: edit.slug, ...(item.productId ? { id: { not: item.productId } } : {}) }, select: { id: true } }), db.importItem.findFirst({ where: { slug: edit.slug, id: { not: id } }, select: { id: true } })]);
    if (p || q) return { ok: false, message: "That URL slug is already used by another product." };
    data.slug = edit.slug;
    edited.add("slug");
  }

  // Price: a typed price is a manual price; "reset" goes back to source × markup.
  if (edit.resetPrice && item.sourcePrice !== null) Object.assign(data, { retailPrice: retailPrice(item.sourcePrice, item.markupBps), priceManual: false, priceChangeNote: null });
  else if (edit.retailPrice !== null && edit.retailPrice !== item.retailPrice) {
    if (!Number.isInteger(edit.retailPrice) || edit.retailPrice <= 0) return { ok: false, message: "Enter a price above zero." };
    Object.assign(data, { retailPrice: edit.retailPrice, priceManual: true, priceChangeNote: null });
  }

  const seoManual = item.seoManual || edit.seoTitle !== item.seoTitle || edit.seoDescription !== item.seoDescription || edit.primaryKeyword !== item.primaryKeyword;
  const next = { ...item, ...data } as ImportItem;
  const facts = { title: next.title, issue: next.issue, publisher: next.publisher, year: next.year, grader: next.grader, grade: next.grade, label: next.label, keyIssue: next.keyIssue, slug: next.slug, era: next.era };
  const ctx = await loadSeoContext([facts]);
  // Untouched SEO fields follow the facts; edited ones are kept and only checked.
  const rec = recommendSeo(facts, ctx, seoManual ? { seoTitle: edit.seoTitle, seoDescription: edit.seoDescription } : undefined);
  const primaryKeyword = seoManual && edit.primaryKeyword.trim() ? edit.primaryKeyword.trim().toLowerCase() : rec.primaryKeyword;
  Object.assign(data, { seoTitle: rec.seoTitle, seoDescription: rec.seoDescription, primaryKeyword, secondaryKeywordsJson: json(rec.secondaryKeywords.filter((k) => k !== primaryKeyword)), searchIntent: rec.searchIntent, internalLinksJson: json(rec.internalLinks), seoNotesJson: json(rec.notes), seoStatus: rec.status, seoManual });

  const key = dedupeKey(next);
  data.dedupeKey = key;
  if (item.duplicateStatus === "possible" && key !== item.dedupeKey) Object.assign(data, { duplicateStatus: "unique", duplicateOf: null });

  // Facts complete again → back to review; an approved or ready item is re-checked from the start.
  const factProblems = releaseProblems({ ...next, hasImage: true });
  let status = item.status;
  if (factProblems.length > 0) status = "error";
  else if (item.status === "error" || item.status === "approved" || item.status === "ready") status = "pending_review";
  Object.assign(data, { status, problemsJson: json(factProblems), editedJson: json([...edited]) });
  await db.importItem.update({ where: { id }, data });
  return { ok: true, status };
}

// ───────────────────────────── SEO backfill and statistics ─────────────────────────────

/** Items created by the seed arrive without an SEO recommendation; this fills them in batches. */
export async function analyseSeoPending(limit = 400): Promise<{ analysed: number; remaining: number }> {
  const items = await db.importItem.findMany({ where: { seoStatus: "pending", status: { not: "error" } }, take: limit, orderBy: { createdAt: "asc" } });
  if (items.length === 0) return { analysed: 0, remaining: 0 };
  const facts = items.map((i) => ({ title: i.title, issue: i.issue, publisher: i.publisher, year: i.year, grader: i.grader, grade: i.grade, label: i.label, keyIssue: i.keyIssue, slug: i.slug, era: i.era }));
  const ctx = await loadSeoContext(facts);
  for (let n = 0; n < items.length; n += 50) {
    await db.$transaction(
      items.slice(n, n + 50).map((item, k) => {
        const rec = recommendSeo(facts[n + k], ctx);
        return db.importItem.update({ where: { id: item.id }, data: { seoTitle: rec.seoTitle, seoDescription: rec.seoDescription, primaryKeyword: rec.primaryKeyword, secondaryKeywordsJson: json(rec.secondaryKeywords), searchIntent: rec.searchIntent, internalLinksJson: json(rec.internalLinks), seoNotesJson: json(rec.notes), seoStatus: rec.status, dedupeKey: item.dedupeKey || dedupeKey(item) } });
      }),
    );
  }
  const remaining = await db.importItem.count({ where: { seoStatus: "pending", status: { not: "error" } } });
  return { analysed: items.length, remaining };
}

export async function importStats(source: string) {
  const [byStatus, lastRun, lastSync, possible, priceNotes] = await Promise.all([
    db.importItem.groupBy({ by: ["status"], where: { source }, _count: { _all: true } }),
    db.importRun.findFirst({ where: { source }, orderBy: { startedAt: "desc" } }),
    db.importRun.findFirst({ where: { source, status: "completed", kind: { in: ["csv_upload", "feed"] } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, kind: true } }),
    db.importItem.count({ where: { source, duplicateStatus: "possible", status: { in: ["pending_review", "approved", "ready"] } } }),
    db.importItem.count({ where: { source, priceChangeNote: { not: null } } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    discovered: byStatus.reduce((n, b) => n + b._count._all, 0),
    pending: count("pending_review"),
    approved: count("approved"),
    ready: count("ready"),
    released: count("released"),
    rejected: count("rejected"),
    duplicates: count("duplicate"),
    errors: count("error"),
    possibleDuplicates: possible,
    priceNotes,
    lastRun,
    lastSyncAt: lastSync?.finishedAt ?? null,
    lastSyncKind: lastSync?.kind ?? null,
  };
}
