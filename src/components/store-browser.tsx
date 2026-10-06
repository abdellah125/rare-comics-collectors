"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ProductCard } from "@/components/product-card";
import { SearchIcon, CloseIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { useT } from "@/components/i18n-provider";
import { msg } from "@/lib/i18n/translate";
import { DEFAULT_FILTERS, PAGE_SIZE, activeFilterCount, storeQueryString, type SortKey, type StoreFilters } from "@/lib/catalog/store-filters";
import type { Era, Grader, ProductSummary } from "@/lib/products";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "featured", label: msg("Featured") },
  { value: "price-asc", label: msg("Price: low to high") },
  { value: "price-desc", label: msg("Price: high to low") },
  { value: "grade-desc", label: msg("Highest grade") },
  { value: "year-asc", label: msg("Oldest first") },
  { value: "year-desc", label: msg("Newest first") },
];

/** Labels for PRICE_BANDS, in the same order. */
const PRICE_LABELS = [msg("Under $250"), "$250 – $1,000", "$1,000 – $10,000", "$10,000+"];

/** How long typing has to pause before the search runs. */
const TYPING_PAUSE_MS = 300;

const fmt = (n: number) => n.toLocaleString("en-US");

type BrowserProps = {
  /** The cards to show: already filtered, sorted and cut to size by the server. */
  products: ProductSummary[];
  /** How many listings match the filters in all. */
  total: number;
  /** The filters the server applied (read from the address). */
  filters: StoreFilters;
  eras: Era[];
  publishers: string[];
  graders: Grader[];
};

/**
 * The store's search box, filters and grid. It holds no catalogue: a change of filter rewrites
 * the address (/store?q=…&era=…) and the server answers with the matching cards. The controls
 * update at once and the grid follows when the answer arrives, so typing and tapping stay
 * responsive on a slow phone. Links such as /store?q=… from elsewhere on the site work the same way.
 */
export function StoreBrowser({ products, total, filters, eras, publishers, graders }: BrowserProps) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  // What the controls show. It leads; the address and the grid follow.
  const [local, setLocal] = useState(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const latest = useRef(filters);
  const sent = useRef(storeQueryString(filters));
  const typing = useRef<number | null>(null);

  const go = (next: StoreFilters) => {
    const qs = storeQueryString(next);
    sent.current = qs;
    startTransition(() => router.replace(`${pathname}${qs}`, { scroll: false }));
  };
  /** Apply a change now (chips, sort, show more) or once typing pauses (the search box). */
  const update = (patch: Partial<StoreFilters>, wait = false) => {
    // Any change to the filters starts again from the first page of results.
    const next = { ...latest.current, show: PAGE_SIZE, ...patch };
    latest.current = next;
    setLocal(next);
    if (typing.current !== null) window.clearTimeout(typing.current);
    typing.current = null;
    if (wait) {
      typing.current = window.setTimeout(() => {
        typing.current = null;
        go(latest.current);
      }, TYPING_PAUSE_MS);
    } else go(next);
  };

  // A link elsewhere on the site (footer, guides) can change the address while this page is open:
  // take its filters. Answers to this component's own changes are recognised and left alone.
  const serverKey = storeQueryString(filters);
  useEffect(() => {
    if (serverKey === sent.current || typing.current !== null) return;
    sent.current = serverKey;
    latest.current = filters;
    setLocal(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);
  useEffect(
    () => () => {
      if (typing.current !== null) window.clearTimeout(typing.current);
    },
    [],
  );

  const { q: query, era, publisher, grader, band, keysOnly, sort } = local;
  const visible = products;
  // The cards only change when the server answers, not on every keystroke in the search box.
  const cards = useMemo(() => products.map((p, i) => <ProductCard key={p.slug} product={p} priority={i < 2} deferPaint={i >= 4} />), [products]);
  const remaining = Math.max(0, total - visible.length);
  const activeCount = activeFilterCount(local);
  const reset = () => update({ ...DEFAULT_FILTERS, sort });
  const showMore = () => update({ show: filters.show + PAGE_SIZE });

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? "border-brand-600 bg-brand-600 text-white"
        : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50"
    }`;

  const filterPanel = (
    <div className="grid gap-6">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Age / era")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(era === "")} aria-pressed={era === ""} onClick={() => update({ era: "" })}>
            {tr("All eras")}
          </button>
          {eras.map((e) => (
            <button key={e} type="button" className={chip(era === e)} aria-pressed={era === e} onClick={() => update({ era: e })}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Publisher")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={chip(publisher === "")}
            aria-pressed={publisher === ""}
            onClick={() => update({ publisher: "" })}
          >
            {tr("All publishers")}
          </button>
          {publishers.map((pub) => (
            <button
              key={pub}
              type="button"
              className={chip(publisher === pub)}
              aria-pressed={publisher === pub}
              onClick={() => update({ publisher: pub })}
            >
              {pub}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Grading")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(grader === "")} aria-pressed={grader === ""} onClick={() => update({ grader: "" })}>
            {tr("Any")}
          </button>
          {graders.map((g) => (
            <button key={g} type="button" className={chip(grader === g)} aria-pressed={grader === g} onClick={() => update({ grader: g })}>
              {g === "Raw" ? tr("Raw (unslabbed)") : g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Price")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(band === null)} aria-pressed={band === null} onClick={() => update({ band: null })}>
            {tr("Any price")}
          </button>
          {PRICE_LABELS.map((label, i) => (
            <button key={label} type="button" className={chip(band === i)} aria-pressed={band === i} onClick={() => update({ band: i })}>
              {tr(label)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Other")}</h3>
        <div className="mt-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={keysOnly}
              onChange={(e) => update({ keysOnly: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 accent-brand-600"
            />
            {tr("Key issues only")}
          </label>
        </div>
      </div>

      {activeCount > 0 && (
        <button type="button" onClick={reset} className={`${buttonStyles.quiet} ${buttonSizes.sm} justify-start px-0`}>
          <CloseIcon className="h-4 w-4" /> {tr("Clear all filters")}
        </button>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-10">
      {/* Sidebar */}
      <aside className="hidden lg:col-span-3 lg:block">
        <div className="sticky top-24">
          <h2 className="font-display text-lg font-semibold text-ink-950">{tr("Filter inventory")}</h2>
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
              onChange={(e) => update({ q: e.target.value }, true)}
              placeholder={tr("Search by title, publisher, creator or key…")}
              aria-label={tr("Search inventory")}
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
            {tr("Filters")}{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>

          <label className="ml-auto flex items-center gap-2 text-sm text-ink-600 sm:ml-0">
            <span className="hidden sm:inline">{tr("Sort")}</span>
            <select
              value={sort}
              onChange={(e) => update({ sort: e.target.value as SortKey })}
              aria-label={tr("Sort inventory")}
              className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {tr(s.label)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtersOpen && (
          <div id="mobile-filters" className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-5 lg:hidden">
            <h2 className="sr-only">{tr("Filter inventory")}</h2>
            {filterPanel}
          </div>
        )}

        <p className="mt-5 text-sm text-ink-500" aria-live="polite">
          {tr("Showing")} <span className="font-semibold text-ink-900">{fmt(visible.length)}</span> {tr("of")} {fmt(total)}{" "}
          {activeCount > 0 ? tr("matching listings") : tr("listings")}
          {activeCount > 0 && (
            <>
              {" · "}
              <button type="button" onClick={reset} className="font-medium text-brand-700 underline-offset-4 hover:underline">
                {tr("clear filters")}
              </button>
            </>
          )}
        </p>

        {total === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-ink-950">{tr("No books match those filters")}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
              {tr("Try widening your price band or clearing a filter. We can also source books to order — send us a want list and we'll hunt it down.")}
            </p>
            <button type="button" onClick={reset} className={`${buttonStyles.primary} ${buttonSizes.md} mt-6`}>
              {tr("Clear all filters")}
            </button>
          </div>
        ) : (
          <>
            <h2 className="sr-only">{tr("Listings")}</h2>
            <div className={`mt-6 grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
              {cards}
            </div>

            {remaining > 0 && (
              <div className="mt-10 flex flex-col items-center gap-2.5">
                <button type="button" onClick={showMore} disabled={pending} className={`${buttonStyles.outline} ${buttonSizes.md}`}>
                  {tr("Show {count} more", { count: Math.min(PAGE_SIZE, remaining) })}
                </button>
                <p className="text-[13px] text-ink-500">{tr("{count} more to load", { count: fmt(remaining) })}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
