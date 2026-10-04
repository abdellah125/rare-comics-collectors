import "server-only";
import type { Metadata } from "next";
import { getDictionary, getEnabledLocales, getLocale, getUrlLocale } from "@/lib/i18n";
import { DEFAULT_LOCALE, OG_LOCALE, isLocale, localizePath } from "@/lib/i18n/config";
import { makeTranslator } from "@/lib/i18n/translate";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

const absolute = (path: string) => `${site.url}${path === "/" ? "" : path}`;

/** hreflang map for a translated page: every enabled language plus x-default (English). */
export async function languageAlternates(path: string): Promise<Record<string, string>> {
  const enabled = (await getEnabledLocales()).map((l) => l.code).filter(isLocale);
  if (enabled.length < 2) return {};
  return { ...Object.fromEntries(enabled.map((l) => [l, absolute(localizePath(path, l))])), "x-default": absolute(path) };
}

/**
 * Metadata for a page whose copy is translated. The canonical is the URL's own language version
 * (/fr/contact is canonical for itself), each version lists the others as hreflang alternates,
 * and the title and description are translated.
 *
 * Pages that are NOT translated keep using `pageMetadata`: reached under a language prefix they
 * stay canonical to the English URL, so the index never holds near-duplicate copies.
 */
export async function localizedMetadata(input: { title: string; description: string; path: string; keywords?: string[] }): Promise<Metadata> {
  const urlLocale = (await getUrlLocale()).locale ?? DEFAULT_LOCALE;
  const shown = await getLocale();
  const tr = makeTranslator(await getDictionary(shown));
  const base = pageMetadata({ ...input, title: tr(input.title), description: tr(input.description), path: localizePath(input.path, urlLocale) });
  const languages = await languageAlternates(input.path);
  return {
    ...base,
    alternates: { canonical: absolute(localizePath(input.path, urlLocale)), ...(Object.keys(languages).length ? { languages } : {}) },
    openGraph: { ...base.openGraph, locale: OG_LOCALE[urlLocale] },
  };
}
