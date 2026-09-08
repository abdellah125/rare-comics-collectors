"use client";

import { AddToCartButton, BuyNowButton } from "@/components/buy-buttons";
import { productToLine } from "@/lib/cart-lines";
import type { ProductSummary } from "@/lib/products";

/** The two cart buttons on a product card — the only part of a server-rendered card that hydrates. */
export function ProductCardActions({ product }: { product: ProductSummary }) {
  const line = productToLine(product);
  const soldOut = product.stock <= 0;
  return (
    <>
      <BuyNowButton line={line} size="sm" disabled={soldOut} className="w-full" />
      <AddToCartButton line={line} size="sm" disabled={soldOut} className="w-full" />
    </>
  );
}
