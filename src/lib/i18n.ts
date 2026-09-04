import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const LOCALE_COOKIE = "rcc_locale";

export const getEnabledLocales = cache(async () => db.locale.findMany({ where: { isEnabled: true }, orderBy: [{ isDefault: "desc" }, { code: "asc" }] }));

/** Visitor locale: cookie → marketplace default. Only enabled locales are honoured. */
export const getLocale = cache(async (): Promise<string> => {
  const settings = await getSettings();
  const fallback = settings["marketplace.defaultLocale"];
  const wanted = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (!wanted || wanted === fallback) return fallback;
  const list = await getEnabledLocales();
  return list.some((l) => l.code === wanted) ? wanted : fallback;
});

const loadStrings = cache(async (locale: string, namespace: string) => {
  const rows = await db.translation.findMany({ where: { locale, namespace }, select: { key: true, value: true } });
  return new Map(rows.map((r) => [r.key, r.value]));
});

/**
 * Translation lookup with the English source text as the fallback. Storefront
 * copy is authored in English in the components; admins add other locales in
 * /admin/settings/localization and the strings override at render time.
 */
export async function t(key: string, fallback: string, namespace = "common"): Promise<string> {
  const locale = await getLocale();
  if (locale === "en") return fallback;
  const strings = await loadStrings(locale, namespace);
  return strings.get(key) ?? fallback;
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
