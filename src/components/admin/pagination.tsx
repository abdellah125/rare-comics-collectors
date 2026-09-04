import Link from "next/link";

function withParams(base: string, params: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...overrides })) if (v !== undefined && v !== "") sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Pagination({ base, params, page, pages, total, per }: { base: string; params: Record<string, string | undefined>; page: number; pages: number; total: number; per: number }) {
  if (total === 0) return null;
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-600">
      <span>
        Showing {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} href={withParams(base, params, { page: String(Math.max(1, page - 1)) })} className={`rounded-lg border border-ink-300 px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-ink-50"}`}>
          Previous
        </Link>
        <span className="px-2">
          Page {page} of {pages}
        </span>
        <Link aria-disabled={page >= pages} href={withParams(base, params, { page: String(Math.min(pages, page + 1)) })} className={`rounded-lg border border-ink-300 px-3 py-1.5 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-ink-50"}`}>
          Next
        </Link>
      </div>
    </nav>
  );
}

/** Column header that toggles sort direction while preserving filters. */
export function SortLink({ base, params, sortKey, label, current, dir }: { base: string; params: Record<string, string | undefined>; sortKey: string; label: string; current: string; dir: "asc" | "desc" }) {
  const active = current === sortKey;
  const nextDir = active && dir === "desc" ? "asc" : "desc";
  return (
    <Link href={withParams(base, params, { sort: sortKey, dir: nextDir, page: undefined })} className={`inline-flex items-center gap-1 hover:text-ink-900 ${active ? "text-ink-900" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      {label}
      <span aria-hidden className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </Link>
  );
}

export { withParams };
