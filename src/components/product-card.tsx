"use client";

import { ProductCardActions } from "@/components/product-card-actions";
import { ProductCardView } from "@/components/product-card-view";
import { usePrice } from "@/components/currency-provider";
import type { ProductSummary } from "@/lib/products";

/** Product card for every grid; see ProductCardView for why it stays client-rendered. */
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
