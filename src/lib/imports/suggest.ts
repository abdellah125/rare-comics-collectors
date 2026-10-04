import { retailPrice } from "@/lib/imports/pricing";

/**
 * Suggested Buy It Now price for a product the source sells by auction. An auction has a current
 * bid, not a price, so the selling price is a suggestion the admin reviews. Pure.
 *
 * In order, the first that applies:
 *   1. the source's own Buy It Now price for that auction, less the store's discount;
 *   2. the median selling price of other listings of the same book in the same grade;
 *   3. the median of the nearest grade (within one point) of the same book;
 *   4. nothing to compare with: the current bid × a multiplier, with a minimum. This last rule is
 *      a setting, not a market figure, and the basis text says so.
 * The suggestion is never below the current bid.
 */
export type CompIndex = { exact: Map<string, number[]>; book: Map<string, { grade: number; price: number }[]> };
export const newCompIndex = (): CompIndex => ({ exact: new Map(), book: new Map() });

export const numericGrade = (grade: string): number | null => {
  const m = /(?<![\d.])(10(?:\.0)?|\d\.\d)(?![\d])/.exec(grade);
  return m ? Number(m[1]) : null;
};

export function addComp(index: CompIndex, c: { key: string; bookKey: string; grade: string; price: number | null }): void {
  if (c.price === null || c.price <= 0) return;
  if (c.key) index.exact.set(c.key, [...(index.exact.get(c.key) ?? []), c.price]);
  const g = numericGrade(c.grade);
  if (c.bookKey && g !== null) index.book.set(c.bookKey, [...(index.book.get(c.bookKey) ?? []), { grade: g, price: c.price }]);
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const usd = (minor: number) => `$${(minor / 100).toFixed(2)}`;

export type Suggestion = { price: number; basis: string; estimated: boolean };

export function suggestBuyNow(input: { buyNow: number | null; bid: number | null; key: string; bookKey: string; grade: string; comps: CompIndex; adjustmentBps: number; bidMultiplierPct: number; minPrice: number }): Suggestion {
  const bid = input.bid ?? 0;
  const floor = (price: number) => Math.max(price, bid);
  if (input.buyNow !== null && input.buyNow > 0) {
    return { price: floor(retailPrice(input.buyNow, input.adjustmentBps)), basis: `The source's own Buy It Now price for this auction (${usd(input.buyNow)}) less the store discount.`, estimated: false };
  }
  const exact = input.key ? (input.comps.exact.get(input.key) ?? []) : [];
  if (exact.length > 0) {
    return { price: floor(median(exact)), basis: `Median selling price of ${exact.length} other listing${exact.length === 1 ? "" : "s"} of the same book in the same grade.`, estimated: false };
  }
  const grade = numericGrade(input.grade);
  const book = input.bookKey ? (input.comps.book.get(input.bookKey) ?? []) : [];
  if (grade !== null && book.length > 0) {
    const nearest = Math.min(...book.map((c) => Math.abs(c.grade - grade)));
    if (nearest <= 1) {
      const near = book.filter((c) => Math.abs(c.grade - grade) === nearest);
      const grades = [...new Set(near.map((c) => c.grade.toFixed(1)))].join(" and ");
      return { price: floor(median(near.map((c) => c.price))), basis: `Median selling price of ${near.length} listing${near.length === 1 ? "" : "s"} of the same book in the nearest grade (${grades}); this copy is ${grade.toFixed(1)}.`, estimated: true };
    }
  }
  const price = Math.max(Math.round((bid * input.bidMultiplierPct) / 100), input.minPrice);
  return { price, basis: `Nothing to compare with: current bid${bid ? ` (${usd(bid)})` : ""} × ${(input.bidMultiplierPct / 100).toString()}, minimum ${usd(input.minPrice)}. This is the store's fallback rule, not a market price: check it before approving.`, estimated: true };
}
