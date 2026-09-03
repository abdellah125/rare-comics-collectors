"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { SearchIcon, CloseIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import type { Era, Grader, ProductSummary } from "@/lib/products";

type SortKey = "featured" | "price-asc" | "price-desc" | "year-asc" | "year-desc" | "grade-desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "grade-desc", label: "Highest grade" },
  { value: "year-asc", label: "Oldest first" },
  { value: "year-desc", label: "Newest first" },
];

const PRICE_BANDS = [
  { label: "Under $250", min: 0, max: 25_000 },
  { label: "$250 – $1,000", min: 25_000, max: 100_000 },
  { label: "$1,000 – $10,000", min: 100_000, max: 1_000_000 },
  { label: "$10,000+", min: 1_000_000, max: Number.POSITIVE_INFINITY },
];

/** Cards rendered per "Show more" step — keeps the initial DOM and image count sane for 1,500+ listings. */
const PAGE_SIZE = 24;

const fmt = (n: number) => n.toLocaleString("en-US");

function gradeValue(p: ProductSummary) {
  const n = Number.parseFloat(p.grade.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type BrowserProps = {
  products: ProductSummary[];
  eras: Era[];
  publishers: string[];
  graders: Grader[];
};

/**
 * Filterable, paginated inventory grid. Deep links like /store?q=… or
 * /store?era=Golden+Age (used by the footer and advertised in the SearchAction
 * structured data) are read by the store page on the server and passed in as
 * initial state; the page re-keys this component so following a new deep link
 * while already on /store starts fresh.
 */
export function StoreBrowser({
  products,
  eras,
  publishers,
  graders,
  initialQuery = "",
  initialEra = "all",
}: BrowserProps & { initialQuery?: string; initialEra?: Era | "all" }) {
  const [query, setQuery] = useState(initialQuery);
  const [era, setEra] = useState<Era | "all">(initialEra);
  const [publisher, setPublisher] = useState<string | "all">("all");
  const [grader, setGrader] = useState<Grader | "all">("all");
  const [band, setBand] = useState<number | null>(null);
  const [keysOnly, setKeysOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // How many cards to show, remembered against the filter set that produced it
  // so any change to the filters naturally drops back to the first page.
  const [limitFor, setLimitFor] = useState<{ key: string; limit: number } | null>(null);

  // Build the search text once per product instead of on every keystroke.
  const indexed = useMemo(
    () =>
      products.map((p) => ({
        p,
        text: `${p.title} ${p.issue} ${p.publisher} ${p.era} ${p.grader} ${p.grade} ${p.keyIssue ?? ""} ${p.creators.writer} ${p.creators.artist}`.toLowerCase(),
      })),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const priceBand = band !== null ? PRICE_BANDS[band] : null;
    const list: ProductSummary[] = [];
    for (const { p, text } of indexed) {
      if (era !== "all" && p.era !== era) continue;
      if (publisher !== "all" && p.publisher !== publisher) continue;
      if (grader !== "all" && p.grader !== grader) continue;
      if (keysOnly && !p.keyIssue) continue;
      if (priceBand && (p.price < priceBand.min || p.price >= priceBand.max)) continue;
      if (q && !text.includes(q)) continue;
      list.push(p);
    }

    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "year-asc":
        list.sort((a, b) => a.year - b.year);
        break;
      case "year-desc":
        list.sort((a, b) => b.year - a.year);
        break;
      case "grade-desc":
        list.sort((a, b) => gradeValue(b) - gradeValue(a));
        break;
      default:
        list.sort(
          (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.reviewCount - a.reviewCount,
        );
    }
    return list;
  }, [indexed, query, era, publisher, grader, band, keysOnly, sort]);

  const filterKey = [query, era, publisher, grader, band, keysOnly, sort].join("|");
  const limit = limitFor?.key === filterKey ? limitFor.limit : PAGE_SIZE;
  const visible = filtered.slice(0, limit);
  const remaining = filtered.length - visible.length;
  const showMore = () => setLimitFor({ key: filterKey, limit: limit + PAGE_SIZE });

  const activeCount =
    (era !== "all" ? 1 : 0) +
    (publisher !== "all" ? 1 : 0) +
    (grader !== "all" ? 1 : 0) +
    (band !== null ? 1 : 0) +
    (keysOnly ? 1 : 0) +
    (query ? 1 : 0);

  const reset = () => {
    setQuery("");
    setEra("all");
    setPublisher("all");
    setGrader("all");
    setBand(null);
    setKeysOnly(false);
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
    }`;

  const filterPanel = (
    <div className="grid gap-6">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Age / era</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(era === "all")} aria-pressed={era === "all"} onClick={() => setEra("all")}>
            All eras
          </button>
          {eras.map((e) => (
            <button key={e} type="button" className={chip(era === e)} aria-pressed={era === e} onClick={() => setEra(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Publisher</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={chip(publisher === "all")}
            aria-pressed={publisher === "all"}
            onClick={() => setPublisher("all")}
          >
            All publishers
          </button>
          {publishers.map((pub) => (
            <button
              key={pub}
              type="button"
              className={chip(publisher === pub)}
              aria-pressed={publisher === pub}
              onClick={() => setPublisher(pub)}
            >
              {pub}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Grading</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(grader === "all")} aria-pressed={grader === "all"} onClick={() => setGrader("all")}>
            Any
          </button>
          {graders.map((g) => (
            <button key={g} type="button" className={chip(grader === g)} aria-pressed={grader === g} onClick={() => setGrader(g)}>
              {g === "Raw" ? "Raw (unslabbed)" : g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Price</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(band === null)} aria-pressed={band === null} onClick={() => setBand(null)}>
            Any price
          </button>
          {PRICE_BANDS.map((b, i) => (
            <button key={b.label} type="button" className={chip(band === i)} aria-pressed={band === i} onClick={() => setBand(i)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Other</h3>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={keysOnly}
              onChange={(e) => setKeysOnly(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 accent-brand-600"
            />
            Key issues only
          </label>
        </div>
      </div>

      {activeCount > 0 && (
        <button type="button" onClick={reset} className={`${buttonStyles.quiet} ${buttonSizes.sm} justify-start px-0`}>
          <CloseIcon className="h-4 w-4" /> Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-10">
      {/* Sidebar */}
      <aside className="hidden lg:col-span-3 lg:block">
        <div className="sticky top-24">
          <h2 className="font-display text-lg font-semibold text-ink-950">Filter inventory</h2>
          <div className="mt-6">{filterPanel}</div>
        </div>
      </aside>

      <div className="lg:col-span-9">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Full-width on phones so the placeholder isn't squeezed to a few letters */}
          <div className="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, publisher, creator or key…"
              aria-label="Search inventory"
              className="h-11 w-full rounded-lg border border-ink-200 bg-white pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`${buttonStyles.outline} ${buttonSizes.md} lg:hidden`}
            aria-expanded={filtersOpen}
            aria-controls="mobile-filters"
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-ink-600 sm:ml-0">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort inventory"
              className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtersOpen && (
          <div id="mobile-filters" className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-5 lg:hidden">
            <h2 className="sr-only">Filter inventory</h2>
            {filterPanel}
          </div>
        )}

        <p className="mt-5 text-sm text-ink-500" aria-live="polite">
          Showing <span className="font-semibold text-ink-900">{fmt(visible.length)}</span> of {fmt(filtered.length)}{" "}
          {activeCount > 0 ? "matching listings" : "listings"}
          {activeCount > 0 && (
            <>
              {" · "}
              <button type="button" onClick={reset} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                clear filters
              </button>
            </>
          )}
        </p>

        {filtered.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-ink-950">No books match those filters</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
              Try widening your price band or clearing a filter. We can also source books to order — send us a want
              list and we&apos;ll hunt it down.
            </p>
            <button type="button" onClick={reset} className={`${buttonStyles.primary} ${buttonSizes.md} mt-6`}>
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Listings</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((p, i) => (
                <ProductCard key={p.slug} product={p} priority={i < 3} />
              ))}
            </div>

            {remaining > 0 && (
              <div className="mt-10 flex flex-col items-center gap-2.5">
                <button type="button" onClick={showMore} className={`${buttonStyles.outline} ${buttonSizes.md}`}>
                  Show {Math.min(PAGE_SIZE, remaining)} more
                </button>
                <p className="text-[13px] text-ink-500">{fmt(remaining)} more to load</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
