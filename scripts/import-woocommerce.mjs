/**
 * Converts a WooCommerce product export into the marketplace's catalog-import JSON.
 *
 *   node scripts/import-woocommerce.mjs <export.csv> <profile> [out.json]
 *   e.g. node scripts/import-woocommerce.mjs ~/wc-export.csv waymaker-2023-04
 *
 * A profile (scripts/import-profiles/<name>.mjs) pins everything the export does not
 * carry — year, era, grader details, creators, seller — so a conversion is deterministic.
 * The seed (prisma/seed.ts) reads prisma/data/catalog-imports/*.json and creates the
 * sellers and listings idempotently, so the JSON is the reviewable source of truth.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [csvPath, profileName, outArg] = process.argv.slice(2);
if (!csvPath || !profileName) {
  console.error("usage: node scripts/import-woocommerce.mjs <export.csv> <profile> [out.json]");
  process.exit(1);
}
const profile = await import(pathToFileURL(path.resolve("scripts/import-profiles", `${profileName}.mjs`)).href);
const outPath = outArg ?? path.join("prisma", "data", "catalog-imports", `${profileName}.json`);

// ── CSV ────────────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "").replace(/^ï»¿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}
const [header, ...rows] = parseCsv(fs.readFileSync(csvPath, "utf8"));
const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
const C = { id: col("ID"), name: col("Name"), published: col("Published"), description: col("Description"), sale: col("Sale price"), regular: col("Regular price"), categories: col("Categories"), tags: col("Tags"), images: col("Images"), stock: col("Stock"), inStock: col("In stock?") };
for (const [k, v] of Object.entries(C)) if (v < 0 && k !== "tags" && k !== "stock") throw new Error(`Column "${k}" not found in the export`);

// ── Text cleanup ───────────────────────────────────────────────────────────────
/** WooCommerce exports are UTF-8 but this one was re-saved as Latin-1; undo the common mojibake. */
function fixEncoding(s) {
  return s
    .replace(/â€™|â€˜/g, "’")
    .replace(/â€œ|â€\x9d/g, '"')
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€¦|â¦/g, "…")
    .replace(/â(?=s\b)/g, "’") // Here's, Marvel's
    .replace(/â(?= )/g, "—") // "Wolverine â a grail"
    .replace(/â/g, "’")
    .replace(/Â /g, " ")
    .replace(/Â/g, "");
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#8217;/g, "’").replace(/&nbsp;/g, " ");
}
function htmlToText(html) {
  return decodeEntities(
    fixEncoding(html)
      .replace(/\\n/g, "\n")
      .replace(/<button[\s\S]*?<\/button>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}
/** Seller boilerplate that the marketplace expresses structurally (shipping, carriers, chatter). */
function stripBoilerplate(text) {
  return text
    .replace(/\s*Not CGC!\s*/gi, " ")
    .replace(/[^.!?\n]*(?:only shipping to (?:the )?us|shipped with ups|carefully packaged|any questions just ask|helping you accomplish|our top goal)[^.!?\n]*[.!?]?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const money = (s) => {
  const n = Number.parseFloat(String(s ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

// ── Grading details from the WooCommerce name ──────────────────────────────────
function gradeFromName(name) {
  const grader = /\bCBCS\b/i.test(name) ? "CBCS" : /\bCGC\b/i.test(name) || /\bgraded\b/i.test(name) ? "CGC" : "Raw";
  const m = name.match(/\b(?:CGC|CBCS|Graded|CGC-)\s*(?:SS\s*)?(?:NM\/MT|NM\/M|VF\/NM|FN\/VF|FINE\/VF|VG\/FN|GD\/VG|NM\+|NM-|VF\+|VF-|FN\+|FN-|VG\+|VG-|GD\+|GD-|NM|VF|FN|VG|GD|FR|PR|MINT)?\s*-?\s*(10\.0|[0-9]\.[0-9]|0\.5)\b/i);
  const grade = m ? m[1] : null;
  const signature = /\bSS\b|signature series|signed/i.test(name);
  const restored = /\brestored\b/i.test(name);
  return { grader, grade, signature, restored };
}

// ── Convert ────────────────────────────────────────────────────────────────────
const dropped = new Set(profile.drop ?? []);
const listings = [];
const problems = [];
const seenSlugs = new Set();
for (const r of rows) {
  const id = Number.parseInt(r[C.id], 10);
  if (!Number.isFinite(id) || dropped.has(id)) continue;
  if (r[C.published] !== "1") continue;
  const o = profile.overrides[id];
  if (!o) {
    problems.push(`row ${id}: no profile entry — skipped ("${r[C.name]}")`);
    continue;
  }
  const name = fixEncoding(r[C.name]);
  const g = gradeFromName(name);
  const grader = o.grader ?? g.grader;
  const grade = o.grade ?? g.grade;
  if (!grade) {
    problems.push(`row ${id}: could not read a grade from "${name}"`);
    continue;
  }
  const label = o.label ?? (g.restored ? "Restored (Purple)" : g.signature ? (grader === "CBCS" ? "Verified Signature (Yellow)" : "Signature Series (Yellow)") : "Universal Blue");
  const regular = money(r[C.regular]);
  const sale = money(r[C.sale]);
  const price = sale ?? regular;
  if (!price) {
    problems.push(`row ${id}: no usable price`);
    continue;
  }
  const categories = r[C.categories].split(",").map((s) => s.trim()).filter(Boolean);
  const characters = categories.filter((c) => c.startsWith("Character/Title > ")).map((c) => c.slice("Character/Title > ".length).replace(/^Super Man$/, "Superman").replace(/^Wonder Women$/, "Wonder Woman").replace(/^Spider Man$/, "Spider-Man"));
  const mode = o.descriptionMode ?? "keep";
  const rawDescription = mode === "keep" ? stripBoilerplate(htmlToText(r[C.description] ?? "")) : "";
  const description = mode === "keep" && rawDescription ? rawDescription : (o.description ?? "");
  if (!description) {
    problems.push(`row ${id}: no description available`);
    continue;
  }
  const attributes = { ...(characters.length ? { Character: characters.join(", ") } : {}), ...(o.attributes ?? {}) };
  if (!attributes["Page quality"]) {
    const pq = `${name} ${description}`.match(/\b(cream to off-white|off-white to white|off-white|white|cream)\s+pages?\b/i);
    if (pq) attributes["Page quality"] = `${pq[1][0].toUpperCase()}${pq[1].slice(1).toLowerCase()} pages`;
  }
  const slugBase = o.slug ?? slugify(`${o.title} ${o.issue} ${grader} ${grade}`);
  let slug = slugBase;
  for (let n = 2; seenSlugs.has(slug); n++) slug = `${slugBase}-${n}`;
  seenSlugs.add(slug);
  const [writer, artist, cover] = o.creators ?? ["Various", "Various", "Various"];
  const gradeLabel = grader === "Raw" ? `raw ${grade}` : `${grader} ${grade}`;
  const summary = `${o.title} ${o.issue} (${o.publisher}, ${o.year}) — ${o.keyIssue}. ${gradeLabel}${attributes["Page quality"] ? `, ${attributes["Page quality"].toLowerCase()}` : ""}.`;
  const highlights = [
    o.keyIssue,
    `${grader === "Raw" ? "Raw" : grader} ${grade}${label !== "Universal Blue" ? ` — ${label.replace(/ \((Yellow|Purple)\)$/, "")}` : ""}${attributes["Page quality"] ? `, ${attributes["Page quality"].toLowerCase()}` : ""}`,
    `${o.publisher}, ${o.year} — ${o.era}`,
    ...(writer !== "Various" || cover !== "Various" ? [`${writer !== "Various" ? `Written by ${writer}` : ""}${writer !== "Various" && cover !== "Various" ? "; " : ""}${cover !== "Various" ? `cover by ${cover}` : ""}`] : []),
    ...(attributes["Signed by"] ? [`Signed by ${attributes["Signed by"]}`] : []),
    ...(o.certNumber ? [`Certification number ${o.certNumber}, verifiable on the ${grader} website`] : []),
  ];
  listings.push({
    sourceId: id,
    sourceName: name,
    seller: o.seller ?? null,
    slug,
    title: o.title,
    issue: o.issue,
    publisher: o.publisher,
    year: o.year,
    era: o.era,
    grader,
    grade,
    label,
    certNumber: o.certNumber ?? null,
    price,
    compareAt: sale && regular && regular > sale ? regular : null,
    stock: 1,
    keyIssue: o.keyIssue,
    creators: { writer, artist, cover },
    summary,
    description,
    highlights,
    palette: o.palette ?? ["#1c2130", "#e11d48"],
    featured: Boolean(o.featured),
    attributes,
    tags: [...new Set([...characters, o.era, grader, ...(label !== "Universal Blue" ? [label.replace(/ \(.*\)$/, "")] : [])])],
    allowedCountries: o.allowedCountries ?? [],
    coverSlug: o.coverSlug ?? slugify(`${o.title} ${o.issue.replace("#", "")}`),
    coverFile: slugify(`${o.title} ${o.issue.replace("#", "")}`),
    sourceImages: (r[C.images] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
}

const out = { source: profile.source, generatedAt: new Date().toISOString(), sellers: profile.sellers, listings };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`${listings.length} listings, ${profile.sellers.length} sellers → ${outPath}`);
for (const p of problems) console.warn("WARN", p);
const bySeller = listings.reduce((m, l) => m.set(l.seller ?? "(house)", (m.get(l.seller ?? "(house)") ?? 0) + 1), new Map());
console.log([...bySeller].map(([k, v]) => `${k}: ${v}`).join(", "));
