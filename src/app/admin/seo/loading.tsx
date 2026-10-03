/** Shown while a tab's data loads or a pipeline step is being recorded. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-ink-100" />
      <div className="h-5 w-full max-w-2xl animate-pulse rounded bg-ink-100" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-40 animate-pulse rounded-xl bg-ink-100 lg:col-span-2" />
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-ink-100" />
      <span className="sr-only">Loading SEO data…</span>
    </div>
  );
}
