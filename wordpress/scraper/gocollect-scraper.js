#!/usr/bin/env node
/**
 * gocollect-scraper.js
 * Scrapes recent CGC sales from GoCollect.com for the 18 RCC target comics
 * and writes a WooCommerce-ready CSV to ../import/woo-products.csv
 *
 * Usage:
 *   node gocollect-scraper.js            # all comics
 *   node gocollect-scraper.js --era golden
 *   node gocollect-scraper.js --era silver
 *
 * Requirements: npm install (puppeteer csv-writer)
 */

'use strict';

const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');

// ── Target comics ─────────────────────────────────────────────────────────────

const COMICS = [
  // Golden Age
  { title:'Action Comics',           issue:'1',   year:1938, era:'golden', publisher:'DC Comics',     grade:'2.5', priceCents:125_000_000, sku:'AC-001-CGC-2-5' },
  { title:'Detective Comics',        issue:'27',  year:1939, era:'golden', publisher:'DC Comics',     grade:'4.0', priceCents: 75_000_000, sku:'DC-027-CGC-4-0' },
  { title:'Marvel Comics',           issue:'1',   year:1939, era:'golden', publisher:'Timely Comics', grade:'4.5', priceCents: 28_500_000, sku:'MC-001-CGC-4-5' },
  { title:'Superman',                issue:'1',   year:1939, era:'golden', publisher:'DC Comics',     grade:'5.0', priceCents: 42_500_000, sku:'SM-001-CGC-5-0' },
  { title:'Batman',                  issue:'1',   year:1940, era:'golden', publisher:'DC Comics',     grade:'4.0', priceCents: 19_500_000, sku:'BM-001-CGC-4-0' },
  { title:'Captain America Comics',  issue:'1',   year:1941, era:'golden', publisher:'Timely Comics', grade:'4.5', priceCents: 45_000_000, sku:'CA-001-CGC-4-5' },
  { title:'All Star Comics',         issue:'8',   year:1942, era:'golden', publisher:'DC Comics',     grade:'4.5', priceCents: 38_500_000, sku:'AS-008-CGC-4-5' },
  { title:'Flash Comics',            issue:'1',   year:1940, era:'golden', publisher:'DC Comics',     grade:'6.0', priceCents: 22_500_000, sku:'FC-001-CGC-6-0' },
  { title:'Whiz Comics',             issue:'2',   year:1940, era:'golden', publisher:'Fawcett',       grade:'5.5', priceCents: 11_500_000, sku:'WC-002-CGC-5-5' },
  { title:'Green Lantern',           issue:'1',   year:1941, era:'golden', publisher:'DC Comics',     grade:'7.0', priceCents:  8_500_000, sku:'GL-001-CGC-7-0' },
  // Silver Age
  { title:'Showcase',                issue:'4',   year:1956, era:'silver', publisher:'DC Comics',     grade:'5.5', priceCents: 17_500_000, sku:'SC-004-CGC-5-5' },
  { title:'Fantastic Four',          issue:'1',   year:1961, era:'silver', publisher:'Marvel Comics', grade:'4.0', priceCents: 14_500_000, sku:'FF-001-CGC-4-0' },
  { title:'Amazing Fantasy',         issue:'15',  year:1962, era:'silver', publisher:'Marvel Comics', grade:'5.0', priceCents: 48_500_000, sku:'AF-015-CGC-5-0' },
  { title:'Incredible Hulk',         issue:'1',   year:1962, era:'silver', publisher:'Marvel Comics', grade:'5.0', priceCents: 15_500_000, sku:'IH-001-CGC-5-0' },
  { title:'X-Men',                   issue:'1',   year:1963, era:'silver', publisher:'Marvel Comics', grade:'6.0', priceCents: 22_500_000, sku:'XM-001-CGC-6-0' },
  { title:'Avengers',                issue:'1',   year:1963, era:'silver', publisher:'Marvel Comics', grade:'7.0', priceCents:  9_500_000, sku:'AV-001-CGC-7-0' },
  { title:'Tales of Suspense',       issue:'39',  year:1963, era:'silver', publisher:'Marvel Comics', grade:'5.0', priceCents:  6_500_000, sku:'TS-039-CGC-5-0' },
  { title:'Brave and the Bold',      issue:'28',  year:1960, era:'silver', publisher:'DC Comics',     grade:'6.0', priceCents: 12_000_000, sku:'BB-028-CGC-6-0' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const delay      = ms => new Promise(r => setTimeout(r, ms));
const RATE_MS    = 4000;   // 4 s between pages — be polite
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36';

// ── Scrape one comic from GoCollect ──────────────────────────────────────────

async function scrapeComic(browser, comic) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(USER_AGENT);
  // Block images/fonts to speed up loading
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','font','media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  try {
    const slug    = comic.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    const pubSlug = comic.publisher.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    const url     = `https://gocollect.com/comics/${pubSlug}/${slug}/${comic.issue}`;

    process.stdout.write(`  → ${comic.title} #${comic.issue}  `);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    await delay(2500); // React hydration

    const data = await page.evaluate(() => {
      // FMV (fair market value) — GoCollect shows this prominently
      const fmvEl   = document.querySelector('[class*="fmv"],[class*="FairMarket"],[data-testid*="fmv"]');
      const fmvNum  = fmvEl ? parseInt(fmvEl.innerText.replace(/[^0-9]/g,''), 10) : null;

      // Recent sales rows
      const rows  = [...document.querySelectorAll('[class*="sale"],[class*="Sale"],tbody tr')];
      const sales = rows.map(r => {
        const txt   = r.innerText;
        const grade = (txt.match(/\b(\d\.\d)\b/) || [])[1];
        const price = (txt.match(/\$([\d,]+)/)   || [])[1];
        return (grade && price) ? { grade: parseFloat(grade), price: parseInt(price.replace(/,/g,''),10) } : null;
      }).filter(Boolean).slice(0, 5);

      return { fmvCents: fmvNum ? fmvNum * 100 : null, sales };
    });

    await page.close();
    console.log(data.fmvCents ? `FMV $${(data.fmvCents/100).toLocaleString()}` : '(using list price)');
    return { ...comic, fmvCents: data.fmvCents, sales: data.sales, scraped: true };

  } catch (err) {
    await page.close().catch(() => {});
    console.log(`FAILED — ${err.message.slice(0, 60)}`);
    return { ...comic, fmvCents: null, sales: [], scraped: false };
  }
}

// ── CSV column map ────────────────────────────────────────────────────────────

const CSV_HEADER = [
  { id:'type',       title:'Type' },
  { id:'sku',        title:'SKU'  },
  { id:'name',       title:'Name' },
  { id:'published',  title:'Published' },
  { id:'featured',   title:'Is featured?' },
  { id:'shortdesc',  title:'Short description' },
  { id:'desc',       title:'Description' },
  { id:'instock',    title:'In stock?' },
  { id:'stock',      title:'Stock' },
  { id:'reviews',    title:'Allow customer reviews?' },
  { id:'price',      title:'Regular price' },
  { id:'categories', title:'Categories' },
  { id:'tags',       title:'Tags' },
  { id:'era',        title:'meta:_rcc_era'       },
  { id:'grader',     title:'meta:_rcc_grader'    },
  { id:'grade',      title:'meta:_rcc_grade'     },
  { id:'year',       title:'meta:_rcc_year'      },
  { id:'issue',      title:'meta:_rcc_issue'     },
  { id:'key_issue',  title:'meta:_rcc_key_issue' },
  { id:'writer',     title:'meta:_rcc_writer'    },
  { id:'artist',     title:'meta:_rcc_artist'    },
];

function buildRow(comic) {
  const cents    = comic.fmvCents || comic.priceCents;
  const priceUsd = (cents / 100).toFixed(2);
  const eraLabel = comic.era === 'golden' ? 'Golden Age' : 'Silver Age';
  const pub      = comic.publisher.toLowerCase().replace(/\s+/g, '-');
  return {
    type:       'simple',
    sku:        comic.sku,
    name:       `${comic.title} #${comic.issue} (${comic.year}) CGC ${comic.grade}`,
    published:  1,
    featured:   cents >= 10_000_000 ? 1 : 0,
    shortdesc:  `${eraLabel} key. ${comic.publisher}. CGC ${comic.grade} certified copy.`,
    desc:       `${comic.title} #${comic.issue} (${comic.year}, ${comic.publisher}). A landmark of the ${eraLabel}, CGC graded ${comic.grade}.`,
    instock:    1,
    stock:      1,
    reviews:    1,
    price:      priceUsd,
    categories: `Comics > ${eraLabel}`,
    tags:       `${comic.era === 'golden' ? 'golden-age' : 'silver-age'}, cgc, key-issue, ${pub}`,
    era:        eraLabel,
    grader:     'CGC',
    grade:      comic.grade,
    year:       comic.year,
    issue:      `#${comic.issue}`,
    key_issue:  comic.keyIssue  || '',
    writer:     comic.writer    || '',
    artist:     comic.artist    || '',
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const eraFlag   = args.indexOf('--era');
  const eraFilter = eraFlag !== -1 ? args[eraFlag + 1]?.toLowerCase() : null;
  const targets   = eraFilter ? COMICS.filter(c => c.era === eraFilter) : COMICS;

  console.log(`\n🎯  RCC GoCollect Scraper — ${targets.length} comics queued\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    results.push(await scrapeComic(browser, targets[i]));
    if (i < targets.length - 1) await delay(RATE_MS);
  }
  await browser.close();

  // Ensure output directory exists
  const fs     = require('fs');
  const outDir = path.resolve(__dirname, '../import');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'woo-products.csv');

  const writer = createObjectCsvWriter({ path: outPath, header: CSV_HEADER });
  await writer.writeRecords(results.map(buildRow));

  const ok   = results.filter(r => r.scraped).length;
  const fail = results.length - ok;
  console.log(`\n✅  ${ok}/${results.length} scraped from GoCollect.`);
  if (fail) console.log(`⚠   ${fail} used fallback prices (GoCollect blocked or page not found).`);
  console.log(`📄  CSV → ${outPath}\n`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
