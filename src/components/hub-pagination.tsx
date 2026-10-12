import Link from "@/components/link";

/** Page 1 lives at the bare address; later pages at ?page=N. */
export const pageHref = (base: string, page: number) => (page <= 1 ? base : `${base}?page=${page}`);

/**
 * The page number from ?page=, or null when it is not a page that exists (the caller answers 404).
 * "?page=1" counts as invalid too, so page 1 has a single address.
 */
export function readPage(value: string | string[] | undefined, pages: number): number | null {
  if (value === undefined) return 1;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!/^[1-9]\d{0,4}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return n >= 2 && n <= pages ? n : null;
}

/** Page numbers to show: the first, the last, and two either side of the current one, with gaps. */
function window(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

/**
 * Numbered pages as plain links, so search engines reach every product on a collection or
 * publisher page without running any script.
 */
export function HubPagination({ base, page, pages, label }: { base: string; page: number; pages: number; label: string }) {
  if (pages <= 1) return null;
  const item = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold";
  return (
    <nav aria-label={label} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={pageHref(base, page - 1)} rel="prev" className={`${item} border-ink-200 bg-white text-ink-800 hover:border-ink-400`}>
          ← Previous
        </Link>
      )}
      {window(page, pages).map((n, i) =>
        n === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-ink-400" aria-hidden>
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={`${item} border-ink-950 bg-ink-950 text-white`}>
            {n}
          </span>
        ) : (
          <Link key={n} href={pageHref(base, n)} className={`${item} border-ink-200 bg-white text-ink-800 hover:border-ink-400`}>
            {n}
          </Link>
        ),
      )}
      {page < pages && (
        <Link href={pageHref(base, page + 1)} rel="next" className={`${item} border-ink-200 bg-white text-ink-800 hover:border-ink-400`}>
          Next →
        </Link>
      )}
    </nav>
  );
}
