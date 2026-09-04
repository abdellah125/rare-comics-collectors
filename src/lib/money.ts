/**
 * Money helpers. All stored amounts are integers in minor units of the
 * currency they sit next to; the marketplace keeps books in a base currency
 * (USD) and converts for display using Currency.rateToBase.
 */
export type CurrencyInfo = { code: string; symbol: string; decimals: number; rateToBase: number };

export const BASE_CURRENCY = "USD";

export function formatMoney(amountMinor: number, currency = BASE_CURRENCY, locale = "en-US", opts?: { compact?: boolean }): string {
  const decimals = minorUnitDigits(currency);
  const value = amountMinor / 10 ** decimals;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: opts?.compact && value % 1 === 0 ? 0 : decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(decimals)}`;
  }
}

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF"]);
export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** Convert base minor units to another currency's minor units. */
export function convertFromBase(baseMinor: number, target: CurrencyInfo): number {
  const baseValue = baseMinor / 100;
  const targetValue = baseValue * target.rateToBase;
  return Math.round(targetValue * 10 ** target.decimals);
}

export function convertToBase(targetMinor: number, target: CurrencyInfo): number {
  const targetValue = targetMinor / 10 ** target.decimals;
  return Math.round((targetValue / target.rateToBase) * 100);
}

/** Basis points helper: 1250 bps = 12.5%. */
export function applyBps(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Parse "12.50" style decimal input into minor units. */
export function parseMoneyInput(input: string, currency = BASE_CURRENCY): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** minorUnitDigits(currency));
}
