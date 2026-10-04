"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useT } from "@/components/i18n-provider";
import { GlobeIcon } from "@/components/icons";
import { setLocaleAction } from "@/lib/commerce/preferences";
import { localizePath, splitLocale } from "@/lib/i18n/config";

/**
 * Language switcher. Saves the choice, then moves to the same page in that language
 * (/fr/store ↔ /store); sections without a language URL simply re-render.
 */
export function LanguageSelect({ locales, tone = "dark", showLabel = true }: { locales: { code: string; name: string }[]; tone?: "dark" | "light"; showLabel?: boolean }) {
  const tr = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [pending, start] = useTransition();
  if (locales.length < 2) return null;
  const styles =
    tone === "dark"
      ? { label: "text-ink-400", select: "border-ink-700 bg-ink-900 text-white focus:border-brand-400" }
      : { label: "text-ink-600", select: "border-ink-300 bg-white text-ink-900 focus:border-brand-500" };
  return (
    <label className={`flex items-center gap-2 text-sm ${styles.label}`}>
      <GlobeIcon className="h-4 w-4 shrink-0" />
      {showLabel && <span>{tr("Language")}</span>}
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const code = e.target.value;
          start(async () => {
            await setLocaleAction(code);
            const query = window.location.search.slice(1);
            const target = localizePath(splitLocale(pathname).path, code);
            if (target !== pathname) router.push(query ? `${target}?${query}` : target);
            router.refresh();
          });
        }}
        className={`rounded-md border px-2 py-1 text-sm ${styles.select}`}
        aria-label={tr("Language")}
        data-testid="language-select"
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
