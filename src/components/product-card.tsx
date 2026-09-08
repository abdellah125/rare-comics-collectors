"use client";

import { ProductCardActions } from "@/components/product-card-actions";
import { ProductCardView } from "@/components/product-card-view";
import { usePrice } from "@/components/currency-provider";
import type { ProductSummary } from "@/lib/products";

/**
 * Client-side product card for lists that filter and sort in the browser (the
 * store browser). Server-rendered lists use ProductCardServer instead, which
 * shares the same ProductCardView markup.
 */
export function ProductCard({ product, priority = false, deferPaint = false }: { product: ProductSummary; priority?: boolean; deferPaint?: boolean }) {
  const { format } = usePrice();
  const onSale = product.compareAt !== undefined && product.compareAt > product.price;
  return (
    <ProductCardView
      product={product}
      priceLabel={format(product.price)}
      compareAtLabel={onSale ? format(product.compareAt!) : undefined}
      actions={<ProductCardActions product={product} />}
      priority={priority}
      deferPaint={deferPaint}
    />
  );
}
