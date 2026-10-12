/**
 * Sitemaps, lastmod and price guides against the local database and a local server.
 *
 *   npx tsx --conditions=react-server tests/integration/seo-catalog.ts   (with `next start` on :3000)
 *
 * Every product it touches is put back as it was.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new PrismaClient();
  const { publishedWhere } = await import("@/lib/catalog/products");
  const base = process.env.SITE ?? "http://localhost:3000";
  const get = async (path: string) => (await fetch(base + path)).text();
  const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // ── lastmod moves only on a visible change ──
  const p = await db.product.findFirstOrThrow({ where: { ...publishedWhere, stock: { gte: 2 } }, select: { id: true, stock: true, price: true, viewCount: true, contentUpdatedAt: true } });
  try {
    const before = p.contentUpdatedAt.getTime();
    await sleep(20);
    await db.product.update({ where: { id: p.id }, data: { stock: p.stock + 1, viewCount: p.viewCount + 1 } });
    const a = await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { contentUpdatedAt: true, updatedAt: true } });
    check("a stock count or view change (still in stock) leaves lastmod alone", a.contentUpdatedAt.getTime() === before, a.contentUpdatedAt.toISOString());
    await db.product.update({ where: { id: p.id }, data: { price: p.price + 100 } });
    const b = await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { contentUpdatedAt: true } });
    check("a price change moves lastmod", b.contentUpdatedAt.getTime() > before && Math.abs(b.contentUpdatedAt.getTime() - Date.now()) < 60_000, b.contentUpdatedAt.toISOString());
    const c0 = b.contentUpdatedAt.getTime();
    await sleep(20);
    await db.product.update({ where: { id: p.id }, data: { stock: 0 } });
    const c = await db.product.findUniqueOrThrow({ where: { id: p.id }, select: { contentUpdatedAt: true } });
    check("selling out moves lastmod", c.contentUpdatedAt.getTime() > c0);
  } finally {
    await db.product.update({ where: { id: p.id }, data: { stock: p.stock, price: p.price, viewCount: p.viewCount, contentUpdatedAt: p.contentUpdatedAt } });
  }

  // ── every product is in a sitemap file (through the running site) ──
  const total = await db.product.count({ where: publishedWhere });
  const index = await get("/sitemap.xml");
  const files = locs(index).filter((l) => /products-\d+\.xml$/.test(l));
  const productUrls = (await Promise.all(files.map(async (f) => locs(await get(new URL(f).pathname))))).flat();
  check("every published product is in exactly one product sitemap", new Set(productUrls).size === total && productUrls.length === total, `${productUrls.length} entries, ${total} products, ${files.length} file(s)`);
  const siteXml = await get("/sitemaps/site.xml");
  check("the main sitemap no longer carries products or the tracking page", !/\/store\/[^<]/.test(siteXml) && !siteXml.includes("/track-order<"));
  const fileDates = [...index.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => new Date(m[1]).getTime());
  check("the index dates each file by its newest change, not the request time", fileDates.length > 0 && fileDates.every((d) => d < Date.now() - 1000));

  // ── price guides ──
  const { listPriceGuides, getPriceGuide } = await import("@/lib/catalog/price-guide");
  const guides = await listPriceGuides();
  check("price guides exist for key issues on sale", guides.length > 0, `${guides.length}`);
  if (guides.length) {
    const g = guides.find((x) => x.copies > 1) ?? guides[0];
    const page = await getPriceGuide(g.slug);
    check("a price guide lists every copy and prices by grade from them", page !== null && page.products.length === g.copies && page.grades.reduce((n, r) => n + r.copies, 0) === g.copies, `${g.title} ${g.issue}: ${g.copies} copies, ${page?.grades.length} grades`);
    check("its price range matches the copies", page !== null && Math.min(...page.products.map((p) => p.price)) === g.minPrice && Math.max(...page.products.map((p) => p.price)) === g.maxPrice);
    check("site sitemap lists the price guides", siteXml.includes(`/price-guide/${g.slug}<`));
  }
  check("an unknown slug has no price guide", (await getPriceGuide("no-such-comic-999")) === null);

  await db.$disconnect();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
