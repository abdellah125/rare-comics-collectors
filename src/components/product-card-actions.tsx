"use client";

import Link from "next/link";
import { AddToCartButton, BuyNowButton } from "@/components/buy-buttons";
import { useT } from "@/components/i18n-provider";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { productToLine } from "@/lib/cart-lines";
import type { ProductSummary } from "@/lib/products";

/** The two cart buttons on a product card — the only part of a server-rendered card that hydrates. */
export function ProductCardActions({ product }: { product: ProductSummary }) {
  const tr = useT();
  const line = productToLine(product);
  const soldOut = product.stock <= 0;
  // Sold by bidding: no cart buttons, the bid form is on the product page.
  if (product.auction) {
    return soldOut ? (
      <span className="py-2 text-center text-[13px] font-medium text-ink-500">{tr("Bidding closed")}</span>
    ) : (
      <Link href={`/store/${product.slug}#bid`} className={`${buttonStyles.primary} ${buttonSizes.sm} w-full`}>
        {tr("Place bid")}
      </Link>
    );
  }
  return (
    <>
      <BuyNowButton line={line} size="sm" disabled={soldOut} className="w-full" />
      <AddToCartButton line={line} size="sm" disabled={soldOut} className="w-full" />
    </>
  );
}
