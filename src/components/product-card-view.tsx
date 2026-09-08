import Link from "next/link";
import type { ReactNode } from "react";
import { CoverArt } from "@/components/cover-art";
import { Badge, Stars } from "@/components/ui";
import type { ProductSummary } from "@/lib/products";

/**
 * The product card's markup, hook-free so the same component renders on the
 * server (home, collections, publishers, storefronts, related books) and in the
 * client-side store browser. Prices arrive pre-formatted; the cart buttons come
 * in through `actions` and are the only part that hydrates.
 */
export function ProductCardView({
  product,
  priceLabel,
  compareAtLabel,
  actions,
  priority = false,
  deferPaint = false,
}: {
  product: ProductSummary;
  priceLabel: string;
  compareAtLabel?: string;
  actions: ReactNode;
  priority?: boolean;
  /** Below the first row: let the browser skip layout and paint until the card scrolls near. */
  deferPaint?: boolean;
}) {
  const onSale = compareAtLabel !== undefined;
  const soldOut = product.stock <= 0;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift ${deferPaint ? "[content-visibility:auto] [contain-intrinsic-size:auto_540px]" : ""}`}
    >
      <CoverArt product={product} priority={priority} className="aspect-[2/3] w-full" />

      <div className="flex flex-1 flex-col p-4">
        {/* Badges live in the body: every corner of the cover plate already carries a chip. */}
        {(onSale || product.keyIssue || (product.stock === 1 && !soldOut)) && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {onSale && <Badge tone="sale">Sale</Badge>}
            {product.keyIssue && <Badge tone="gold">Key issue</Badge>}
            {product.stock === 1 && !soldOut && <Badge tone="dark">Last copy</Badge>}
          </div>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          {product.publisher} · {product.era}
        </p>

        <h3 className="mt-1.5 font-display text-[17px] font-semibold leading-snug text-ink-950">
          <Link href={`/store/${product.slug}`} className="hover:text-brand-700">
            <span className="absolute inset-0 z-0" aria-hidden />
            {product.title} {product.issue}
          </Link>
        </h3>

        <p className="mt-1 text-[13px] text-ink-600">
          {product.grader === "Raw" ? (
            <>Raw · {product.grade}</>
          ) : (
            <>
              <span className="font-semibold text-ink-900">
                {product.grader} {product.grade}
              </span>{" "}
              · {product.label.replace(/ \((Yellow|Purple|Green|Blue)\)$/, "")}
            </>
          )}
        </p>

        {product.keyIssue && <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ink-500">{product.keyIssue}</p>}

        <div className="mt-3">
          <Stars rating={product.rating} count={product.reviewCount} />
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold tabular-nums text-ink-950">{priceLabel}</span>
            {onSale && <span className="text-sm text-ink-500 line-through tabular-nums">{compareAtLabel}</span>}
          </div>

          {/* z-10 keeps the buttons clickable above the card-wide link overlay */}
          <div className="relative z-10 mt-3 grid gap-2">{actions}</div>
        </div>
      </div>
    </article>
  );
}
