/**
 * Order pricing rules shared by the cart, checkout, product pages and the
 * shipping policy so every surface quotes the same numbers. Amounts in cents.
 */
export const FREE_SHIPPING_THRESHOLD = 25_000;
export const FLAT_SHIPPING = 1_495;
export const EXPRESS_SHIPPING = 3_995;

/** Texas state + local sales tax used for the checkout estimate. */
export const TAX_RATE = 0.0825;
export const TAX_LABEL = "TX 8.25%";

export function estimateShipping(subtotal: number, hasPhysical: boolean): number {
  return !hasPhysical || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
}

export function estimateTax(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE);
}
