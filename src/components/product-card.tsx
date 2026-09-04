"use client";

import Link from "next/link";
import { CoverArt } from "@/components/cover-art";
import { AddToCartButton, BuyNowButton } from "@/components/buy-buttons";
import { productToLine } from "@/lib/cart-lines";
import { Badge, Stars } from "@/components/ui";
import { usePrice } from "@/components/currency-provider";
import type { ProductSummary } from "@/lib/products";

export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const { format } = usePrice();
  const line = productToLine(product);
  const onSale = product.compareAt !== undefined && product.compareAt > product.price;
  const soldOut = product.stock <= 0;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift">
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
              · {product.label.replace(" (Yellow)", "")}
            </>
          )}
        </p>

        {product.keyIssue && <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ink-500">{product.keyIssue}</p>}

        <div className="mt-3">
          <Stars rating={product.rating} count={product.reviewCount} />
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-semibold tabular-nums text-ink-950">
              {format(product.price)}
            </span>
            {onSale && (
              <span className="text-sm text-ink-400 line-through tabular-nums">{format(product.compareAt!)}</span>
            )}
          </div>

          {/* z-10 keeps the buttons clickable above the card-wide link overlay */}
          <div className="relative z-10 mt-3 grid gap-2">
            <BuyNowButton line={line} size="sm" disabled={soldOut} className="w-full" />
            <AddToCartButton line={line} size="sm" disabled={soldOut} className="w-full" />
          </div>
        </div>
      </div>
    </article>
  );
}
