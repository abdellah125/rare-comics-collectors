import vm from "node:vm";
import type { SourceRow } from "@/lib/imports/source";

/**
 * Reads one catalogue (search) page of the source. The page ships its listings as data inside
 * the HTML, so everything the queue needs is on the page itself and no listing page has to be
 * opened: one request per catalogue page.
 */
export class PageFormatError extends Error {}

type Listing = {
  id?: number | string;
  _id?: number | string;
  name?: string;
  listing_type?: string;
  username?: string;
  currency?: string;
  quantity?: number;
  current_price?: number;
  active?: boolean;
  closed?: boolean;
  deleted?: boolean;
  nsfw?: boolean;
  images?: string[];
  url?: string;
  search?: { open?: boolean; sold?: boolean; price_usd?: number; catalog_condition?: { grade?: string; grader?: string; slabbed?: boolean; label_type?: string } };
  details?: { series_name?: string; issue_number?: string; publisher?: string };
};

/**
 * The page state is a JavaScript expression, not JSON. It is evaluated in an empty, isolated
 * context with code generation from strings switched off and a short time limit, and only plain
 * data is taken out of it.
 */
export function readPageState(html: string): { listings: Listing[]; total: number | null; exceeded: boolean } {
  const start = html.indexOf("window.__NUXT__=");
  if (start < 0) throw new PageFormatError("the page carries no listing data");
  const end = html.indexOf("</script>", start);
  const code = html.slice(start + "window.__NUXT__=".length, end).replace(/;\s*$/, "");
  if (code.length > 4_000_000 || !/^\(function\(/.test(code)) throw new PageFormatError("the page's listing data is not in the expected form");
  let state: unknown;
  try {
    const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
    state = JSON.parse(JSON.stringify(vm.runInContext(`(${code})`, context, { timeout: 2_000 })));
  } catch (err) {
    throw new PageFormatError(`the page's listing data could not be read (${err instanceof Error ? err.message : String(err)})`);
  }
  // The listings sit in the first data block that has them; found by shape, not by a fixed path.
  const blocks = (state as { data?: unknown[] })?.data;
  const block = Array.isArray(blocks) ? (blocks.find((b) => b && typeof b === "object" && Array.isArray((b as { searchListings?: unknown }).searchListings)) as { searchListings: Listing[]; searchListingsCount?: number; paginationExceeded?: boolean } | undefined) : undefined;
  if (!block) throw new PageFormatError("the page has no list of products");
  return { listings: block.searchListings.filter((l) => l && typeof l === "object"), total: typeof block.searchListingsCount === "number" ? block.searchListingsCount : null, exceeded: block.paginationExceeded === true };
}

const cents = (dollars: unknown) => (typeof dollars === "number" && Number.isFinite(dollars) ? Math.round(dollars * 100) : null);

/**
 * One listing → one queue row. The title stays the first authority (the pipeline parses it); the
 * page's structured details only fill what the title does not state, because sellers' catalogue
 * matches are sometimes wrong. A series' start year is not a publication year and is not used.
 */
export function listingToRow(l: Listing, file: string, line: number, canonicalPublisher: (name: string) => string): SourceRow {
  const sourceId = l.id ?? l._id;
  const image = Array.isArray(l.images) && typeof l.images[0] === "string" && /^https:\/\//.test(l.images[0]) ? l.images[0] : null;
  const price = cents(l.current_price);
  const usd = cents(l.search?.price_usd);
  const currency = typeof l.currency === "string" ? l.currency.toUpperCase() : null;
  const condition = l.search?.catalog_condition ?? {};
  const problems: string[] = [];
  if (sourceId === undefined || sourceId === null) problems.push("no identifier");
  if (!l.name?.trim()) problems.push("no title");
  if (price === null || price <= 0) problems.push("no readable price");
  if (!image) problems.push("no image");
  const open = l.search?.open !== false && l.search?.sold !== true && l.active !== false && l.closed !== true && l.deleted !== true && (l.quantity ?? 1) > 0;
  const series = (l.details?.series_name ?? "").replace(/\s*\((?:19|20)\d\d\)\s*$/, "").trim();
  const publisher = (l.details?.publisher ?? "").trim();
  let note: string | undefined;
  if (l.nsfw === true) note = "flagged as adult content at the source (needs a manual look before Merchant Center)";
  else if (condition.slabbed === false) note = "raw book (not graded by CGC, CBCS or PGX): the grade and description need a person";
  return {
    file,
    line,
    sourceId: sourceId === undefined || sourceId === null ? null : String(sourceId),
    url: typeof l.url === "string" ? l.url.split(/[?#]/)[0] : null,
    image,
    imageHash: image,
    title: (l.name ?? "").trim(),
    currency: price === null ? null : (currency ?? "USD"),
    price,
    // The page states the US$ figure itself; used when the listing is priced in another currency.
    approxUsd: currency && currency !== "USD" ? usd : null,
    seller: (l.username ?? "").trim(),
    auction: l.listing_type === "auction",
    problems,
    extra: {
      publisher: publisher && !/^not specified$/i.test(publisher) ? canonicalPublisher(publisher) : "",
      year: "",
      series: /^not specified$/i.test(series) ? "" : series,
      issue: (l.details?.issue_number ?? "").trim(),
      grade: condition.slabbed ? (condition.grade ?? "").trim() : "",
      grader: condition.slabbed ? (condition.grader ?? "").trim() : "",
      cert: "",
      description: "",
      variant: "",
    },
    available: open,
    fillOnly: true,
    note,
  };
}
