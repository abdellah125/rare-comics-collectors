import type { CryptoAsset } from "@/lib/crypto-payments/assets";

/**
 * Amount arithmetic for crypto payments, in whole on-chain units (BigInt) so nothing is ever
 * rounded by floating point.
 *
 * A quoted amount has two parts:
 *   base     the order total converted at the quoted rate, rounded UP to `quoteDecimals`
 *   tag      two further digits (01–99) that make the amount unique among open payments
 *
 * All orders are paid to the same address, so the tag is how an incoming transfer is tied to
 * one order without trusting anything the buyer says. It costs the buyer less than one unit of
 * the last quoted decimal (under one cent for USDT).
 */
const pow10 = (n: number) => BigInt(10) ** BigInt(n);

/** Digits added after `quoteDecimals` to tell payments apart. */
export const TAG_DIGITS = 2;

/** A positive decimal rate ("86565.775") as an integer scaled by 1e8. */
export function rateToE8(rate: string | number): bigint {
  const s = typeof rate === "number" ? rate.toFixed(8) : rate.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid exchange rate");
  const [whole, frac = ""] = s.split(".");
  const v = BigInt(whole) * pow10(8) + BigInt((frac + "00000000").slice(0, 8));
  if (v <= BigInt(0)) throw new Error("Invalid exchange rate");
  return v;
}

/** USD cents at `usdPerCoin`, rounded up to the asset's quote precision, in on-chain units. */
export function baseAtomic(usdCents: number, usdPerCoin: string | number, asset: Pick<CryptoAsset, "decimals" | "quoteDecimals">): bigint {
  if (!Number.isInteger(usdCents) || usdCents <= 0) throw new Error("Invalid order amount");
  const q = asset.quoteDecimals;
  // coins = cents / 100 / rate; in quote units: cents * 1e8 * 10^q / (100 * rateE8), rounded up
  const num = BigInt(usdCents) * pow10(8) * pow10(q);
  const den = BigInt(100) * rateToE8(usdPerCoin);
  const quoteUnits = (num + den - BigInt(1)) / den;
  return quoteUnits * pow10(asset.decimals - q);
}

/** The base amount with a tag (1–99) in the two digits after the quote precision. */
export function withTag(base: bigint, tag: number, asset: Pick<CryptoAsset, "decimals" | "quoteDecimals">): bigint {
  if (!Number.isInteger(tag) || tag < 1 || tag > 99) throw new Error("Invalid tag");
  return base + BigInt(tag) * pow10(asset.decimals - asset.quoteDecimals - TAG_DIGITS);
}

/** On-chain units as a plain decimal string with exactly `places` decimals (no grouping): what a wallet accepts. */
export function atomicToDecimal(amount: bigint, decimals: number, places: number): string {
  const neg = amount < BigInt(0);
  const abs = neg ? -amount : amount;
  const whole = abs / pow10(decimals);
  const frac = (abs % pow10(decimals)).toString().padStart(decimals, "0").slice(0, places);
  return `${neg ? "-" : ""}${whole}${places > 0 ? `.${frac.padEnd(places, "0")}` : ""}`;
}

/** The amount a buyer is asked to send, to the precision that carries the tag. */
export function payDecimal(amount: bigint, asset: Pick<CryptoAsset, "decimals" | "quoteDecimals">): string {
  return atomicToDecimal(amount, asset.decimals, asset.quoteDecimals + TAG_DIGITS);
}

/** The same with thousands separators, for reading: "1,250.0037". */
export function groupDecimal(value: string): string {
  const [whole, frac] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac !== undefined ? `.${frac}` : ""}`;
}

/** An amount received on chain, trimmed of trailing zeros but never below `minPlaces`. */
export function receivedDecimal(amount: bigint, decimals: number, minPlaces: number): string {
  const full = atomicToDecimal(amount, decimals, decimals);
  const [whole, frac = ""] = full.split(".");
  let f = frac.replace(/0+$/, "");
  if (f.length < minPlaces) f = f.padEnd(minPlaces, "0");
  return f ? `${whole}.${f}` : whole;
}
