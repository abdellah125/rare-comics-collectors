/**
 * Pure helpers that convert a Product or Service into a CartLine descriptor.
 * Lives in /lib (not a client component) so it can be imported from both
 * server pages and client components.
 */
import type { CartLine } from "@/components/cart-provider";
import type { Product } from "@/lib/products";
import type { Service } from "@/lib/services";

export function productToLine(product: Product): Omit<CartLine, "qty"> {
  return {
    id: `comic:${product.slug}`,
    kind: "comic",
    slug: product.slug,
    name: `${product.title} ${product.issue}`,
    meta: `${product.grader === "Raw" ? "Raw" : `${product.grader} ${product.grade}`} · ${product.publisher} · ${product.year}`,
    price: product.price,
    maxQty: product.stock,
    href: `/store/${product.slug}`,
    palette: product.palette,
  };
}

export function serviceToLine(service: Service): Omit<CartLine, "qty"> {
  return {
    id: `service:${service.slug}`,
    kind: "service",
    slug: service.slug,
    name: service.name,
    meta: service.priceNote,
    price: service.price ?? 0,
    maxQty: 25,
    href: `/services/${service.slug}`,
  };
}
