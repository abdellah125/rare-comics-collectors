/**
 * Locales, URL prefixes and country detection. Pure module: used by the proxy, the server and
 * client components.
 *
 * English lives at the plain URL (/store); other languages have a prefixed twin (/fr/store) that
 * the proxy rewrites to the same page with the locale in a request header. A visitor's language is
 * the URL prefix, else their saved choice, else their country.
 */
export const LOCALES = ["en", "es", "fr", "de"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";
export const TRANSLATED_LOCALES = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export const LOCALE_COOKIE = "rcc_locale";
/** Set by the proxy on a prefixed URL; never trusted from the outside (the proxy overwrites it). */
export const LOCALE_HEADER = "x-rcc-locale";
/** The path without its locale prefix, set by the proxy alongside LOCALE_HEADER. */
export const PATH_HEADER = "x-rcc-path";

export const LOCALE_NAMES: Record<AppLocale, string> = { en: "English", es: "Español", fr: "Français", de: "Deutsch" };
/** BCP 47 tags for Intl formatting and Open Graph. */
export const INTL_LOCALE: Record<AppLocale, string> = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE" };
export const OG_LOCALE: Record<AppLocale, string> = { en: "en_US", es: "es_ES", fr: "fr_FR", de: "de_DE" };

export const isLocale = (v: string | null | undefined): v is AppLocale => (LOCALES as readonly string[]).includes(v ?? "");

/** Sections that are never served under a language prefix (private, transactional or machine routes). */
const UNPREFIXED = ["/admin", "/api", "/account", "/dashboard", "/checkout", "/_next"];
export const canPrefix = (path: string): boolean => !UNPREFIXED.some((p) => path === p || path.startsWith(`${p}/`));

/** "/fr/store" → { locale: "fr", path: "/store" }; "/store" → { locale: null, path: "/store" }. */
export function splitLocale(pathname: string): { locale: AppLocale | null; path: string } {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  if (m && isLocale(m[1]) && m[1] !== DEFAULT_LOCALE) return { locale: m[1], path: m[2] || "/" };
  return { locale: null, path: pathname || "/" };
}

/** The URL of a page in a language: English is unprefixed. */
export function localizePath(path: string, locale: string): string {
  const clean = splitLocale(path).path;
  if (locale === DEFAULT_LOCALE || !isLocale(locale) || !canPrefix(clean)) return clean;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

/**
 * Languages spoken in a country, most likely first. Countries not listed get the default.
 * Where several are listed, the browser's own language preference picks between them.
 */
const COUNTRY_LOCALES: Record<string, AppLocale[]> = {
  // Spanish
  ES: ["es"], MX: ["es"], AR: ["es"], CO: ["es"], CL: ["es"], PE: ["es"], VE: ["es"], EC: ["es"], GT: ["es"], CU: ["es"], BO: ["es"], DO: ["es"],
  HN: ["es"], PY: ["es"], SV: ["es"], NI: ["es"], CR: ["es"], PA: ["es"], UY: ["es"], PR: ["es", "en"],
  // French
  FR: ["fr"], MC: ["fr"], BE: ["fr", "en"], LU: ["fr", "de"], SN: ["fr"], CI: ["fr"], MA: ["fr"], DZ: ["fr"], TN: ["fr"],
  // German
  DE: ["de"], AT: ["de"], LI: ["de"], CH: ["de", "fr"],
  // English first, a second language on request
  CA: ["en", "fr"], US: ["en", "es"],
};

/** Languages from an Accept-Language header, best first ("fr-CA,fr;q=0.9,en;q=0.8" → ["fr", "en"]). */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number.parseFloat(q) : 1 };
    })
    .filter((x) => /^[a-z]{2}$/.test(x.lang) && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.lang)
    .filter((l, i, all) => all.indexOf(l) === i);
}

/**
 * The language to show a first-time visitor: decided by their country, with the browser's
 * preference only choosing between that country's own languages. Unknown country → null.
 */
export function detectLocale(country: string | null | undefined, acceptLanguage: string | null | undefined, enabled: readonly string[]): AppLocale | null {
  const candidates = (COUNTRY_LOCALES[(country ?? "").toUpperCase()] ?? []).filter((l) => enabled.includes(l));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const first = acceptedLanguages(acceptLanguage).find((l) => (candidates as string[]).includes(l));
  return (first as AppLocale | undefined) ?? candidates[0];
}

/** Country → the currency its shoppers think in. Anything not listed is priced in the base currency (USD). */
const EUROZONE = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK", "MC", "SM", "VA", "AD", "ME", "XK", "BG"];
const COUNTRY_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EUROZONE.map((c) => [c, "EUR"])),
  GB: "GBP", IM: "GBP", JE: "GBP", GG: "GBP",
  CA: "CAD",
  AU: "AUD",
  CH: "CHF", LI: "CHF",
  JP: "JPY",
  US: "USD",
};
export const DEFAULT_CURRENCY = "USD";
export function currencyForCountry(country: string | null | undefined): string {
  return COUNTRY_CURRENCY[(country ?? "").toUpperCase()] ?? DEFAULT_CURRENCY;
}

/** The visitor's country as the hosting edge reports it (Vercel, then Cloudflare). */
export function countryFromHeaders(h: { get(name: string): string | null }): string | null {
  const c = (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

/** Crawlers always get the default language and currency at a plain URL, whatever country they crawl from. */
export function isCrawler(userAgent: string | null | undefined): boolean {
  return /bot|crawl|spider|slurp|mediapartners|adsbot|storebot|google-inspectiontool|facebookexternalhit|lighthouse|pagespeed|preview/i.test(userAgent ?? "");
}
