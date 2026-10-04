import { parseCsv } from "../../../scripts/lib/csv.mjs";
import { parseHipcomicCsv } from "../../../scripts/lib/hipcomic-csv.mjs";

/**
 * Reads the data the store is authorised to use into one row shape. Three inputs are accepted:
 *   1. the search-result export the catalogue has been built from so far (scraper column names);
 *   2. a CSV with plain headers (id, url, title, price, image, publisher, year, issue, grade…);
 *   3. a JSON array of objects with the same field names (a partner feed or API response).
 * Nothing here contacts any site: it only parses text that was uploaded or fetched from the
 * configured feed address.
 */
export type SourceRow = {
  file: string;
  line: number;
  sourceId: string | null;
  url: string | null;
  image: string | null;
  imageHash: string | null;
  title: string;
  currency: string | null;
  price: number | null;
  approxUsd: number | null;
  seller: string;
  auction: boolean;
  problems: string[];
  extra: { publisher: string; year: string; series: string; issue: string; grade: string; grader: string; cert: string; description: string; variant: string; rawGrade?: string };
  /** true / false when the data says so; null when it does not say */
  available: boolean | null;
  /** structured details only fill what the title does not state (catalogue pages, where sellers' details can be wrong) */
  fillOnly?: boolean;
  /** a reason this row needs a person before it can be released */
  note?: string;
  /** false when the data says the book is raw (not in a grading company's holder); null/undefined when it does not say */
  slabbed?: boolean | null;
  /** the source's own Buy It Now price for an auction, in US$ minor units, when it has one */
  buyNow?: number | null;
};

const ALIASES: Record<string, string[]> = {
  id: ["id", "sku", "listing id", "listing_id", "listingid", "identifier", "source id", "source_id", "product id", "product_id"],
  url: ["url", "product url", "product_url", "link", "listing url", "listing_url", "reference"],
  title: ["title", "product title", "product_title", "name", "listing title"],
  price: ["price", "amount", "list price", "list_price"],
  currency: ["currency", "currency code", "currency_code"],
  image: ["image", "image url", "image_url", "photo", "images", "picture"],
  seller: ["seller", "store", "vendor"],
  publisher: ["publisher"],
  year: ["year", "publication year", "publication_year"],
  series: ["series", "series name", "comic title", "comic_title", "comic"],
  issue: ["issue", "issue number", "issue_number"],
  grade: ["grade"],
  grader: ["grader", "grading company", "grading_company", "grading service"],
  cert: ["cert", "cert number", "cert_number", "certification", "certification number", "certification_number"],
  description: ["description", "product description", "product_description"],
  variant: ["variant"],
  availability: ["availability", "available", "status", "in stock", "in_stock", "stock", "quantity"],
};

const moneyOf = (value: unknown): { amount: number | null; currency: string | null } => {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: Math.round(value * 100), currency: null };
  const text = String(value ?? "").trim();
  const m = /^(CA|AU|NZ|US)?\$?\s?([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})?$/.exec(text);
  if (!m) return { amount: null, currency: null };
  return { amount: Math.round(Number(m[2].replace(/,/g, "")) * 100), currency: m[1] ? `${m[1]}D` : (m[3] ?? null) };
};

/** "sold", "0", "false", "out of stock" → false; "available", "in stock", a positive number → true; anything else → null. */
export function availabilityOf(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/^(sold|sold out|out of stock|unavailable|ended|inactive|false|no|0)$/.test(text)) return false;
  if (/^(available|in stock|active|true|yes|[1-9]\d*)$/.test(text)) return true;
  return null;
}

function fromRecord(record: Record<string, unknown>, file: string, line: number): SourceRow {
  const lower = new Map(Object.entries(record).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const pick = (field: string): unknown => {
    for (const alias of ALIASES[field]) if (lower.has(alias) && lower.get(alias) !== "" && lower.get(alias) != null) return lower.get(alias);
    return undefined;
  };
  const text = (field: string) => {
    const v = pick(field);
    return Array.isArray(v) ? String(v[0] ?? "").trim() : String(v ?? "").trim();
  };
  const problems: string[] = [];
  const url = text("url") || null;
  const sourceId = text("id") || (url ? (/\/(\d+)\/?(?:[?#].*)?$/.exec(url)?.[1] ?? null) : null);
  const money = moneyOf(pick("price"));
  const image = text("image") || null;
  const title = text("title");
  if (!sourceId) problems.push("no identifier");
  if (!title) problems.push("no title");
  if (money.amount === null) problems.push("no readable price");
  if (!image || !/^https:\/\//i.test(image)) problems.push("no image");
  return {
    file,
    line,
    sourceId,
    url,
    image: image && /^https:\/\//i.test(image) ? image : null,
    imageHash: image,
    title,
    currency: money.amount === null ? null : (text("currency").toUpperCase() || money.currency || "USD"),
    price: money.amount,
    approxUsd: null,
    seller: text("seller"),
    auction: false,
    problems,
    extra: { publisher: text("publisher"), year: text("year"), series: text("series"), issue: text("issue"), grade: text("grade"), grader: text("grader"), cert: text("cert"), description: text("description"), variant: text("variant") },
    available: availabilityOf(pick("availability")),
  };
}

export class SourceFormatError extends Error {}

/** Parses uploaded or fetched text. Throws SourceFormatError when it is neither CSV nor JSON we understand. */
export function readSource(text: string, fileName: string): SourceRow[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new SourceFormatError("The file is empty.");
  if (/^<(!doctype|html)/i.test(trimmed)) throw new SourceFormatError("The source answered with a web page instead of data (often an access check). Nothing was imported.");
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new SourceFormatError("The data looks like JSON but could not be parsed.");
    }
    const list = Array.isArray(json) ? json : ((["items", "products", "listings", "data", "results"].map((k) => (json as Record<string, unknown>)[k]).find(Array.isArray) as unknown[] | undefined) ?? null);
    if (!list) throw new SourceFormatError("The JSON has no list of products (expected an array, or an object with items / products / listings).");
    return list.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null).map((r, i) => fromRecord(r, fileName, i + 1));
  }
  const table = parseCsv(trimmed) as string[][];
  const header = (table[0] ?? []).map((h) => h.trim());
  if (header.includes("text-h5") || header.includes("r-listing__image-wrapper href")) {
    const parsed = parseHipcomicCsv(trimmed, fileName) as { rows: (Omit<SourceRow, "extra" | "available"> & { line: number })[]; table: string[][]; header: string[] };
    const lowerHeader = parsed.header.map((h) => h.toLowerCase());
    const cell = (line: number, re: RegExp) => {
      const i = lowerHeader.findIndex((h) => re.test(h));
      return i >= 0 ? (parsed.table[line - 1]?.[i] ?? "").trim() : "";
    };
    return parsed.rows.map((r) => ({
      ...r,
      extra: { publisher: cell(r.line, /^publisher$/), year: cell(r.line, /^(?:year|publication year)$/), series: cell(r.line, /^series(?: name)?$/), issue: cell(r.line, /^issue(?: number)?$/), grade: cell(r.line, /^grade$/), grader: cell(r.line, /^grad(?:er|ing company)$/), cert: cell(r.line, /^cert/), description: cell(r.line, /^description$/), variant: cell(r.line, /^variant$/) },
      available: availabilityOf(cell(r.line, /^(?:availability|available|status)$/)),
    }));
  }
  const lowerHeader = header.map((h) => h.toLowerCase());
  if (!ALIASES.title.some((a) => lowerHeader.includes(a))) throw new SourceFormatError("The CSV has no title column. Expected the search-result export, or headers such as id, url, title, price, image.");
  return table.slice(1).filter((cells) => cells.some((c) => c.trim())).map((cells, i) => fromRecord(Object.fromEntries(header.map((h, n) => [h, cells[n] ?? ""])), fileName, i + 2));
}
