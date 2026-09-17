/**
 * Reader for HipComic search-result scrapes. The scraper names columns after CSS classes and
 * the column order changes from file to file (20 layouts in the first 99 files), and a few rows
 * are shifted, so only the listing URL, image, title and price are taken by header name; every
 * other cell is classified by what it contains.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";

const COL = { url: "r-listing__image-wrapper href", image: "ssr-img__img src", title: "text-h5", price: "text-h2", seller: "rated-seller--shorten" };
const LISTING_URL = /^https:\/\/www\.hipcomic\.com\/listing\/[^/?#]+\/(\d+)\/?(?:[?#].*)?$/;
const IMAGE_URL = /^https:\/\/img\.hipcomic\.com\/p\/([0-9a-f]{16,})(?:-\d+)?\.(jpe?g|png|webp)$/i;
const PRICE = /^(CA|AU|NZ|US)?\$\s?([\d,]+(?:\.\d{1,2})?)$/;
const money = (s) => Math.round(Number(s.replace(/,/g, "")) * 100);

/** Natural order: hipcomic.csv, hipcomic (1).csv, hipcomic (2).csv … */
export function listCsvFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) for (const f of fs.readdirSync(input)) { if (/^hipcomic.*\.csv$/i.test(f)) files.push(path.join(input, f)); }
    else files.push(input);
  }
  const n = (f) => Number((path.basename(f).match(/\((\d+)\)/) ?? [0, 0])[1]);
  return [...new Set(files)].sort((a, b) => n(a) - n(b) || a.localeCompare(b));
}

/**
 * @returns {{ file: string, rows: Array<{ file: string, line: number, sourceId: string|null, url: string|null, image: string|null, imageHash: string|null,
 *   title: string, currency: string|null, price: number|null, approxUsd: number|null, seller: string, auction: boolean, sponsored: boolean, bestOffer: boolean,
 *   shipping: string|null, problems: string[] }> }}
 */
export function readHipcomicCsv(file) {
  const table = parseCsv(fs.readFileSync(file, "utf8"));
  const header = table[0].map((h) => h.trim());
  const rows = [];
  table.slice(1).forEach((cells, i) => {
    const get = (name) => (cells[header.indexOf(name)] ?? "").trim();
    const values = cells.map((c) => c.trim()).filter(Boolean);
    const problems = [];

    // Fixed columns, falling back to the first cell of the right shape when a row is shifted.
    const urlCell = LISTING_URL.test(get(COL.url)) ? get(COL.url) : values.find((v) => LISTING_URL.test(v));
    const sourceId = urlCell ? urlCell.match(LISTING_URL)[1] : null;
    const url = urlCell ? urlCell.split(/[?#]/)[0].replace(/\/$/, "") : null;
    const imageCell = IMAGE_URL.test(get(COL.image)) ? get(COL.image) : values.find((v) => IMAGE_URL.test(v));
    const imageHash = imageCell ? imageCell.match(IMAGE_URL)[1] : null;
    const title = get(COL.title);
    const priceCell = PRICE.test(get(COL.price)) ? get(COL.price) : "";
    const priceMatch = priceCell.match(PRICE);

    let approxUsd = null;
    let shipping = null;
    let auction = false;
    let sponsored = false;
    let bestOffer = false;
    for (const v of values) {
      if (/^Approx\.\s*\$/i.test(v)) approxUsd = money(v.replace(/^Approx\.\s*\$/i, ""));
      else if (/shipping$/i.test(v)) shipping = v;
      else if (/^bid now$/i.test(v) || /^\d+[dhm](?:\s+\d+[hms])?$/i.test(v)) auction = true;
      else if (/^sponsored$/i.test(v)) sponsored = true;
      else if (/^or best offer$/i.test(v)) bestOffer = true;
    }
    if (!sourceId) problems.push("no listing URL");
    if (!imageHash) problems.push("no image");
    if (!title) problems.push("no title");
    if (!priceMatch) problems.push("no readable price");

    rows.push({
      file: path.basename(file), line: i + 2, sourceId, url,
      image: imageHash ? `https://img.hipcomic.com/p/${imageHash}-800.jpg` : null, imageHash,
      title, currency: priceMatch ? (priceMatch[1] ? `${priceMatch[1].toUpperCase()}D` : "USD") : null,
      price: priceMatch ? money(priceMatch[2]) : null, approxUsd,
      seller: get(COL.seller), auction, sponsored, bestOffer, shipping, problems,
    });
  });
  return { file: path.basename(file), rows };
}
