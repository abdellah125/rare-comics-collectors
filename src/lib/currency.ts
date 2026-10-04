import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Currency } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BASE_CURRENCY, convertFromBase, formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { INTL_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, countryFromHeaders, currencyForCountry, isCrawler, isLocale } from "@/lib/i18n/config";

export const CURRENCY_COOKIE = "rcc_currency";

export const getEnabledCurrencies = cache(async (): Promise<Currency[]> => {
  return db.currency.findMany({ where: { isEnabled: true }, orderBy: [{ isBase: "desc" }, { code: "asc" }] });
});

export async function getBaseCurrency(): Promise<Currency> {
  const base = await db.currency.findFirst({ where: { isBase: true } });
  if (base) return base;
  return { code: BASE_CURRENCY, name: "US Dollar", symbol: "$", decimals: 2, rateToBase: 1, isEnabled: true, isBase: true, rateSource: null, updatedAt: new Date() };
}

/**
 * The currency prices are shown in: the visitor's own choice (cookie, then account) if it is an
 * enabled currency, else the currency of their country when the store can be paid in it, else
 * the base currency. Crawlers always get the base currency, so indexed prices match the feed.
 */
export const getPresentmentCurrency = cache(async (): Promise<Currency> => {
  const settings = await getSettings();
  const base = await getBaseCurrency();
  if (!settings["features.multiCurrency"]) return base;
  // Cookie choice first (works for guests), then the signed-in user's saved preference.
  let code = (await cookies()).get(CURRENCY_COOKIE)?.value?.toUpperCase();
  if (!code) code = (await getCurrentUser())?.currency?.toUpperCase();
  const list = await getEnabledCurrencies();
  if (code) return code === base.code ? base : (list.find((c) => c.code === code) ?? base);
  if (!settings["commerce.autoCurrency"]) return base;
  const h = await headers();
  if (isCrawler(h.get("user-agent"))) return base;
  const local = currencyForCountry(countryFromHeaders(h));
  if (local === base.code) return base;
  // Only switch to a currency an online payment method accepts, so the visitor can still check out.
  const payable = new Set<string>([...(settings["payments.stripe.enabled"] ? settings["payments.stripe.currencies"] : []), ...(settings["payments.paypal.enabled"] ? settings["payments.paypal.currencies"] : [])]);
  if (!payable.has(local)) return base;
  return list.find((c) => c.code === local) ?? base;
});

export type PriceFormatter = (baseMinor: number, opts?: { compact?: boolean }) => string;

/**
 * Number-format locale for prices, read from the URL prefix or the saved language only (no
 * database access, so it is safe wherever prices are formatted).
 */
async function priceLocale(): Promise<string> {
  const code = (await headers()).get(LOCALE_HEADER) ?? (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(code) ? INTL_LOCALE[code] : "en-US";
}

/** A formatter bound to the visitor's presentment currency. */
export async function priceFormatter(locale?: string): Promise<{ currency: Currency; format: PriceFormatter; convert: (baseMinor: number) => number }> {
  const currency = await getPresentmentCurrency();
  const intl = locale ?? (await priceLocale());
  const convert = (baseMinor: number) => (currency.isBase ? baseMinor : convertFromBase(baseMinor, currency));
  return {
    currency,
    convert,
    format: (baseMinor, opts) => formatMoney(convert(baseMinor), currency.code, intl, opts),
  };
}

/** Pulls latest rates for enabled currencies from the configured API (frankfurter.app by default). */
export async function refreshExchangeRates(): Promise<{ updated: number; base: string }> {
  const base = await getBaseCurrency();
  const targets = (await db.currency.findMany({ where: { isBase: false } })).map((c) => c.code);
  if (targets.length === 0) return { updated: 0, base: base.code };
  const url = `${env.exchangeRateApiUrl}?base=${base.code}&symbols=${targets.join(",")}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Exchange rate API responded ${res.status}`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rates = data.rates ?? {};
  let updated = 0;
  for (const [code, rate] of Object.entries(rates)) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    await db.currency.updateMany({ where: { code }, data: { rateToBase: rate, rateSource: new URL(env.exchangeRateApiUrl).host } });
    updated += 1;
  }
  return { updated, base: base.code };
}
