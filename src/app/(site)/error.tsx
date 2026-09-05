"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";

/** Storefront error boundary: keeps the header/footer, hides the stack, offers a retry. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[site]", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8" role="alert">
      <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-brand-700">Something went wrong</p>
      <h1 className="mt-5 font-display text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.08] text-ink-950">This page hit a snag</h1>
      <p className="mt-5 text-[17px] leading-relaxed text-ink-600">
        The problem has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Nothing was charged and your cart is safe. Try again, or head back to the store.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          Try again
        </button>
        <Link href="/store" className={`${buttonStyles.outline} ${buttonSizes.lg}`}>
          Browse the store
        </Link>
      </div>
    </div>
  );
}
