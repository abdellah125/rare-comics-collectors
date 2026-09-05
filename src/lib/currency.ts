import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Currency } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { BASE_CURRENCY, convertFromBase, formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";

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
 * The currency prices are shown in: the visitor's cookie choice if it is an
 * enabled currency, otherwise the base currency.
 */
export const getPresentmentCurrency = cache(async (): Promise<Currency> => {
  const settings = await getSettings();
  const base = await getBaseCurrency();
  if (!settings["features.multiCurrency"]) return base;
  // Cookie choice first (works for guests), then the signed-in user's saved preference.
  let code = (await cookies()).get(CURRENCY_COOKIE)?.value?.toUpperCase();
  if (!code) code = (await getCurrentUser())?.currency?.toUpperCase();
  if (!code || code === base.code) return base;
  const list = await getEnabledCurrencies();
  return list.find((c) => c.code === code) ?? base;
});

export type PriceFormatter = (baseMinor: number, opts?: { compact?: boolean }) => string;

/** A formatter bound to the visitor's presentment currency. */
export async function priceFormatter(locale = "en-US"): Promise<{ currency: Currency; format: PriceFormatter; convert: (baseMinor: number) => number }> {
  const currency = await getPresentmentCurrency();
  const convert = (baseMinor: number) => (currency.isBase ? baseMinor : convertFromBase(baseMinor, currency));
  return {
    currency,
    convert,
    format: (baseMinor, opts) => formatMoney(convert(baseMinor), currency.code, locale, opts),
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
