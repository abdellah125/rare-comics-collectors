/**
 * Cover art for imported listings. The WooCommerce export's photo host is offline, so
 * each listing gets the issue's cover scan from GoCollect's public comic pages (the
 * same source the seed catalogue uses), re-encoded as a ≤640px WebP under
 * public/covers/<coverFile>.webp and registered in src/lib/gocovers-map.json under
 * every product slug that shares the issue.
 *
 *   node scripts/fetch-import-covers.mjs            # all files in prisma/data/catalog-imports
 *   node scripts/fetch-import-covers.mjs --refetch  # ignore files already present
 */
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import sharp from "sharp";

const root = process.cwd();
const importsDir = path.join(root, "prisma", "data", "catalog-imports");
const outDir = path.join(root, "public", "covers");
const mapPath = path.join(root, "src", "lib", "gocovers-map.json");
const refetch = process.argv.includes("--refetch");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

fs.mkdirSync(outDir, { recursive: true });
const mapRaw = fs.readFileSync(mapPath, "utf8");
const crlf = mapRaw.includes("\r\n");
const map = JSON.parse(mapRaw);

async function coverUrlFor(coverSlug) {
  const res = await fetch(`https://gocollect.com/comic/${coverSlug}`, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error(`page ${res.status}`);
  const html = await res.text();
  const m = html.match(/https:\/\/img\.gocollect\.com\/[A-Za-z0-9_\-+/=]+/);
  if (!m) throw new Error("no cover image on page");
  return m[0];
}

async function download(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" } });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000) throw new Error("image too small");
  return buf;
}

const files = fs.readdirSync(importsDir).filter((f) => f.endsWith(".json"));
let ok = 0;
let failed = 0;
const done = new Map(); // coverSlug -> public path | null
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(importsDir, file), "utf8"));
  for (const l of data.listings) {
    const coverSlug = l.coverSlug;
    const fileName = l.coverFile ?? coverSlug;
    const target = path.join(outDir, `${fileName}.webp`);
    const publicPath = `/covers/${fileName}.webp`;
    if (!done.has(coverSlug)) {
      if (fs.existsSync(target) && !refetch) {
        done.set(coverSlug, publicPath);
      } else {
        try {
          const buf = await download(await coverUrlFor(coverSlug));
          await sharp(buf).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72, effort: 6, smartSubsample: true }).toFile(target);
          for (const width of [192, 256, 384]) {
            await sharp(buf).resize({ width, withoutEnlargement: true }).webp({ quality: 72, effort: 6, smartSubsample: true }).toFile(target.replace(/\.webp$/, `-${width}.webp`));
            await sharp(buf).resize({ width, withoutEnlargement: true }).avif({ quality: 50, effort: 4 }).toFile(target.replace(/\.webp$/, `-${width}.avif`));
          }
          await sharp(buf).resize({ width: 640, withoutEnlargement: true }).avif({ quality: 55, effort: 4 }).toFile(target.replace(/\.webp$/, ".avif"));
          done.set(coverSlug, publicPath);
          ok += 1;
          console.log(`OK   ${l.title} ${l.issue} → ${publicPath} (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
        } catch (err) {
          done.set(coverSlug, null);
          failed += 1;
          console.log(`FAIL ${l.title} ${l.issue} (${coverSlug}) — ${err.message}`);
        }
        await sleep(900);
      }
    }
    const p = done.get(coverSlug);
    if (p) map[l.slug] = p;
    else delete map[l.slug];
  }
}

let json = JSON.stringify(map, null, 2) + "\n";
if (crlf) json = json.replace(/\n/g, "\r\n");
fs.writeFileSync(mapPath, json);
console.log(`\n${ok} fetched, ${failed} failed, ${[...done.values()].filter(Boolean).length}/${done.size} issues have a cover`);
