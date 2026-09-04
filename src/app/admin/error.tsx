"use client";

import { useEffect } from "react";
import { adminButton } from "@/components/admin/ui";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-rose-700">Something went wrong</p>
      <h1 className="mt-3 text-2xl font-semibold text-ink-950">This page could not be loaded</h1>
      <p className="mt-3 text-sm text-ink-600">The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}. Try again, or go back to the dashboard.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className={adminButton.primary}>
          Try again
        </button>
        <a href="/admin" className={adminButton.outline}>
          Dashboard
        </a>
      </div>
    </div>
  );
}
