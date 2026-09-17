/**
 * HipComic search-result scrapes → the catalogue release queue.
 *
 *   node scripts/import-hipcomic-csv.mjs <csv|folder>... [--start YYYY-MM-DD] [--per-day 100] [--no-images]
 *
 * Every run is incremental: prisma/data/catalog-queue/hipcomic.json keeps what earlier runs
 * queued (same slugs, same release days) and rows from new files are appended behind them, so
 * "drop the next CSVs in a folder and run the script" is the whole workflow. The seed creates the
 * queued listings as drafts and the `catalog_release` job publishes each day's batch.
 *
 * What goes in: rows whose title states series, issue, grade, year and (directly or through
 * scripts/lib/hipcomic-title.mjs' flagship table) publisher, with a fixed price and a photo.
 * Everything else is HELD with its reasons in docs/imports/hipcomic-held.csv — nothing is guessed.
 * Optional CSV columns named publisher / year / series / issue / grade / cert fill those gaps
 * when a later scrape carries them.
 *
 * Duplicates: the same listing id (page overlap, sponsored repeats), the same certification
 * number (one slab listed by two sellers — the cheaper listing is kept), the same seller + title
 * + photo, and anything whose certification number is already in the catalogue.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { csvCell, parseCsv } from "./lib/csv.mjs";
import { listCsvFiles, readHipcomicCsv } from "./lib/hipcomic-csv.mjs";
import { CGC_GRADES, normSeries, parseTitle } from "./lib/hipcomic-title.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const valued = new Set(["--start", "--per-day"]);
const inputs = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
if (inputs.length === 0) {
  console.error("usage: node scripts/import-hipcomic-csv.mjs <csv|folder>... [--start YYYY-MM-DD] [--per-day 100] [--no-images]");
  process.exit(1);
}
const withImages = !args.includes("--no-images");

const SOURCE = "hipcomic";
const QUEUE_PATH = path.join("prisma", "data", "catalog-queue", `${SOURCE}.json`);
const HELD_CSV = path.join("docs", "imports", `${SOURCE}-held.csv`);
const REPORT = path.join("docs", "imports", `${SOURCE}-report.md`);
const COVER_DIR = path.join("public", "covers", "q");
const DAY = 86_400_000;

const queue = fs.existsSync(QUEUE_PATH)
  ? JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"))
  : { source: SOURCE, release: { start: option("--start", new Date().toISOString().slice(0, 10)), perDay: Number(option("--per-day", 100)) }, files: [], listings: [], held: [], duplicates: [] };
const { perDay } = queue.release;
const startMs = Date.parse(`${queue.release.start}T00:00:00Z`);

// ───────────────────────────── what the catalogue already has ─────────────────────────────
const takenSlugs = new Set(queue.listings.map((l) => l.slug));
const takenCerts = new Map(queue.listings.filter((l) => l.certNumber).map((l) => [l.certNumber, `queue ${l.sourceId}`]));
const knownIds = new Set([...queue.listings.map((l) => String(l.sourceId)), ...queue.held.map((h) => String(h.sourceId)), ...queue.duplicates.map((d) => String(d.sourceId))]);
const importsDir = path.join("prisma", "data", "catalog-imports");
for (const f of fs.existsSync(importsDir) ? fs.readdirSync(importsDir).filter((x) => x.endsWith(".json")) : []) {
  for (const l of JSON.parse(fs.readFileSync(path.join(importsDir, f), "utf8")).listings) {
    takenSlugs.add(l.slug);
    if (l.certNumber) takenCerts.set(String(l.certNumber), `${f} ${l.slug}`);
  }
}
const houseCatalog = fs.readFileSync(path.join("src", "lib", "products.ts"), "utf8");
for (const m of houseCatalog.matchAll(/slug:\s*"([^"]+)"/g)) takenSlugs.add(m[1]);
for (const m of houseCatalog.matchAll(/certNumber:\s*"(\d+)"/g)) takenCerts.set(m[1], "house catalogue");

// ───────────────────────────── read and classify ─────────────────────────────
const ADULT = /\b(?:naughty|nude|nudity|topless|risqu[eé]|nsfw|uncensored|explicit|adults? only|xxx)\b/i;
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PALETTES = { "Golden Age": ["#7c2d12", "#fbbf24"], "Silver Age": ["#1e3a8a", "#e11d48"], "Bronze Age": ["#14532d", "#f59e0b"], "Copper Age": ["#7c3aed", "#f97316"], "Modern Age": ["#0f172a", "#38bdf8"] };

const files = listCsvFiles(inputs);
const fresh = [];
const stats = [];
for (const file of files) {
  const { rows } = readHipcomicCsv(file);
  const name = path.basename(file);
  const fileStat = { file: name, rows: rows.length, queued: 0, held: 0, duplicates: 0, alreadyProcessed: 0 };
  stats.push(fileStat);
  // Optional structured columns from a richer scrape.
  const table = parseCsv(fs.readFileSync(file, "utf8"));
  const header = table[0].map((h) => h.trim().toLowerCase());
  const extra = (row, re) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? (table[row.line - 1]?.[i] ?? "").trim() : ""; };
  for (const row of rows) {
    row.fileStat = fileStat;
    row.extra = { publisher: extra(row, /^publisher$/), year: extra(row, /^(?:year|publication year)$/), series: extra(row, /^series(?: name)?$/), issue: extra(row, /^issue(?: number)?$/), grade: extra(row, /^grade$/), cert: extra(row, /^cert/), description: extra(row, /^description$/) };
    fresh.push(row);
  }
}

const hold = (row, reasons) => { queue.held.push({ sourceId: row.sourceId ?? `${row.file}:${row.line}`, file: row.file, line: row.line, title: row.title, price: row.price, currency: row.currency, seller: row.seller, url: row.url, reasons }); row.fileStat.held += 1; };
const duplicate = (row, of, why) => { queue.duplicates.push({ sourceId: row.sourceId, file: row.file, line: row.line, title: row.title, of, why }); row.fileStat.duplicates += 1; };

// CA$ listings: HipComic prints its own US$ figure beside the price. Rows scraped without that
// column use the median rate of the rows that have it (same site, same day).
const rates = fresh.filter((r) => r.currency === "CAD" && r.approxUsd && r.price).map((r) => r.approxUsd / r.price).sort((a, b) => a - b);
const cadRate = rates.length >= 20 ? rates[Math.floor(rates.length / 2)] : null;

// Publisher by consensus: when other listings of the same series, within three years, name a
// publisher and all of them agree, a row that omits it gets the same one.
const seriesPublishers = new Map();
const parsed = new Map();
for (const row of fresh) {
  if (!row.title || parsed.has(row.title + row.seller)) continue;
  const p = parseTitle(row.title, { seller: row.seller });
  parsed.set(row.title + row.seller, p);
  if (p.series && p.publisher && p.year !== null) seriesPublishers.set(normSeries(p.series), [...(seriesPublishers.get(normSeries(p.series)) ?? []), { year: p.year, publisher: p.publisher }]);
}
const consensusPublisher = (p) => {
  if (!p.series || p.year === null) return null;
  const near = (seriesPublishers.get(normSeries(p.series)) ?? []).filter((x) => Math.abs(x.year - p.year) <= 3);
  const names = [...new Set(near.map((x) => x.publisher))];
  return names.length === 1 ? names[0] : null;
};

const candidates = [];
const seenIds = new Set();
for (const row of fresh) {
  if (row.problems.length) { hold(row, row.problems); continue; }
  if (seenIds.has(row.sourceId)) { duplicate(row, row.sourceId, "same listing id (page overlap or sponsored repeat)"); continue; }
  seenIds.add(row.sourceId);
  if (knownIds.has(row.sourceId)) { row.fileStat.alreadyProcessed += 1; continue; }

  const reasons = [];
  if (row.auction) reasons.push("auction listing (current bid, not a fixed price)");
  let price = null;
  let priceNote = null;
  if (row.currency === "USD") price = row.price;
  else if (row.currency === "CAD" && row.approxUsd) { price = row.approxUsd; priceNote = `CA$${(row.price / 100).toFixed(2)} at the source; US$ figure as shown by HipComic`; }
  else if (row.currency === "CAD" && cadRate) { price = Math.round(row.price * cadRate); priceNote = `CA$${(row.price / 100).toFixed(2)} at the source; converted at the scrape's own rate (${cadRate.toFixed(4)})`; }
  else reasons.push(`price is in ${row.currency} with no US$ figure`);
  if (price !== null && price < 100) reasons.push("price under $1");
  if (ADULT.test(row.title)) reasons.push("adult-variant wording (needs a manual look before Merchant Center)");

  const p = { ...parsed.get(row.title + row.seller) };
  p.holds = [...p.holds];
  // Structured columns, when a scrape has them, win over the title.
  if (!p.publisher) { p.publisher = row.extra.publisher || consensusPublisher(p); if (p.publisher) p.holds = p.holds.filter((h) => !h.startsWith("publisher not stated")); }
  if (/^(19[3-9]\d|20[0-2]\d)$/.test(row.extra.year) && p.year === null) { p.year = Number(row.extra.year); p.holds = p.holds.filter((h) => !h.startsWith("no publication year")); }
  reasons.push(...p.holds);
  if (p.year !== null && !p.era) { /* pre-1938, already in holds */ }
  if (reasons.length) { hold(row, reasons); continue; }
  candidates.push({ row, p, price, priceNote });
}

// One slab, two listings: keep the cheaper one.
const byCert = new Map();
for (const c of candidates) if (c.p.certNumber) byCert.set(c.p.certNumber, [...(byCert.get(c.p.certNumber) ?? []), c]);
const dropped = new Set();
for (const [cert, group] of byCert) {
  if (takenCerts.has(cert)) { for (const c of group) { duplicate(c.row, takenCerts.get(cert), `certification number ${cert} is already in the catalogue`); dropped.add(c); } continue; }
  if (group.length < 2) continue;
  const keep = [...group].sort((a, b) => a.price - b.price)[0];
  for (const c of group) if (c !== keep) { duplicate(c.row, keep.row.sourceId, `same certification number ${cert} (listed at $${(c.price / 100).toFixed(2)}; kept the $${(keep.price / 100).toFixed(2)} listing)`); dropped.add(c); }
}
// Same seller, same title, same photo under two listing ids.
const byPhoto = new Map();
for (const c of candidates) {
  if (dropped.has(c)) continue;
  const key = `${c.row.seller}|${c.row.title}|${c.row.imageHash}`;
  if (byPhoto.has(key)) { duplicate(c.row, byPhoto.get(key), "same seller, title and photo as another listing"); dropped.add(c); } else byPhoto.set(key, c.row.sourceId);
}

// ───────────────────────────── build listings ─────────────────────────────
// The storefront shows a "Key issue" badge for `keyIssue`, so seller notes only land there when they
// make that kind of claim (first appearance, origin, death…); other notes stay in the description.
const KEY_CLAIM = /\b(?:1st|first|origin|death of|debut|intro(?:duction)?|last issue|classic cover|premiere)\b/i;
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
function buildListing({ row, p, price, priceNote }) {
  const gradeSlug = p.grade.replace(".", "-");
  const issueSlug = p.issue === "nn" ? "nn" : slugify(p.issue.replace("#-", "minus-").replace("1/2", "half"));
  let slug = `${slugify(p.series)}-${issueSlug}-${p.grader.toLowerCase()}-${gradeSlug}`.slice(0, 90).replace(/-$/, "");
  if (p.label === "Signature Series (Yellow)") slug = `${slug}-ss`;
  if (takenSlugs.has(slug)) slug = `${slug}-${row.sourceId}`;
  takenSlugs.add(slug);

  const gradeName = CGC_GRADES[p.grade];
  const issueText = p.issue === "nn" ? "nn" : p.issue;
  const book = `${p.series} ${issueText}`;
  const gradeLine = `${p.grader} ${p.grade} ${gradeName}${p.pageQuality ? `, ${p.pageQuality.toLowerCase()}` : ""}`;
  const labelLine = p.label === "Universal Blue" ? "" : ` ${p.label.replace(/ \(.*\)$/, "")} label.`;
  const summary = `${book} (${p.publisher}, ${p.year})${p.notes ? ` — ${p.notes}` : ""}. ${gradeLine}.`;
  const description = [
    `${book}, published by ${p.publisher} in ${p.year} (${p.era})${p.volume ? `, volume ${p.volume}` : ""}.${p.notes ? ` Listing notes: ${sentence(p.notes)}` : ""}`,
    `Graded ${gradeLine}.${labelLine}${p.certNumber ? ` Certification number ${p.certNumber}, which can be checked on the ${p.grader} website.` : ""} The book is sealed in its tamper-evident ${p.grader} holder.`,
  ].join("\n\n");
  const highlights = [p.notes, gradeLine, p.label !== "Universal Blue" ? p.label.replace(/ \(.*\)$/, "") : null, p.certNumber ? `${p.grader} certification ${p.certNumber}` : null, `${p.publisher}, ${p.year} — ${p.era}`].filter(Boolean);
  const attributes = {};
  if (p.pageQuality) attributes["Page quality"] = p.pageQuality;
  if (p.volume) attributes.Volume = p.volume;
  return {
    sourceId: Number(row.sourceId), sourceUrl: row.url, sourceSeller: row.seller, sourceTitle: row.title, sourcePrice: row.price, sourceCurrency: row.currency, priceNote,
    file: row.file, slug, title: p.series, issue: issueText, publisher: p.publisher, year: p.year, era: p.era, grader: p.grader, grade: p.grade, label: p.label,
    certNumber: p.certNumber, price, compareAt: null, stock: 1, keyIssue: p.notes && KEY_CLAIM.test(p.notes) ? p.notes : null, creators: { writer: "Various", artist: "Various", cover: "Various" },
    summary, description, highlights, palette: PALETTES[p.era], featured: false, attributes, tags: [p.series, p.era, p.grader, p.publisher.replace(/ (Comics|Publishing|Publications|Entertainment)$/, "")],
    allowedCountries: [], sourceImage: row.image, image: `/covers/q/${slug}.webp`,
  };
}

const built = candidates.filter((c) => !dropped.has(c)).map(buildListing);

// ───────────────────────────── photos ─────────────────────────────
if (withImages) {
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const todo = built.filter((l) => !fs.existsSync(path.join(COVER_DIR, `${l.slug}.webp`)));
  console.log(`${todo.length} photo(s) to fetch`);
  let done = 0;
  const failures = new Set();
  const work = async () => {
    for (;;) {
      const l = todo.shift();
      if (!l) return;
      try {
        let res = await fetch(l.sourceImage, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) res = await fetch(l.sourceImage.replace(/-800\.jpg$/, ".jpg"), { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buf).metadata();
        if (buf.length < 5_000 || !meta.width || meta.width < 200) throw new Error("image too small");
        await sharp(buf).rotate().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 64, effort: 6, smartSubsample: true }).toFile(path.join(COVER_DIR, `${l.slug}.webp`));
        await sharp(buf).rotate().resize({ width: 256, withoutEnlargement: true }).webp({ quality: 64, effort: 6, smartSubsample: true }).toFile(path.join(COVER_DIR, `${l.slug}-256.webp`));
      } catch (e) {
        failures.add(l);
        l.imageError = String(e.message ?? e);
      }
      done += 1;
      if (done % 250 === 0) console.log(`  ${done} photos done (${failures.size} failed)`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  for (const l of failures) {
    const row = fresh.find((r) => r.sourceId === String(l.sourceId));
    hold(row, [`photo could not be downloaded (${l.imageError})`]);
  }
  for (let i = built.length - 1; i >= 0; i--) if (failures.has(built[i])) built.splice(i, 1);
}

// ───────────────────────────── schedule ─────────────────────────────
const perDayCount = new Map();
for (const l of queue.listings) perDayCount.set(l.releaseDay, (perDayCount.get(l.releaseDay) ?? 0) + 1);
let day = Math.max(0, Math.floor((Date.now() - startMs) / DAY), ...(queue.listings.length ? [Math.max(...queue.listings.map((l) => l.releaseDay))] : [0]));
for (const l of built) {
  while ((perDayCount.get(day) ?? 0) >= perDay) day += 1;
  l.releaseDay = day;
  l.releaseAt = new Date(startMs + day * DAY).toISOString();
  perDayCount.set(day, (perDayCount.get(day) ?? 0) + 1);
  queue.listings.push(l);
  stats.find((s) => s.file === l.file).queued += 1;
}
for (const s of stats) { const old = queue.files.find((f) => f.file === s.file); if (old) Object.assign(old, { rows: s.rows, queued: old.queued + s.queued, held: old.held + s.held, duplicates: old.duplicates + s.duplicates }); else queue.files.push({ file: s.file, rows: s.rows, queued: s.queued, held: s.held, duplicates: s.duplicates }); }
queue.generatedAt = new Date().toISOString();

fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 1)}\n`);

// ───────────────────────────── held rows and report ─────────────────────────────
fs.mkdirSync(path.dirname(HELD_CSV), { recursive: true });
fs.writeFileSync(HELD_CSV, [["file", "row", "listing id", "seller", "price", "currency", "title", "why it was held", "listing url"], ...queue.held.map((h) => [h.file, h.line, h.sourceId, h.seller, h.price === null ? "" : (h.price / 100).toFixed(2), h.currency ?? "", h.title, h.reasons.join("; "), h.url ?? ""])].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n");

const reasonCount = {};
for (const h of queue.held) for (const r of h.reasons) { const k = r.replace(/\(.*\)$/, "").replace(/\d{10}/, "…").trim(); reasonCount[k] = (reasonCount[k] ?? 0) + 1; }
const lastDay = queue.listings.length ? Math.max(...queue.listings.map((l) => l.releaseDay)) : 0;
const dateOf = (d) => new Date(startMs + d * DAY).toISOString().slice(0, 10);
const totalRows = queue.files.reduce((n, f) => n + f.rows, 0);
const report = `# HipComic import — release queue report

Generated ${queue.generatedAt.slice(0, 16).replace("T", " ")} UTC by \`scripts/import-hipcomic-csv.mjs\`. Regenerated on every run.

| | |
|---|---|
| CSV files processed | ${queue.files.length} |
| Rows read | ${totalRows} |
| Listings queued | ${queue.listings.length} |
| Duplicates skipped | ${queue.duplicates.length} |
| Rows held (missing or invalid information) | ${queue.held.length} |
| Release schedule | ${perDay} per day, ${dateOf(0)} → ${dateOf(lastDay)} (${lastDay + 1} days) |

## Why rows were held

Held rows are listed one by one, with the reason, in \`docs/imports/${SOURCE}-held.csv\`.

| Reason | Rows |
|---|---|
${Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

## Per file

| File | Rows | Queued | Held | Duplicates |
|---|---|---|---|---|
${queue.files.map((f) => `| ${f.file} | ${f.rows} | ${f.queued} | ${f.held} | ${f.duplicates} |`).join("\n")}
`;
fs.writeFileSync(REPORT, report);

console.log(`${files.length} file(s), ${fresh.length} rows → ${built.length} queued, ${stats.reduce((n, s) => n + s.duplicates, 0)} duplicates, ${stats.reduce((n, s) => n + s.held, 0)} held, ${stats.reduce((n, s) => n + s.alreadyProcessed, 0)} already processed`);
console.log(`queue: ${queue.listings.length} listings over ${lastDay + 1} day(s) from ${queue.release.start}; CA$ rate ${cadRate ? cadRate.toFixed(4) : "n/a"}`);
