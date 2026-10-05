/**
 * Bidding rules for products sold by auction. Pure (client and server).
 *
 * A bid is an offer, not a purchase: nothing is charged when it is placed. The store contacts the
 * bidder whose bid it accepts.
 */

/** The step a new bid must clear the current bid by, in minor units. */
export function bidIncrement(currentMinor: number): number {
  if (currentMinor < 1_000) return 50; // under $10: 50¢
  if (currentMinor < 10_000) return 100; // under $100: $1
  if (currentMinor < 50_000) return 500; // under $500: $5
  if (currentMinor < 100_000) return 1_000; // under $1,000: $10
  if (currentMinor < 500_000) return 2_500; // under $5,000: $25
  return 5_000;
}

/** The lowest bid that can be placed now. */
export const minimumBid = (currentMinor: number): number => currentMinor + bidIncrement(currentMinor);

export const auctionEnded = (endsAt: Date | string | null | undefined, now: Date = new Date()): boolean => Boolean(endsAt && new Date(endsAt).getTime() <= now.getTime());

/** Checks a bid amount typed by a visitor ("125", "$1,250.50"). Returns minor units or the reason it is refused. */
export function parseBid(input: string, currentMinor: number): { ok: true; amount: number } | { ok: false; message: string } {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: "Enter your bid as an amount, for example 125 or 125.50." };
  const amount = Math.round(Number.parseFloat(cleaned) * 100);
  const min = minimumBid(currentMinor);
  if (amount < min) return { ok: false, message: `Your bid must be at least $${(min / 100).toFixed(2)}.` };
  if (amount > 100_000_000) return { ok: false, message: "That bid is above the limit for online bids. Contact us to arrange it." };
  return { ok: true, amount };
}
