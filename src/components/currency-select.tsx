"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setCurrencyAction } from "@/lib/commerce/preferences";

export function CurrencySelect({ currencies, current }: { currencies: { code: string; name: string; symbol: string }[]; current: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (currencies.length < 2) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-ink-400">
      <span>Currency</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const code = e.target.value;
          start(async () => {
            await setCurrencyAction(code);
            router.refresh();
          });
        }}
        className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-white focus:border-brand-400"
        aria-label="Display currency"
      >
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} ({c.symbol})
          </option>
        ))}
      </select>
    </label>
  );
}
