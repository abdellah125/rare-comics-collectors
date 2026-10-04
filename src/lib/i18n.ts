import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, INTL_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, PATH_HEADER, countryFromHeaders, detectLocale, isCrawler, isLocale, type AppLocale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { makeTranslator, type Dict, type Translator } from "@/lib/i18n/translate";

export { LOCALE_COOKIE };

export const getEnabledLocales = cache(async () => db.locale.findMany({ where: { isEnabled: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }));

/** The language of the URL itself (/fr/…), or null on a plain URL. This is what canonical and hreflang follow. */
export const getUrlLocale = cache(async (): Promise<{ locale: AppLocale | null; path: string | null }> => {
  const h = await headers();
  const code = h.get(LOCALE_HEADER);
  if (!isLocale(code) || code === DEFAULT_LOCALE) return { locale: null, path: null };
  const enabled = await getEnabledLocales();
  return enabled.some((l) => l.code === code) ? { locale: code, path: h.get(PATH_HEADER) } : { locale: null, path: null };
});

/**
 * Visitor locale: URL prefix → saved choice (cookie, then account) → country → marketplace
 * default. Only enabled locales are honoured, and crawlers are never switched by country.
 */
export const getLocale = cache(async (): Promise<string> => {
  const settings = await getSettings();
  const fallback = settings["marketplace.defaultLocale"];
  const fromUrl = (await getUrlLocale()).locale;
  if (fromUrl) return fromUrl;
  const enabled = (await getEnabledLocales()).map((l) => l.code);
  const allowed = (code: string | null | undefined) => (code && (code === fallback || enabled.includes(code)) ? code : null);
  const saved = allowed((await cookies()).get(LOCALE_COOKIE)?.value) ?? allowed((await getCurrentUser())?.locale);
  if (saved) return saved;
  if (!settings["i18n.autoDetect"]) return fallback;
  const h = await headers();
  if (isCrawler(h.get("user-agent"))) return fallback;
  return detectLocale(countryFromHeaders(h), h.get("accept-language"), enabled) ?? fallback;
});

/** BCP 47 tag for Intl formatting in the visitor's language. */
export async function getIntlLocale(): Promise<string> {
  const locale = await getLocale();
  return isLocale(locale) ? INTL_LOCALE[locale] : "en-US";
}

const loadOverrides = cache(async (locale: string) => {
  const rows = await db.translation.findMany({ where: { locale, namespace: "common" }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Dict;
});

/**
 * The dictionary for a locale: the translations shipped with the site, with any string an admin
 * entered under Settings › Localization (key = the English text) taking precedence.
 */
export const getDictionary = cache(async (locale?: string): Promise<Dict | null> => {
  const code = locale ?? (await getLocale());
  if (code === DEFAULT_LOCALE) return null;
  const shipped = isLocale(code) ? MESSAGES[code] : undefined;
  const overrides = await loadOverrides(code).catch(() => ({}) as Dict);
  return { ...(shipped ?? {}), ...overrides };
});

/** `const tr = await getTranslator()` in a server component, then `tr("Add to cart")`. */
export async function getTranslator(): Promise<Translator> {
  return makeTranslator(await getDictionary());
}

/**
 * Translation lookup by key with an English fallback (the original helper; kept for strings an
 * admin manages by key).
 */
export async function t(key: string, fallback: string, namespace = "common"): Promise<string> {
  const locale = await getLocale();
  if (locale === "en") return fallback;
  const rows = namespace === "common" ? await loadOverrides(locale) : Object.fromEntries((await db.translation.findMany({ where: { locale, namespace }, select: { key: true, value: true } })).map((r) => [r.key, r.value]));
  return rows[key] ?? fallback;
}

/** Locale-aware date/time formatting honouring the marketplace timezone (or a user's). */
export function formatDateTime(date: Date | string | null | undefined, opts: { timeZone?: string; locale?: string; dateOnly?: boolean } = {}): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(opts.locale ?? "en-US", {
      timeZone: opts.timeZone ?? "America/Chicago",
      dateStyle: "medium",
      ...(opts.dateOnly ? {} : { timeStyle: "short" }),
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
