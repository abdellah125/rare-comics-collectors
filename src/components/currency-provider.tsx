"use client";

import { createContext, useContext, type ReactNode } from "react";
import { convertFromBase, formatMoney } from "@/lib/money";

export type ClientCurrency = { code: string; symbol: string; decimals: number; rateToBase: number; isBase: boolean };

const DEFAULT: ClientCurrency = { code: "USD", symbol: "$", decimals: 2, rateToBase: 1, isBase: true };
const Ctx = createContext<ClientCurrency>(DEFAULT);

/** Presentment currency chosen by the visitor (server decides; client only formats). */
export function CurrencyProvider({ currency, children }: { currency: ClientCurrency; children: ReactNode }) {
  return <Ctx.Provider value={currency}>{children}</Ctx.Provider>;
}

export function usePrice() {
  const currency = useContext(Ctx);
  const convert = (baseMinor: number) => (currency.isBase ? baseMinor : convertFromBase(baseMinor, currency));
  return {
    currency,
    convert,
    /** Whole-unit amounts drop the decimals (e.g. $1,250). */
    format: (baseMinor: number) => formatMoney(convert(baseMinor), currency.code, "en-US", { compact: true }),
    /** Always shows decimals (totals, line items). */
    formatExact: (baseMinor: number) => formatMoney(convert(baseMinor), currency.code, "en-US"),
    /** Amount already in the presentment currency's minor units. */
    formatPresentment: (minor: number) => formatMoney(minor, currency.code, "en-US"),
  };
}
