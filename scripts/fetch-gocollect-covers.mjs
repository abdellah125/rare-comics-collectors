// Pulls real cover JPEGs from GoCollect's public comic pages (no login / API key needed)
// and saves them to public/covers/<slug>.jpg. CoverArt will prefer these when present.
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = process.cwd();
const outDir = path.join(root, "public", "covers");
fs.mkdirSync(outDir, { recursive: true });

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

// featured products (products.ts)
const psrc = fs.readFileSync(path.join(root, "src", "lib", "products.ts"), "utf8");
const targets = [];
{
  const re =
    /slug:\s*"([^"]+)",[\s\S]*?title:\s*"([^"]+)",[\s\S]*?issue:\s*"([^"]+)",[\s\S]*?publisher:\s*"([^"]+)",[\s\S]*?year:\s*(\d+),[\s\S]*?palette:\s*\[\s*"([^"]+)",\s*"([^"]+)"\s*\][\s\S]*?\n\s*\},/g;
  let m;
  while ((m = re.exec(psrc))) {
    targets.push({ slug: m[1], title: m[2], issue: m[3].replace("#", ""), publisher: m[4], year: m[5] });
  }
}

async function getComicCover(title, issue) {
  const tSlug = slug(title);
  const iSlug = slug(issue);
  // try `title-issue` then `title-<issue>` with and without trailing cover variant
  const candidates = [`${tSlug}-${iSlug}`, `${tSlug}-${issue.toLowerCase().replace(/\s/g, "-")}`];
  let lastErr = null;
  for (const pathSlug of candidates) {
    try {
      const url = `https://gocollect.com/comic/${pathSlug}`;
      const r = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html" },
        redirect: "follow",
      });
      if (!r.ok) throw new Error(`page ${r.status}`);
      const html = await r.text();
      // Grab the widest img.gocollect.com URL — it's the signed Imgix-style token
      const matches = [...html.matchAll(/https:\/\/img\.gocollect\.com\/([A-Za-z0-9_\-+/=]+)/g)].map((x) => x[0]);
      if (!matches.length) throw new Error("no cover img tag");
      return matches[0];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("no candidates produced");
}

async function download(url, file) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" } });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5_000) throw new Error("image too small");
  fs.writeFileSync(file, buf);
}

const map = {};
for (const t of targets) {
  const label = `${t.title} #${t.issue}`;
  try {
    const url = await getComicCover(t.title, t.issue);
    const out = path.join(outDir, `${t.slug}.jpg`);
    await download(url, out);
    map[t.slug] = `/covers/${t.slug}.jpg`;
    console.log(`OK   ${label}  ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
  } catch (e) {
    console.log(`FAIL ${label} — ${e.message}`);
  }
  await sleep(900);
}

fs.writeFileSync(path.join(root, "src", "lib", "gocovers-map.json"), JSON.stringify(map, null, 2));
console.log(`\n${Object.keys(map).length}/${targets.length} covers written`);
