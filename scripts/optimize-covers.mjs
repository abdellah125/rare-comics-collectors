/**
 * Re-encodes the JPEG/PNG cover scans referenced by src/lib/gocovers-map.json as WebP
 * (max 640px wide — twice the widest grid slot) and points the map at the new files.
 * The originals stay in place because product records and the seed still reference them.
 *
 *   node scripts/optimize-covers.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const mapPath = "src/lib/gocovers-map.json";
const raw = fs.readFileSync(mapPath, "utf8");
const crlf = raw.includes("\r\n");
const map = JSON.parse(raw);

let converted = 0;
let before = 0;
let after = 0;
for (const [slug, url] of Object.entries(map)) {
  if (typeof url !== "string" || !/\.(jpe?g|png)$/i.test(url)) continue;
  const src = path.join("public", url);
  if (!fs.existsSync(src)) continue;
  const outUrl = url.replace(/\.(jpe?g|png)$/i, ".webp");
  const out = path.join("public", outUrl);
  await sharp(src).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
  before += fs.statSync(src).size;
  after += fs.statSync(out).size;
  map[slug] = outUrl;
  converted += 1;
}

let json = JSON.stringify(map, null, 2) + "\n";
if (crlf) json = json.replace(/\n/g, "\r\n");
fs.writeFileSync(mapPath, json);
console.log(`converted ${converted} cover(s): ${(before / 1024).toFixed(0)} KiB → ${(after / 1024).toFixed(0)} KiB`);
