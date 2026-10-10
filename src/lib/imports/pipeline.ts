import "server-only";
import { revalidatePath } from "next/cache";
import type { ImportItem, ImportRun, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { activeStorage, saveUpload } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import { adjustmentForDiscount, reprice, retailPrice } from "@/lib/imports/pricing";
import { loadSeoContext, recommendSeo } from "@/lib/imports/seo";
import { defaultSeoTitle, type SeoFacts } from "@/lib/imports/seo-rules";
import { readSource, SourceFormatError, type SourceRow } from "@/lib/imports/source";
import { dedupeKey, issueKey, releaseProblems } from "@/lib/imports/status";
import { LOOKS_SLABBED, RAW_GRADER, RAW_UNSTATED, buildRawListing, rawCondition, type RawParsed } from "@/lib/imports/raw";
import { buildPlainListing } from "@/lib/imports/plain";
import { UNKNOWN, isKnown } from "@/lib/catalog/labels";
import { dailyPlan, utcDayStart } from "@/lib/imports/daily";
import { ADULT, PALETTES, buildListing, cadRateOf, slugify, usdPrice } from "../../../scripts/lib/hipcomic-listing.mjs";
import { CGC_GRADES, eraForYear, normSeries, parseTitle, tidyCase } from "../../../scripts/lib/hipcomic-title.mjs";
import { FEED_PATHS } from "@/lib/merchant-feed-xml";

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

type BuiltListing = { slug: string; title: string; issue: string; publisher: string; year: number | null; era: string; grader: string; grade: string; label: string; certNumber: string | null; keyIssue: string | null; summary: string; description: string; highlights: string[]; attributes: Record<string, string>; tags: string[] };
type Parsed = { series: string | null; issue: string | null; volume: string | null; year: number | null; era: string | null; grader: string | null; grade: string | null; label: string | null; pageQuality: string | null; certNumber: string | null; publisher: string | null; notes: string | null; holds: string[] };

/** Title parse plus any structured columns the data carries; a structured value wins over the title. */
function classify(row: SourceRow): { p: Parsed; reasons: string[] } {
  const p = { ...(parseTitle(row.title, { seller: row.seller }) as unknown as Parsed) };
  let holds = [...p.holds];
  const drop = (prefix: string) => {
    holds = holds.filter((h) => !h.startsWith(prefix));
  };
  const x = row.extra;
  const fillOnly = row.fillOnly === true;
  if (x.series && !(fillOnly && p.series)) {
    p.series = tidyCase(x.series) as string;
    drop("series title could not be read");
  }
  if (x.issue && !(fillOnly && p.issue)) {
    const n = x.issue.replace(/^#/, "").trim();
    if (/^[\w./-]{1,12}$/.test(n)) {
      p.issue = /^nn$/i.test(n) ? "nn" : `#${n}`;
      drop("no issue number");
    }
  }
  if (x.publisher && !(fillOnly && p.publisher)) {
    p.publisher = x.publisher;
    drop("publisher not stated");
    drop("more than one publisher");
  }
  if (/^(19[3-9]\d|20[0-3]\d)$/.test(x.year) && !(fillOnly && p.year !== null)) {
    p.year = Number(x.year);
    p.era = eraForYear(p.year) as string | null;
    drop("no publication year");
    drop("more than one year");
    if (p.era) drop("published before 1938");
  }
  if (/^(CGC|CBCS|PGX)$/i.test(x.grader) && !(fillOnly && p.grader)) {
    p.grader = x.grader.toUpperCase();
    drop("no grading company");
  }
  const grade = x.grade === "10" ? "10.0" : x.grade;
  if (grade && (CGC_GRADES as Record<string, string>)[grade] && !(fillOnly && p.grade)) {
    p.grade = grade;
    drop("no numeric grade");
    drop("more than one grade");
  }
  if (/^\d{7,12}(?:-\d{1,3})?$/.test(x.cert)) p.certNumber = x.cert;
  if (row.note) holds.unshift(row.note);
  const reasons = [...row.problems];
  if (ADULT.test(row.title)) reasons.push("adult-variant wording (needs a manual look before Merchant Center)");
  reasons.push(...holds);
  return { p, reasons };
}

type ExistingItem = Pick<ImportItem, "id" | "sourceId" | "status" | "certNumber" | "dedupeKey" | "sourcePrice" | "retailPrice" | "priceManual" | "markupBps" | "productId" | "editedJson" | "sourceTitle" | "sourceSeller" | "sourceImage" | "available" | "slug" | "imageUrl" | "auction" | "title" | "issue" | "publisher" | "year" | "grader" | "grade" | "knowledgeJson"> & {
  product: { id: string; price: number; status: string; stock: number; slug: string } | null;
};

/** Everything an evaluation needs to know about what is already in the catalogue and the queue. */
type Env = {
  items: ExistingItem[];
  markupBps: number;
  takenSlugs: Set<string>;
  certOwner: Map<string, string>;
  keyOwner: Map<string, string>;
  photoOwner: Map<string, string>;
  seriesPublishers: Map<string, { year: number | null; publisher: string }[]>;
  /** publication years other listings state for an issue (title + number) */
  issueYears: Map<string, Set<number>>;
};

async function loadEnv(source: string): Promise<Env> {
  const settings = await getSettings();
  const [items, products] = await Promise.all([
    db.importItem.findMany({
      where: { source },
      select: { id: true, sourceId: true, status: true, certNumber: true, dedupeKey: true, sourcePrice: true, retailPrice: true, priceManual: true, markupBps: true, productId: true, editedJson: true, sourceTitle: true, sourceSeller: true, sourceImage: true, available: true, slug: true, imageUrl: true, auction: true, title: true, issue: true, publisher: true, year: true, grader: true, grade: true, knowledgeJson: true, product: { select: { id: true, price: true, status: true, stock: true, slug: true } } },
    }),
    db.product.findMany({ where: { deletedAt: null }, select: { id: true, slug: true, certNumber: true, publisher: true, title: true, issue: true, grade: true, grader: true, label: true, year: true } }),
  ]);
  const takenSlugs = new Set<string>([...products.map((p) => p.slug), ...items.map((i) => i.slug).filter(Boolean)]);
  const linkedProducts = new Set(items.map((i) => i.productId).filter(Boolean));
  const certOwner = new Map<string, string>();
  const keyOwner = new Map<string, string>();
  const seriesPublishers: Env["seriesPublishers"] = new Map();
  const issueYears: Env["issueYears"] = new Map();
  const learnYear = (title: string, issue: string, year: number | null) => {
    const k = issueKey({ title, issue });
    if (k && year && year > 0) issueYears.set(k, (issueYears.get(k) ?? new Set<number>()).add(year));
  };
  const learn = (title: string, year: number | null, publisher: string) => {
    if (!title || !publisher || publisher === UNKNOWN) return;
    const k = normSeries(title) as string;
    seriesPublishers.set(k, [...(seriesPublishers.get(k) ?? []), { year, publisher }]);
  };
  for (const p of products) {
    learn(p.title, p.year, p.publisher);
    learnYear(p.title, p.issue, p.year);
    if (linkedProducts.has(p.id)) continue; // an item's own product is not its duplicate
    if (p.certNumber) certOwner.set(p.certNumber, `listing ${p.slug}`);
    const key = dedupeKey(p);
    if (key) keyOwner.set(key, `listing ${p.slug}`);
  }
  for (const i of items) {
    if (i.status === "rejected") continue;
    if (i.certNumber) certOwner.set(i.certNumber, `queue item ${i.sourceId}`);
    if (i.dedupeKey && !keyOwner.has(i.dedupeKey)) keyOwner.set(i.dedupeKey, `queue item ${i.sourceId}`);
    if (i.status === "error" || i.status === "duplicate") continue;
    learn(i.title, i.year, i.publisher);
    // A year an AI lookup filled in is not evidence for other listings; only stated or verified years are.
    if (!i.knowledgeJson.includes('"year"')) learnYear(i.title, i.issue, i.year);
  }
  const photoOwner = new Map<string, string>(items.map((i) => [`${i.sourceSeller}|${i.sourceTitle}|${i.sourceImage}`, i.sourceId]));
  return { items, markupBps: adjustmentForDiscount(settings["imports.discountBps"]), takenSlugs, certOwner, keyOwner, photoOwner, seriesPublishers, issueYears };
}

type Evaluated = { outcome: "ok" | "duplicate" | "error"; facts: (SeoFacts & { era: string }) | null; data: Record<string, unknown> };

/**
 * Decides what a row becomes: a product ready for review, a duplicate, or an error with reasons.
 * `selfId` is the row's own queue id when an existing item is being re-checked, so it is never
 * reported as a duplicate of itself.
 */
function evaluateNew(row: SourceRow, usd: { price: number | null; priceNote: string | null; reason: string | null }, env: Env, selfId: string | null): Evaluated {
  const { p, reasons: initial } = classify(row);
  let reasons = initial;
  const drop = (re: RegExp) => {
    reasons = reasons.filter((r) => !re.test(r));
  };

  // Publisher: when every known listing of the series (within three years) names the same one.
  if (!p.publisher && p.series) {
    const known = (env.seriesPublishers.get(normSeries(p.series) as string) ?? []).filter((x) => p.year === null || x.year === null || Math.abs(x.year - p.year) <= 3);
    const names = [...new Set(known.map((x) => x.publisher))];
    if (names.length === 1) {
      p.publisher = names[0];
      drop(/^publisher not stated/);
    }
  }

  // Publication year: when the other listings of this very issue all state the same one.
  const derived: string[] = [];
  if (p.year === null && p.series && p.issue) {
    const years = env.issueYears.get(issueKey({ title: p.series, issue: p.issue }));
    if (years && years.size === 1) {
      p.year = [...years][0];
      p.era = eraForYear(p.year) as string | null;
      drop(/^(no publication year|more than one year)/);
      if (p.era) drop(/^published before 1938/);
      derived.push("year:listings");
    }
  }

  // Raw books: no grading company. The condition is what the listing states, or "Not graded".
  let raw = false;
  let condition: string | null = null;
  const looksSlabbed = row.slabbed !== false && LOOKS_SLABBED.test(row.title);
  if (!p.grader && !looksSlabbed) {
    raw = true;
    condition = row.extra.rawGrade?.trim() || rawCondition(row.title);
    p.grader = RAW_GRADER;
    p.grade = condition ?? RAW_UNSTATED;
    p.label = RAW_GRADER;
    drop(/^(no grading company|no numeric grade|more than one grade|raw book|signed or conserved)/);
  }

  // Details that no sales channel requires never hold a product back: what the listing does not
  // state is stored as Unknown (no year), and the product's copy says so instead of filling the gap.
  let plain = false;
  const soften = (re: RegExp, apply: () => void) => {
    if (!reasons.some((r) => re.test(r))) return;
    apply();
    drop(re);
    plain = true;
  };
  soften(/^(publisher not stated|more than one publisher)/, () => { p.publisher = null; });
  soften(/^(no publication year|more than one year)/, () => { p.year = null; p.era = null; });
  soften(/^published before 1938/, () => { p.era = null; });
  soften(/^no issue number/, () => { p.issue = "nn"; });
  soften(/^(no numeric grade|more than one grade)/, () => { p.grade = null; });
  soften(/^no grading company/, () => { p.grader = null; });
  soften(/^signed or conserved/, () => { p.label = null; });
  let lot = false;
  soften(/^lot or multi-issue/, () => { lot = true; p.issue = "nn"; p.series = null; });
  soften(/^series title could not be read/, () => { p.series = null; });
  if (!p.series && row.title.trim()) {
    // No readable series: the listing's own title, tidied, is the product name.
    p.series = (tidyCase(row.title.replace(/\s+/g, " ").trim()) as string).slice(0, 110);
    if (!p.issue) p.issue = "nn";
    plain = true;
  }

  // Price: a fixed price follows the formula. A product the source sells by bidding stays a
  // bidding product: the price is the current bid as it stands, with no discount and no
  // made-up Buy It Now figure, and visitors bid on it.
  if (usd.reason) reasons.push(usd.reason);
  const retail: number | null = usd.price === null ? null : row.auction ? usd.price : retailPrice(usd.price, env.markupBps);
  if (row.available === false) reasons.push("marked unavailable at the source");

  if (reasons.length > 0) {
    return {
      outcome: "error",
      facts: null,
      data: { status: "error", problemsJson: json([...new Set(reasons)]), auction: row.auction, retailPrice: retail, priceBasis: null, title: p.series ?? "", issue: p.issue ?? "", publisher: p.publisher ?? "", year: p.year, era: p.era ?? "", grader: p.grader ?? "", grade: p.grade ?? "", label: p.label ?? "Universal Blue", certNumber: p.certNumber, description: row.extra.description },
    };
  }

  const l: BuiltListing = plain
    ? buildPlainListing({ sourceId: row.sourceId!, p: { series: p.series!, issue: p.issue ?? "nn", publisher: p.publisher, year: p.year, era: p.era, grader: p.grader, grade: raw ? condition : p.grade, label: p.label, certNumber: p.certNumber, pageQuality: p.pageQuality, volume: p.volume, notes: lot ? null : p.notes, lot } }, env.takenSlugs)
    : raw
    ? buildRawListing({ sourceId: row.sourceId!, p: p as unknown as RawParsed, condition }, env.takenSlugs)
    : (buildListing({ row, p, price: usd.price, priceNote: usd.priceNote }, env.takenSlugs) as unknown as BuiltListing);
  const key = dedupeKey({ ...l, variant: row.extra.variant });
  let priceBasis: string | null = null;
  if (row.auction) priceBasis = `Sold by bidding at the source: the price shown is the current bid${usd.price !== null ? ` (${money(usd.price)})` : ""}. Visitors place bids; nothing is bought outright.`;

  let status = "pending_review";
  let duplicateStatus = "unique";
  let duplicateOf: string | null = null;
  const self = selfId ? `queue item ${selfId}` : null;
  const photoKey = `${row.seller}|${row.title}|${row.image}`;
  const certHit = l.certNumber ? env.certOwner.get(l.certNumber) : undefined;
  const photoHit = env.photoOwner.get(photoKey);
  const keyHit = key ? env.keyOwner.get(key) : undefined;
  if (certHit && certHit !== self) {
    status = "duplicate";
    duplicateStatus = "duplicate";
    duplicateOf = `Certification number ${l.certNumber} is already on ${certHit}`;
  } else if (photoHit && photoHit !== selfId) {
    status = "duplicate";
    duplicateStatus = "duplicate";
    duplicateOf = `Same seller, title and photo as queue item ${photoHit}`;
  } else if (keyHit && keyHit !== self) {
    duplicateStatus = "possible";
    duplicateOf = `Same publisher, title, issue, grade, grader and label as ${keyHit} (may be a second copy)`;
  }
  if (status === "duplicate") env.takenSlugs.delete(l.slug);
  else {
    if (l.certNumber) env.certOwner.set(l.certNumber, `queue item ${row.sourceId}`);
    if (key && !env.keyOwner.has(key)) env.keyOwner.set(key, `queue item ${row.sourceId}`);
    if (row.sourceId) env.photoOwner.set(photoKey, row.sourceId);
    // What this listing states helps the next ones of the same series or issue.
    if (l.year && derived.length === 0) {
      const k = issueKey(l);
      if (k) env.issueYears.set(k, (env.issueYears.get(k) ?? new Set<number>()).add(l.year));
    }
  }
  return {
    outcome: status === "duplicate" ? "duplicate" : "ok",
    facts: { title: l.title, issue: l.issue, publisher: l.publisher, year: l.year, grader: l.grader, grade: l.grade, label: l.label, keyIssue: l.keyIssue, slug: l.slug, era: l.era },
    data: { status, problemsJson: "[]", duplicateStatus, duplicateOf, dedupeKey: key, auction: row.auction, auctionEndsAt: row.auctionEndsAt ?? null, retailPrice: retail, priceBasis, knowledgeJson: json(derived), title: l.title, issue: l.issue, publisher: l.publisher, year: l.year, era: l.era, grader: l.grader, grade: l.grade, label: l.label, certNumber: l.certNumber, keyIssue: l.keyIssue, summary: l.summary, description: l.description, highlightsJson: json(l.highlights), attributesJson: json(l.attributes), tagsJson: json(l.tags), slug: l.slug },
  };
}

export type ImportInput = { source: string; kind: "csv_upload" | "feed" | "crawl"; fileName: string; text?: string; rows?: SourceRow[]; snapshot?: boolean; startedById?: string | null };

export async function runImport(input: ImportInput): Promise<ImportRun> {
  const run = await db.importRun.create({ data: { source: input.source, kind: input.kind, fileName: input.fileName.slice(0, 200), startedById: input.startedById ?? null } });
  const log: LogEntry[] = [];
  const say = (level: LogEntry["level"], text: string) => {
    if (log.length < 300) log.push({ level, text });
  };
  const counts = { rows: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, errors: 0, priceChanges: 0, unavailable: 0 };
  try {
    const rows = input.rows ?? readSource(input.text ?? "", input.fileName);
    counts.rows = rows.length;
    const settings = await getSettings();
    const autoSync = settings["imports.autoPriceSync"];
    const cadRate = cadRateOf(rows) as number | null;

    const env = await loadEnv(input.source);
    const { items } = env;
    // Stored per item as a signed adjustment: a 25 % discount is −2500.
    const markupBps = env.markupBps;
    const bySourceId = new Map<string, ExistingItem>(items.map((i) => [i.sourceId, i]));

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
        if (existing.auction) {
          if (usd.price !== null && usd.price !== existing.sourcePrice) {
            changed = true;
            Object.assign(data, { sourcePrice: usd.price, sourceAmount: row.price, ...(existing.priceManual ? {} : { retailPrice: usd.price }) });
            // The listing follows a higher bid at the source; it never drops below a bid placed on this site.
            if (existing.product && !existing.priceManual && usd.price > existing.product.price) {
              await db.product.updateMany({ where: { id: existing.product.id, saleType: "auction", price: { lt: usd.price } }, data: { price: usd.price } });
              if (existing.product.status === "published") touchedSlugs.add(existing.product.slug);
            }
            say("info", `${row.sourceId}: current bid at the source ${money(existing.sourcePrice)} → ${money(usd.price)}`);
          }
        } else if (usd.price !== null && usd.price >= 100 && usd.price !== existing.sourcePrice) {
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
            Object.assign(data, refreshFields(row, existing, usd, env));
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
      const ev = evaluateNew(row, usd, env, null);
      counts.created += 1;
      if (ev.outcome === "error") counts.errors += 1;
      if (ev.outcome === "duplicate") counts.duplicates += 1;
      fresh.push({
        row,
        facts: ev.facts,
        data: {
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
          available: row.available !== false,
          variant: row.extra.variant || null,
          runId: run.id,
          importFile: row.file,
          ...ev.data,
        } as Prisma.ImportItemCreateManyInput,
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
    if (fresh.some((f) => f.data.year === null || f.data.publisher === UNKNOWN)) await enqueueJob("import_fix", { phase: "knowledge" }, { dedupe: true, maxAttempts: 3 }).catch(() => {});

    // A complete snapshot: what it no longer lists is no longer for sale at the source.
    if (input.snapshot && rows.length > 0) {
      const tracked = items.filter((i) => i.available && !["rejected", "duplicate"].includes(i.status));
      const gone = tracked.filter((i) => !seen.has(i.sourceId));
      // A real full catalogue still contains most of what is already known. A file that would mark
      // more than a fifth of the catalogue unavailable is a partial export ticked by mistake.
      if (tracked.length >= 20 && gone.length > tracked.length * 0.2) {
        say("error", `"Complete catalogue" was ticked, but this file has ${seen.size} products and would mark ${gone.length} of the ${tracked.length} known products unavailable. Nothing was marked unavailable: this looks like a partial export.`);
        gone.length = 0;
      }
      for (const item of gone) {
        await db.importItem.update({ where: { id: item.id }, data: await markUnavailable(item, say) });
        counts.unavailable += 1;
      }
    }
    for (const slug of touchedSlugs) revalidatePathSafe(`/store/${slug}`);
    if (touchedSlugs.size > 0 || counts.unavailable > 0) for (const path of ["/store", ...FEED_PATHS]) revalidatePathSafe(path);

    const refused = log.some((e) => e.text.startsWith('"Complete catalogue" was ticked'));
    const message = `${refused ? "The complete-catalogue option was ignored (the file is far smaller than the catalogue). " : ""}${counts.rows} rows: ${counts.created} new (of which ${counts.duplicates} duplicates and ${counts.errors} with errors), ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.priceChanges} price changes, ${counts.unavailable} no longer available.`;
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
function refreshFields(row: SourceRow, existing: ExistingItem, usd: { price: number | null; priceNote: string | null; reason: string | null }, env: Env): Prisma.ImportItemUpdateInput {
  const edited = new Set(list(existing.editedJson));
  if (existing.slug) env.takenSlugs.delete(existing.slug);
  const ev = evaluateNew(row, usd, env, existing.sourceId);
  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(ev.data)) {
    if (edited.has(field)) continue;
    if (field === "retailPrice" && existing.priceManual) continue;
    data[field] = value;
  }
  return data;
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
  // A serverless host has no disk to keep a copy on. Unless object storage is configured
  // (BLOB_READ_WRITE_TOKEN), the listing shows the photo from the address the source data gave,
  // which was just fetched and checked above.
  const remote = res.url || item.sourceImage;
  if (activeStorage() === "local" && process.env.VERCEL) return remote;
  try {
    const saved = await saveUpload(new File([new Uint8Array(buf)], `${item.slug || item.sourceId}.jpg`, { type: res.headers.get("content-type") ?? "image/jpeg" }), { purpose: "product_image", ownerId: null, visibility: "public" });
    return saved.url;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code ?? "";
    // Read-only or missing upload folder: the same situation, found out the hard way.
    if (["ENOENT", "EROFS", "EACCES", "EPERM"].includes(code)) return remote;
    throw err;
  }
}

/**
 * Products that ended in Error only because their photo could not be stored go back to Approved,
 * so the next preparation run gives them their photo and makes them Ready to Release.
 */
export async function retryPhotoErrors(source: string): Promise<number> {
  const stuck = await db.importItem.findMany({ where: { source, status: "error", problemsJson: { contains: "photo could not be stored" } }, select: { id: true, problemsJson: true } });
  const ids = stuck.filter((i) => list(i.problemsJson).every((p) => p.startsWith("photo could not be stored"))).map((i) => i.id);
  if (ids.length === 0) return 0;
  for (let n = 0; n < ids.length; n += 500) await db.importItem.updateMany({ where: { id: { in: ids.slice(n, n + 500) } }, data: { status: "approved", attempts: 0, problemsJson: "[]" } });
  await enqueueJob("import_prepare", {}, { dedupe: true, maxAttempts: 3 });
  return ids.length;
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
          await db.importItem.updateMany({ where: { id: item.id, status: "approved" }, data: { status: "error", attempts: item.attempts + 1, problemsJson: json([text]) } });
          errors += 1;
        } else {
          await db.importItem.updateMany({ where: { id: item.id, status: "approved" }, data: { attempts: item.attempts + 1 } });
          waiting += 1;
        }
        continue;
      }
    }
    const problems = releaseProblems({ ...item, hasImage: Boolean(imageUrl) });
    if (problems.length > 0) {
      await db.importItem.updateMany({ where: { id: item.id, status: "approved" }, data: { status: "error", imageUrl, problemsJson: json(problems) } });
      errors += 1;
    } else {
      await db.importItem.updateMany({ where: { id: item.id, status: "approved" }, data: { status: "ready", imageUrl, problemsJson: "[]", attempts: 0 } });
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
        // 0 = not known; every page prints it through src/lib/catalog/labels.
        year: item.year ?? 0,
        era: item.era || UNKNOWN,
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
        saleType: item.auction ? "auction" : "fixed",
        auctionEndsAt: item.auction ? item.auctionEndsAt : null,
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
    for (const path of ["/", "/store", ...FEED_PATHS, "/sitemap.xml", "/sitemaps/site.xml", "/collections", "/publishers", "/characters"]) revalidatePathSafe(path);
    for (let i = 0; i < out.slugs.length; i += 100) await enqueueJob("indexnow_ping", { paths: [...out.slugs.slice(i, i + 100).map((s) => `/store/${s}`), ...(i === 0 ? ["/store", "/collections", "/publishers"] : [])] }, { maxAttempts: 3 });
  }
  return out;
}

// ───────────────────────────── daily release rule ─────────────────────────────

export const AUTO_REVIEWER = "auto-release";

/**
 * The daily release rule: up to `imports.autoReleasePerDay` imported products go live per UTC day
 * without anyone pressing Release. Each run releases a batch of what is Ready to Release (oldest
 * approval first, so an admin's own approvals go out first) and moves more products from Pending
 * Review into preparation to fill the rest of the day's quota.
 *
 * Every product still passes the same release check as a manual release. Possible duplicates and
 * auction prices from the fallback rule are left for a person unless the settings say otherwise.
 */
export async function autoRelease(source: string, opts: { batch?: number; budgetMs?: number } = {}): Promise<{ enabled: boolean; released: number; approved: number; releasedToday: number; perDay: number; waiting: number }> {
  const settings = await getSettings();
  const perDay = settings["imports.autoReleasePerDay"];
  if (perDay <= 0) return { enabled: false, released: 0, approved: 0, releasedToday: 0, perDay: 0, waiting: 0 };
  const batch = opts.batch ?? 20;
  const budgetMs = opts.budgetMs ?? 18_000;
  const started = Date.now();
  const since = utcDayStart();
  let released = 0;
  let approved = 0;
  let releasedToday = 0;
  // Small steps, repeated while there is time: a run that is cut off loses at most one step,
  // and whatever it left half-done (approved but not yet checked) is picked up first next time.
  for (let round = 0; round < 50; round++) {
    const [today, readyCount, inPreparation] = await Promise.all([
      db.importItem.count({ where: { source, status: "released", releasedAt: { gte: since } } }),
      db.importItem.count({ where: { source, status: "ready" } }),
      db.importItem.count({ where: { source, status: "approved" } }),
    ]);
    releasedToday = today;
    const plan = dailyPlan({ perDay, releasedToday, ready: readyCount, inPreparation, batch });
    if (plan.remaining === 0) break;
    let progressed = 0;
    if (inPreparation > 0) {
      const done = await prepareItems({ limit: 10 });
      progressed += done.ready + done.errors;
    }
    if (plan.release > 0) {
      const ready = await db.importItem.findMany({ where: { source, status: "ready" }, orderBy: [{ reviewedAt: "asc" }, { id: "asc" }], take: plan.release, select: { id: true } });
      const r = await releaseItems(ready.map((i) => i.id));
      released += r.released;
      releasedToday += r.released;
      progressed += r.released + r.blocked;
    }
    if (Date.now() - started > budgetMs) break;
    if (plan.approve > 0 && settings["imports.autoReleaseIncludePending"]) {
      const pending = await db.importItem.findMany({
        where: {
          source,
          status: "pending_review",
          available: true,
          ...(settings["imports.autoReleaseHoldDuplicates"] ? { duplicateStatus: "unique" } : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: Math.min(plan.approve, batch),
        select: { id: true },
      });
      if (pending.length > 0) {
        const done = await approveItems(pending.map((i) => i.id), AUTO_REVIEWER);
        approved += done.approved;
        progressed += done.approved;
      }
    }
    if (progressed === 0 || Date.now() - started > budgetMs) break;
  }
  const waiting = await db.importItem.count({ where: { source, status: { in: ["ready", "approved"] } } });
  if (released > 0 || approved > 0) console.log(`[auto-release] ${released} released (${releasedToday}/${perDay} today), ${approved} moved into preparation`);
  return { enabled: true, released, approved, releasedToday, perDay, waiting };
}

/**
 * "Release all approved": everything an admin or the daily rule had approved up to `cutoff` goes
 * live now, whatever the daily limit. One call does a batch (photos still to store, then a
 * release) and reports what is left, so a job can repeat it until nothing remains. Products
 * approved after the cutoff are not swept in; the same release check applies to each one.
 */
export async function releaseApproved(source: string, cutoff: Date, batch = 25): Promise<{ released: number; blocked: number; preparing: number; remaining: number }> {
  const scope = { source, reviewedAt: { lte: cutoff } };
  const approved = await db.importItem.findMany({ where: { ...scope, status: "approved" }, orderBy: { reviewedAt: "asc" }, take: 10, select: { id: true } });
  if (approved.length > 0) await prepareItems({ ids: approved.map((i) => i.id), limit: approved.length });
  const ready = await db.importItem.findMany({ where: { ...scope, status: "ready" }, orderBy: [{ reviewedAt: "asc" }, { id: "asc" }], take: batch, select: { id: true } });
  const r = ready.length > 0 ? await releaseItems(ready.map((i) => i.id)) : { released: 0, blocked: 0 };
  const [preparing, readyLeft] = await Promise.all([db.importItem.count({ where: { ...scope, status: "approved" } }), db.importItem.count({ where: { ...scope, status: "ready" } })]);
  if (r.released > 0) console.log(`[release-approved] ${r.released} released, ${preparing + readyLeft} left`);
  return { released: r.released, blocked: r.blocked, preparing, remaining: preparing + readyLeft };
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
  const era = year !== null ? ((eraForYear(year) as string | null) ?? UNKNOWN) : UNKNOWN;
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

// ───────────────────────────── automatic re-check of errors ─────────────────────────────

const ROW_PROBLEMS = ["no identifier", "no listing URL", "no title", "no readable price", "no image"];

/** A queue item turned back into the row it came from, so it can be evaluated again under the current rules. */
function rowFromItem(item: ImportItem, problems: string[], known: { publisher?: string; year?: number } = {}): SourceRow {
  const slabGrader = /^(CGC|CBCS|PGX)$/.test(item.grader) ? item.grader : "";
  return {
    file: item.importFile ?? "",
    line: 0,
    sourceId: item.sourceId,
    url: item.sourceUrl,
    image: item.sourceImage,
    imageHash: item.sourceImage,
    title: item.sourceTitle,
    currency: item.sourceCurrency,
    price: item.sourceAmount,
    approxUsd: null,
    seller: item.sourceSeller ?? "",
    auction: item.auction || problems.some((r) => r.startsWith("auction listing")),
    problems: problems.filter((r) => ROW_PROBLEMS.includes(r)),
    extra: {
      publisher: known.publisher ?? (isKnown(item.publisher) ? item.publisher : ""),
      year: String(known.year ?? item.year ?? ""),
      series: item.status === "error" ? item.title : "",
      issue: item.issue === "nn" ? "" : item.issue.replace(/^#/, ""),
      grade: slabGrader && isKnown(item.grade) ? item.grade : "",
      grader: slabGrader,
      cert: item.certNumber ?? "",
      description: "",
      variant: item.variant ?? "",
      rawGrade: item.grader === RAW_GRADER && isKnown(item.grade) && item.grade !== RAW_UNSTATED ? item.grade : "",
    },
    available: item.available,
    fillOnly: true,
    note: problems.find((r) => r.startsWith("flagged as adult")),
    slabbed: item.grader === RAW_GRADER || problems.some((r) => r.startsWith("raw book")) ? false : null,
  };
}

/**
 * Re-checks items in Error against the current rules (auctions get a suggested Buy It Now price,
 * raw books are accepted with the condition the listing states, a publisher every other listing
 * of the series agrees on is filled in). Items an admin has edited or already reviewed are left
 * alone, and anything that still lacks a fact stays in Error with its reasons: nothing is guessed.
 */
export async function reprocessErrors(source: string, opts: { cursor?: string | null; limit?: number } = {}): Promise<{ checked: number; fixed: number; duplicates: number; still: number; skipped: number; nextCursor: string | null }> {
  const limit = opts.limit ?? 300;
  const batch = await db.importItem.findMany({ where: { source, status: "error", reviewedAt: null, editedJson: "[]", ...(opts.cursor ? { id: { gt: opts.cursor } } : {}) }, orderBy: { id: "asc" }, take: limit });
  if (batch.length === 0) return { checked: 0, fixed: 0, duplicates: 0, still: 0, skipped: 0, nextCursor: null };
  const env = await loadEnv(source);
  const done: { id: string; updatedAt: Date; ev: Evaluated }[] = [];
  let still = 0;
  for (const item of batch) {
    const problems = list(item.problemsJson);
    // Errors from later stages (photo, release check, availability) are not classification problems.
    if (problems.some((r) => /^(photo could not|no longer available|certification number .* already on sale|no photo stored)/.test(r))) {
      still += 1;
      continue;
    }
    const row = rowFromItem(item, problems);
    const priceReason = problems.find((r) => r.startsWith("price is in")) ?? null;
    const ev = evaluateNew(row, { price: item.sourcePrice, priceNote: item.priceNote, reason: item.sourcePrice === null ? priceReason : null }, env, item.sourceId);
    if (ev.outcome === "error") still += 1;
    done.push({ id: item.id, updatedAt: item.updatedAt, ev });
  }
  const withFacts = done.filter((d) => d.ev.facts);
  const ctx = withFacts.length > 0 ? await loadSeoContext(withFacts.map((d) => d.ev.facts!)) : null;
  // Written only if the item is unchanged since it was read: an admin edit or review made meanwhile wins.
  let written = 0;
  for (let n = 0; n < done.length; n += 50) {
    const results = await db.$transaction(
      done.slice(n, n + 50).map(({ id, updatedAt, ev }) => {
        const rec = ev.facts && ctx ? recommendSeo(ev.facts, ctx) : null;
        return db.importItem.updateMany({ where: { id, updatedAt, status: "error", reviewedAt: null, editedJson: "[]" }, data: { ...ev.data, ...(rec ? { seoTitle: rec.seoTitle, seoDescription: rec.seoDescription, primaryKeyword: rec.primaryKeyword, secondaryKeywordsJson: json(rec.secondaryKeywords), searchIntent: rec.searchIntent, internalLinksJson: json(rec.internalLinks), seoNotesJson: json(rec.notes), seoStatus: rec.status } : {}) } });
      }),
    );
    written += results.reduce((sum, r) => sum + r.count, 0);
  }
  return { checked: batch.length, fixed: done.filter((d) => d.ev.outcome === "ok").length, duplicates: done.filter((d) => d.ev.outcome === "duplicate").length, still, skipped: done.length - written, nextCursor: batch.length === limit ? batch[batch.length - 1].id : null };
}

/**
 * Looks up, from reference knowledge, the publisher and publication year the listing itself does
 * not state. Only an answer the model gives as certain is used; it is recorded on the item so the
 * admin can verify it, and anything not certain stays Unknown. Each item is asked about once.
 */
export async function enrichUnknown(source: string, limit = 25): Promise<{ asked: number; filled: number; remaining: number; unavailable?: boolean; notConfigured?: boolean }> {
  const where = { source, status: "pending_review", reviewedAt: null, editedJson: "[]", knowledgeTriedAt: null, OR: [{ year: null }, { publisher: UNKNOWN }] };
  const { lookupComicFacts, knowledgeConfigured } = await import("@/lib/imports/enrich");
  if (!knowledgeConfigured()) return { asked: 0, filled: 0, remaining: 0, notConfigured: true };
  const batch = await db.importItem.findMany({ where, orderBy: { id: "asc" }, take: limit });
  if (batch.length === 0) return { asked: 0, filled: 0, remaining: 0 };
  const env = await loadEnv(source);
  const now = new Date();
  let filled = 0;
  const facts: { id: string; ev: Evaluated; fields: string[] }[] = [];
  const usdOf = (item: ImportItem) => ({ price: item.sourcePrice, priceNote: item.priceNote, reason: null });
  // 1. What other listings of the same series or issue state (they may have been imported since).
  const stillUnknown: ImportItem[] = [];
  for (const item of batch) {
    if (item.slug) env.takenSlugs.delete(item.slug);
    const ev = evaluateNew(rowFromItem(item, []), usdOf(item), env, item.sourceId);
    const gained = ev.outcome !== "error" && ((item.year === null && ev.data.year !== null) || (item.publisher === UNKNOWN && ev.data.publisher !== UNKNOWN));
    if (gained) {
      if (item.priceManual) delete ev.data.retailPrice;
      facts.push({ id: item.id, ev, fields: list(String(ev.data.knowledgeJson ?? "[]")) });
      filled += 1;
    }
    if (ev.outcome === "error" || ev.data.year === null || ev.data.publisher === UNKNOWN) stillUnknown.push(item);
    else if (!gained && typeof ev.data.slug === "string") env.takenSlugs.add(item.slug);
  }
  // 2. Reference knowledge for what is still missing.
  const looked = stillUnknown.length ? await lookupComicFacts(stillUnknown.map((i) => ({ id: i.id, listingTitle: i.sourceTitle, series: i.title, issue: i.issue, needPublisher: i.publisher === UNKNOWN, needYear: i.year === null }))) : new Map();
  // The service could not be asked: nothing is marked as tried, so these listings are looked up once it works again.
  if (looked === null) return { asked: 0, filled: 0, remaining: await db.importItem.count({ where }), unavailable: true };
  const answers = looked;
  for (const item of stillUnknown) {
    const a = answers.get(item.id);
    const known: { publisher?: string; year?: number } = {};
    if (a?.publisher && item.publisher === UNKNOWN) known.publisher = a.publisher;
    if (a?.year && item.year === null) known.year = a.year;
    const fields = Object.keys(known);
    if (fields.length === 0) continue;
    const earlier = facts.findIndex((f) => f.id === item.id);
    const ev = evaluateNew(rowFromItem(item, [], known), usdOf(item), env, item.sourceId);
    if (ev.outcome === "error") continue;
    if (earlier >= 0) facts.splice(earlier, 1);
    else filled += 1;
    if (item.priceManual) delete ev.data.retailPrice;
    facts.push({ id: item.id, ev, fields });
  }
  const ctx = facts.length > 0 ? await loadSeoContext(facts.map((f) => f.ev.facts!)) : null;
  // Facts are written only to items unchanged since they were read (an admin edit or review made meanwhile wins), then the batch is marked as tried.
  const readAt = new Map(batch.map((i) => [i.id, i.updatedAt]));
  for (const { id, ev, fields } of facts) {
    const rec = recommendSeo(ev.facts!, ctx!);
    const r = await db.importItem.updateMany({ where: { id, updatedAt: readAt.get(id), reviewedAt: null, editedJson: "[]" }, data: { ...ev.data, knowledgeJson: json(fields), seoTitle: rec.seoTitle, seoDescription: rec.seoDescription, primaryKeyword: rec.primaryKeyword, secondaryKeywordsJson: json(rec.secondaryKeywords), searchIntent: rec.searchIntent, internalLinksJson: json(rec.internalLinks), seoNotesJson: json(rec.notes), seoStatus: rec.status } });
    if (r.count === 0) filled -= 1;
  }
  await db.importItem.updateMany({ where: { id: { in: batch.map((i) => i.id) }, reviewedAt: null, editedJson: "[]" }, data: { knowledgeTriedAt: now } });
  return { asked: batch.length, filled, remaining: await db.importItem.count({ where }) };
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
  const [byStatus, lastRun, lastSync, possible, priceNotes, releasedToday] = await Promise.all([
    db.importItem.groupBy({ by: ["status"], where: { source }, _count: { _all: true } }),
    db.importRun.findFirst({ where: { source }, orderBy: { startedAt: "desc" } }),
    db.importRun.findFirst({ where: { source, status: "completed", kind: { in: ["csv_upload", "feed", "crawl"] } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, kind: true } }),
    db.importItem.count({ where: { source, duplicateStatus: "possible", status: { in: ["pending_review", "approved", "ready"] } } }),
    db.importItem.count({ where: { source, priceChangeNote: { not: null } } }),
    db.importItem.count({ where: { source, status: "released", releasedAt: { gte: utcDayStart() } } }),
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
    releasedToday,
    priceNotes,
    lastRun,
    lastSyncAt: lastSync?.finishedAt ?? null,
    lastSyncKind: lastSync?.kind ?? null,
  };
}
