/**
 * Pricing of imported products. Pure.
 *
 *   retail price = source price × (1 + markup)        (25 % by default: $100 → $125)
 *
 * The source price and the markup are private to the admin and the database; the storefront only
 * ever reads the product's own price.
 */
export const DEFAULT_MARKUP_BPS = 2500;

/** Selling price in minor units for a source price in minor units. */
export function retailPrice(sourceMinor: number, markupBps: number = DEFAULT_MARKUP_BPS): number {
  return Math.round((sourceMinor * (10_000 + markupBps)) / 10_000);
}

/** Margin over the source price, as an amount and in basis points of the source price. */
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
