/**
 * Converts a Shopify collection scrape (columns: image URL, product title, product URL,
 * vendor, price) into the marketplace's catalog-import JSON, using a profile that pins
 * every fact the CSV does not carry, and downloads the listing photos into public/covers.
 *
 *   node scripts/import-shopify-csv.mjs <export.csv> <profile> [out.json]
 *   e.g. node scripts/import-shopify-csv.mjs ~/certifiedcomic.csv certifiedcomic-2026-09
 *
 * Then `node scripts/optimize-covers.mjs` to produce the WebP/AVIF variants, and the seed
 * (prisma/seed.ts) creates the seller and listings idempotently on the next deploy.
 *
 * Pricing follows the profile: `pricing.discount` off the source price, then the nearest
 * price ending in one of `pricing.endings` (cents); ties go to the last ending listed.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [csvPath, profileName, outArg] = process.argv.slice(2);
if (!csvPath || !profileName) {
  console.error("usage: node scripts/import-shopify-csv.mjs <export.csv> <profile> [out.json]");
  process.exit(1);
}
const profile = await import(pathToFileURL(path.resolve("scripts/import-profiles", `${profileName}.mjs`)).href);
const outPath = outArg ?? path.join("prisma", "data", "catalog-imports", `${profileName}.json`);
const coversDir = path.join("public", "covers");
const mapPath = path.join("src", "lib", "gocovers-map.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

// ── CSV ────────────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// ── Pricing ────────────────────────────────────────────────────────────────────
export function discountedPrice(cents, { discount, endings }) {
  const target = cents * (1 - discount);
  const base = Math.floor(target / 100) * 100;
  const candidates = [];
  for (const b of [base - 100, base, base + 100]) for (const e of endings) if (b + e > 0) candidates.push(b + e);
  let best = candidates[0];
  for (const c of candidates) {
    const d = Math.abs(c - target);
    const bd = Math.abs(best - target);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && endings.indexOf(c % 100) > endings.indexOf(best % 100))) best = c;
  }
  return best;
}

const parsePrice = (s) => Math.round(Number(String(s).replace(/[^0-9.]/g, "")) * 100);
const handleOf = (url) => new URL(url).pathname.split("/").filter(Boolean).pop();

// ── Images ─────────────────────────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}
async function download(url, target) {
  if (fs.existsSync(target)) return false;
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" } });
  if (!res.ok) throw new Error(`image ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000) throw new Error(`image too small: ${url}`);
  fs.writeFileSync(target, buf);
  return true;
}

// ── Convert ────────────────────────────────────────────────────────────────────
const rows = parseCsv(fs.readFileSync(csvPath, "utf8")).slice(1);
fs.mkdirSync(coversDir, { recursive: true });
const mapRaw = fs.readFileSync(mapPath, "utf8");
const crlf = mapRaw.includes("\r\n");
const map = JSON.parse(mapRaw);
const listings = [];
const seenSlugs = new Set();
let downloaded = 0;

for (const [imageUrl, sourceName, productUrl, vendor, priceText] of rows) {
  const handle = handleOf(productUrl);
  const o = profile.listings[handle];
  if (!o) throw new Error(`No profile entry for ${handle} ("${sourceName}")`);
  if (seenSlugs.has(o.slug)) throw new Error(`Duplicate slug ${o.slug}`);
  seenSlugs.add(o.slug);

  const sourcePrice = parsePrice(priceText);
  const price = discountedPrice(sourcePrice, profile.pricing);

  // The product JSON gives the Shopify id (used for the SKU) and every photo, in order.
  const product = (await fetchJson(`${productUrl}.json`)).product;
  const photos = product.images.map((i) => i.src.replace(/\?.*$/, ""));
  const front = imageUrl.replace(/\?.*$/, "").replace(/^https:\/\/certifiedcomic\.shop\/cdn\/shop\//, "https://cdn.shopify.com/s/files/1/0764/1271/5263/");
  const ordered = [front, ...photos.filter((p) => path.basename(p) !== path.basename(front))];
  const gallery = [];
  for (const [i, src] of ordered.entries()) {
    const file = i === 0 ? o.slug : `${o.slug}-${i === 1 ? "back" : `photo-${i}`}`;
    const ext = (path.extname(new URL(src).pathname) || ".jpg").toLowerCase();
    const target = path.join(coversDir, `${file}${ext === ".jpeg" ? ".jpg" : ext}`);
    if (await download(src, target)) downloaded += 1;
    const publicPath = `/covers/${path.basename(target)}`;
    if (i === 0) map[o.slug] = fs.existsSync(target.replace(/\.(jpe?g|png)$/i, ".webp")) ? publicPath.replace(/\.(jpe?g|png)$/i, ".webp") : publicPath;
    else gallery.push(publicPath.replace(/\.(jpe?g|png)$/i, ".webp"));
  }

  listings.push({
    sourceId: product.id,
    sourceName,
    sourceUrl: productUrl,
    sourcePrice,
    seller: profile.sellers[0].key,
    slug: o.slug,
    title: o.title,
    issue: o.issue,
    publisher: o.publisher,
    year: o.year,
    era: o.era,
    grader: o.grader,
    grade: o.grade,
    label: o.label,
    certNumber: o.certNumber ?? null,
    price,
    compareAt: null,
    stock: 1,
    keyIssue: o.keyIssue ?? null,
    creators: o.creators,
    summary: o.summary,
    description: o.description,
    highlights: o.highlights,
    palette: o.palette,
    featured: false,
    attributes: o.attributes,
    tags: o.tags,
    allowedCountries: [],
    coverSlug: o.slug,
    coverFile: o.slug,
    gallery,
    sourceImages: ordered,
    sourceVendor: vendor,
  });
  console.log(`${o.slug.padEnd(52)} ${(sourcePrice / 100).toFixed(2).padStart(9)} → ${(price / 100).toFixed(2).padStart(9)}  photos ${ordered.length}`);
}

let json = JSON.stringify(map, null, 2) + "\n";
if (crlf) json = json.replace(/\n/g, "\r\n");
fs.writeFileSync(mapPath, json);
fs.writeFileSync(outPath, JSON.stringify({ source: profile.source, generatedAt: new Date().toISOString(), pricing: profile.pricing, sellers: profile.sellers, listings }, null, 2) + "\n");
console.log(`${listings.length} listings → ${outPath}; ${downloaded} photo(s) downloaded`);
