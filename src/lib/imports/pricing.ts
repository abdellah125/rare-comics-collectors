/**
 * Pricing of imported products. Pure.
 *
 *   selling price = source price × (1 − discount)        (25 % by default: $100 → $75)
 *
 * The rule is stored per item as a signed adjustment in basis points (−2500 = 25 % below the
 * source price), so an item keeps the rule it was imported with. The source price and the
 * discount are private to the admin and the database; the storefront only ever reads the
 * product's own price.
 */
export const DEFAULT_DISCOUNT_BPS = 2500;
/** Signed adjustment for the default rule: −2500. */
export const DEFAULT_ADJUSTMENT_BPS = -DEFAULT_DISCOUNT_BPS;

/** Signed adjustment for a discount percentage held in basis points (2500 → −2500). */
export const adjustmentForDiscount = (discountBps: number): number => -Math.max(0, Math.min(9_900, Math.round(discountBps)));

/** Selling price in minor units for a source price in minor units. */
export function retailPrice(sourceMinor: number, adjustmentBps: number = DEFAULT_ADJUSTMENT_BPS): number {
  return Math.round((sourceMinor * (10_000 + adjustmentBps)) / 10_000);
}

/** "25% discount" / "10% markup" for a signed adjustment. */
export function describeAdjustment(adjustmentBps: number): string {
  const pct = Math.abs(adjustmentBps) / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
  return adjustmentBps < 0 ? `${text}% discount` : adjustmentBps > 0 ? `${text}% markup` : "no adjustment";
}

/** Difference to the source price, as an amount and in basis points of the source price (negative = below it). */
export function marginOf(sourceMinor: number | null, retailMinor: number | null): { amount: number; bps: number } | null {
  if (!sourceMinor || retailMinor === null) return null;
  return { amount: retailMinor - sourceMinor, bps: Math.round(((retailMinor - sourceMinor) * 10_000) / sourceMinor) };
}

export type Reprice = {
  /** the selling price after the change */
  retail: number;
  manual: boolean;
  /** whether the selling price moved */
  changed: boolean;
  /** what to tell the admin when a manual price was kept */
  note: string | null;
};

/**
 * What a new source price does to the selling price. A price nobody touched follows the source.
 * A price an admin set by hand is kept, with a note, unless automatic price synchronisation is on.
 */
export function reprice(input: { newSource: number; markupBps: number; currentRetail: number | null; manual: boolean; autoSync: boolean }): Reprice {
  const target = retailPrice(input.newSource, input.markupBps);
  if (input.currentRetail === null) return { retail: target, manual: false, changed: true, note: null };
  if (input.manual && !input.autoSync) {
    return { retail: input.currentRetail, manual: true, changed: false, note: target === input.currentRetail ? null : `Source price changed: the formula now gives ${(target / 100).toFixed(2)}, the manual price ${(input.currentRetail / 100).toFixed(2)} was kept.` };
  }
  return { retail: target, manual: false, changed: target !== input.currentRetail, note: null };
}
