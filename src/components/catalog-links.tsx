import Link from "next/link";
import type { Collection, Publisher } from "@/lib/catalog/collections";

/**
 * Internal-linking blocks shared by the home page, the store, the collection
 * and publisher landing pages and the footer. Plain server-rendered anchors so
 * crawlers reach every collection page from every catalogue page.
 */
export function CollectionCards({ collections, current, heading = "Shop by era" }: { collections: Collection[]; current?: string; heading?: string }) {
  const items = collections.filter((c) => c.slug !== current);
  if (items.length === 0) return null;
  return (
    <nav aria-label={heading}>
      <h2 className="font-display text-2xl font-semibold text-ink-950">{heading}</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/collections/${c.slug}`}
              className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
            >
              <span className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">{c.shortName}</span>
              <span className="mt-1 text-[13px] text-ink-500">{c.name !== c.shortName ? c.name.slice(c.shortName.length).trim().replace(/^\(|\)$/g, "") : "Collection"}</span>
              <span className="mt-3 text-[13px] font-semibold text-brand-700">
                {c.count} listing{c.count === 1 ? "" : "s"} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PublisherChips({ publishers, current, heading = "Shop by publisher" }: { publishers: Publisher[]; current?: string; heading?: string }) {
  const items = publishers.filter((p) => p.slug !== current);
  if (items.length === 0) return null;
  return (
    <nav aria-label={heading}>
      <h2 className="font-display text-2xl font-semibold text-ink-950">{heading}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {items.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/publishers/${p.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700"
            >
              {p.name}
              <span className="text-xs text-ink-400 tabular-nums">{p.count}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/publishers" className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            All publishers
          </Link>
        </li>
      </ul>
    </nav>
  );
}
