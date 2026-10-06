/**
 * The store page's filters, as they travel in the address (/store?q=…&era=…). Shared by the
 * server, which runs the search, and the browser, which only edits the address: the catalogue
 * itself is never sent to the visitor.
 */
export type SortKey = "featured" | "price-asc" | "price-desc" | "year-asc" | "year-desc" | "grade-desc";
export const SORT_KEYS: SortKey[] = ["featured", "price-asc", "price-desc", "grade-desc", "year-asc", "year-desc"];

/** Price bands in cents; `max` is exclusive and null means no upper limit. */
export const PRICE_BANDS: { min: number; max: number | null }[] = [
  { min: 0, max: 25_000 },
  { min: 25_000, max: 100_000 },
  { min: 100_000, max: 1_000_000 },
  { min: 1_000_000, max: null },
];

/** Cards per "Show more" step, and the most one page will ever list. */
export const PAGE_SIZE = 24;
export const MAX_SHOWN = 480;

export type StoreFilters = {
  q: string;
  /** "" means all */
  era: string;
  publisher: string;
  grader: string;
  band: number | null;
  keysOnly: boolean;
  sort: SortKey;
  /** how many cards to list */
  show: number;
};

export const DEFAULT_FILTERS: StoreFilters = { q: "", era: "", publisher: "", grader: "", band: null, keysOnly: false, sort: "featured", show: PAGE_SIZE };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function parseStoreFilters(sp: Params): StoreFilters {
  const band = /^[0-9]$/.test(one(sp.price)) ? Number(one(sp.price)) : -1;
  const sort = one(sp.sort) as SortKey;
  const show = Number.parseInt(one(sp.show), 10);
  return {
    q: one(sp.q).slice(0, 120),
    era: one(sp.era).slice(0, 60),
    publisher: one(sp.publisher).slice(0, 120),
    grader: one(sp.grader).slice(0, 20),
    band: band >= 0 && band < PRICE_BANDS.length ? band : null,
    keysOnly: one(sp.keys) === "1",
    sort: SORT_KEYS.includes(sort) ? sort : "featured",
    // Whole steps only, so a hand-edited address cannot ask for an odd or huge page.
    show: Number.isFinite(show) ? Math.min(MAX_SHOWN, Math.max(PAGE_SIZE, Math.ceil(show / PAGE_SIZE) * PAGE_SIZE)) : PAGE_SIZE,
  };
}

/** "?q=…&era=…" with defaults left out, or "" when nothing is set. */
export function storeQueryString(f: StoreFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.era) p.set("era", f.era);
  if (f.publisher) p.set("publisher", f.publisher);
  if (f.grader) p.set("grader", f.grader);
  if (f.band !== null) p.set("price", String(f.band));
  if (f.keysOnly) p.set("keys", "1");
  if (f.sort !== "featured") p.set("sort", f.sort);
  if (f.show > PAGE_SIZE) p.set("show", String(f.show));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Number of filters that narrow the list (sorting and paging do not). */
export function activeFilterCount(f: StoreFilters): number {
  return (f.era ? 1 : 0) + (f.publisher ? 1 : 0) + (f.grader ? 1 : 0) + (f.band !== null ? 1 : 0) + (f.keysOnly ? 1 : 0) + (f.q.trim() ? 1 : 0);
}

/** The number in a grade such as "9.8" or "VF 8.0"; 0 when there is none. */
export function gradeValue(grade: string): number {
  const n = Number.parseFloat(grade.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
