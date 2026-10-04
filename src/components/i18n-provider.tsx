"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { INTL_LOCALE, isLocale } from "@/lib/i18n/config";
import { makeTranslator, type Dict, type Translator } from "@/lib/i18n/translate";

type I18n = { locale: string; intlLocale: string; tr: Translator };
const Ctx = createContext<I18n>({ locale: "en", intlLocale: "en-US", tr: makeTranslator(null) });

/** The visitor's language and its dictionary, decided on the server and handed to client components. */
export function I18nProvider({ locale, dict, children }: { locale: string; dict: Dict | null; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({ locale, intlLocale: isLocale(locale) ? INTL_LOCALE[locale] : "en-US", tr: makeTranslator(dict) }), [locale, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `const tr = useT()` in a client component, then `tr("Add to cart")`. */
export const useT = (): Translator => useContext(Ctx).tr;
export const useLocale = () => useContext(Ctx);
