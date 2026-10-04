"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { convertFromBase, formatMoney } from "@/lib/money";

export type ClientCurrency = { code: string; symbol: string; decimals: number; rateToBase: number; isBase: boolean };

const DEFAULT: ClientCurrency = { code: "USD", symbol: "$", decimals: 2, rateToBase: 1, isBase: true };
const Ctx = createContext<{ currency: ClientCurrency; locale: string }>({ currency: DEFAULT, locale: "en-US" });

/** Presentment currency chosen by the visitor (server decides; client only formats). */
export function CurrencyProvider({ currency, locale = "en-US", children }: { currency: ClientCurrency; locale?: string; children: ReactNode }) {
  const value = useMemo(() => ({ currency, locale }), [currency, locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrice() {
  const { currency, locale } = useContext(Ctx);
  const convert = (baseMinor: number) => (currency.isBase ? baseMinor : convertFromBase(baseMinor, currency));
  return {
    currency,
    convert,
    /** Whole-unit amounts drop the decimals (e.g. $1,250). */
    format: (baseMinor: number) => formatMoney(convert(baseMinor), currency.code, locale, { compact: true }),
    /** Always shows decimals (totals, line items). */
    formatExact: (baseMinor: number) => formatMoney(convert(baseMinor), currency.code, locale),
    /** Amount already in the presentment currency's minor units. */
    formatPresentment: (minor: number) => formatMoney(minor, currency.code, locale),
  };
}
