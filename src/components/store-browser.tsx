"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { SearchIcon, CloseIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import type { Era, Grader, Product } from "@/lib/products";

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

function gradeValue(p: Product) {
  const n = Number.parseFloat(p.grade.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function StoreBrowser({
  products,
  eras,
  publishers,
  graders,
}: {
  products: Product[];
  eras: Era[];
  publishers: string[];
  graders: Grader[];
}) {
  const [query, setQuery] = useState("");
  const [era, setEra] = useState<Era | "all">("all");
  const [publisher, setPublisher] = useState<string | "all">("all");
  const [grader, setGrader] = useState<Grader | "all">("all");
  const [band, setBand] = useState<number | null>(null);
  const [keysOnly, setKeysOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (era !== "all" && p.era !== era) return false;
      if (publisher !== "all" && p.publisher !== publisher) return false;
      if (grader !== "all" && p.grader !== grader) return false;
      if (keysOnly && !p.keyIssue) return false;
      if (band !== null) {
        const b = PRICE_BANDS[band];
        if (p.price < b.min || p.price >= b.max) return false;
      }
      if (q) {
        const haystack =
          `${p.title} ${p.issue} ${p.publisher} ${p.era} ${p.grader} ${p.grade} ${p.keyIssue ?? ""} ${p.creators.writer} ${p.creators.artist}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "year-asc":
        sorted.sort((a, b) => a.year - b.year);
        break;
      case "year-desc":
        sorted.sort((a, b) => b.year - a.year);
        break;
      case "grade-desc":
        sorted.sort((a, b) => gradeValue(b) - gradeValue(a));
        break;
      default:
        sorted.sort(
          (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.reviewCount - a.reviewCount,
        );
    }
    return sorted;
  }, [products, query, era, publisher, grader, band, keysOnly, sort]);

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
          <button type="button" className={chip(era === "all")} onClick={() => setEra("all")}>
            All eras
          </button>
          {eras.map((e) => (
            <button key={e} type="button" className={chip(era === e)} onClick={() => setEra(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Publisher</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(publisher === "all")} onClick={() => setPublisher("all")}>
            All publishers
          </button>
          {publishers.map((pub) => (
            <button key={pub} type="button" className={chip(publisher === pub)} onClick={() => setPublisher(pub)}>
              {pub}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Grading</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(grader === "all")} onClick={() => setGrader("all")}>
            Any
          </button>
          {graders.map((g) => (
            <button key={g} type="button" className={chip(grader === g)} onClick={() => setGrader(g)}>
              {g === "Raw" ? "Raw (unslabbed)" : g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Price</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={chip(band === null)} onClick={() => setBand(null)}>
            Any price
          </button>
          {PRICE_BANDS.map((b, i) => (
            <button key={b.label} type="button" className={chip(band === i)} onClick={() => setBand(i)}>
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
          <div className="relative min-w-0 flex-1">
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
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>

          <label className="flex items-center gap-2 text-sm text-ink-600">
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
          <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-5 lg:hidden">{filterPanel}</div>
        )}

        <p className="mt-5 text-sm text-ink-500" aria-live="polite">
          Showing <span className="font-semibold text-ink-900">{filtered.length}</span> of {products.length} listings
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
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p, i) => (
              <ProductCard key={p.slug} product={p} priority={i < 3} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
