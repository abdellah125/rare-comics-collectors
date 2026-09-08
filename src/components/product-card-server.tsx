import { ProductCardActions } from "@/components/product-card-actions";
import { ProductCardView } from "@/components/product-card-view";
import { priceFormatter } from "@/lib/currency";
import type { ProductSummary } from "@/lib/products";

/**
 * Server-rendered product card: the markup and cover plate arrive as HTML and
 * only the two cart buttons hydrate. Prices are formatted in the visitor's
 * presentment currency on the server (the same helper product pages use).
 */
export async function ProductCardServer({ product, priority = false, deferPaint = false }: { product: ProductSummary; priority?: boolean; deferPaint?: boolean }) {
  const { format } = await priceFormatter();
  const onSale = product.compareAt !== undefined && product.compareAt > product.price;
  return (
    <ProductCardView
      product={product}
      priceLabel={format(product.price, { compact: true })}
      compareAtLabel={onSale ? format(product.compareAt!, { compact: true }) : undefined}
      actions={<ProductCardActions product={product} />}
      priority={priority}
      deferPaint={deferPaint}
    />
  );
}
