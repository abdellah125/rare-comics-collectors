/**
 * Cover art pipeline for public/covers:
 *   1. every JPEG/PNG scan becomes a full-size WebP (≤640 px wide) and gocovers-map.json
 *      points at it (the originals stay for product records that still reference them);
 *   2. every full-size WebP gets 192, 256 and 384 px WebP siblings plus AVIF versions of all four
 *      sizes, which src/components/cover-art.tsx
 *      serves through `sizes`/`srcset` so a phone grid never downloads a desktop-sized scan.
 *
 * The scans are halftone comic art with very high entropy, so quality alone barely changes
 * the byte count; the right pixel size is what saves bandwidth. Files are treated as immutable
 * by the CDN (one-year cache), so a changed cover must get a new file name.
 *
 *   node scripts/optimize-covers.mjs            # only what is missing
 *   node scripts/optimize-covers.mjs --refresh  # re-encode everything
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const COVER_VARIANT_WIDTHS = [192, 256, 384];
const QUALITY = 72;
const dir = path.join("public", "covers");
const mapPath = "src/lib/gocovers-map.json";
const refresh = process.argv.includes("--refresh");
const isVariant = (f) => /-(192|256|384)\.webp$/.test(f);

const raw = fs.readFileSync(mapPath, "utf8");
const crlf = raw.includes("\r\n");
const map = JSON.parse(raw);

// 1. Scans → full-size WebP.
let converted = 0;
for (const f of fs.readdirSync(dir)) {
  if (!/\.(jpe?g|png)$/i.test(f)) continue;
  const out = path.join(dir, f.replace(/\.(jpe?g|png)$/i, ".webp"));
  if (fs.existsSync(out) && !refresh) continue;
  await sharp(path.join(dir, f)).resize({ width: 640, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(out);
  converted += 1;
}
for (const [slug, url] of Object.entries(map)) {
  if (typeof url === "string" && /\.(jpe?g|png)$/i.test(url) && fs.existsSync(path.join("public", url.replace(/\.(jpe?g|png)$/i, ".webp")))) map[slug] = url.replace(/\.(jpe?g|png)$/i, ".webp");
}

// 2. Full-size WebP → responsive variants. Prefer the original scan as the source when it exists.
let variants = 0;
let bytes = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".webp") || isVariant(f)) continue;
  const base = f.replace(/\.webp$/, "");
  const original = [".jpg", ".jpeg", ".png"].map((e) => path.join(dir, base + e)).find((p) => fs.existsSync(p)) ?? path.join(dir, f);
  for (const width of COVER_VARIANT_WIDTHS) {
    const out = path.join(dir, `${base}-${width}.webp`);
    if (fs.existsSync(out) && !refresh) continue;
    await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6, smartSubsample: true }).toFile(out);
    variants += 1;
    bytes += fs.statSync(out).size;
  }
  // AVIF siblings (~30% smaller than WebP on this halftone art) for every width including full size.
  for (const width of [...COVER_VARIANT_WIDTHS, 640]) {
    const out = path.join(dir, width === 640 ? `${base}.avif` : `${base}-${width}.avif`);
    if (fs.existsSync(out) && !refresh) continue;
    await sharp(original).resize({ width, withoutEnlargement: true }).avif({ quality: width >= 640 ? 55 : 50, effort: 4 }).toFile(out);
    variants += 1;
    bytes += fs.statSync(out).size;
  }
}

let json = JSON.stringify(map, null, 2) + "\n";
if (crlf) json = json.replace(/\n/g, "\r\n");
fs.writeFileSync(mapPath, json);
console.log(`${converted} scan(s) converted, ${variants} variant(s) written (${(bytes / 1024).toFixed(0)} KiB)`);
