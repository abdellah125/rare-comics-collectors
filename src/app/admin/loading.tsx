export default function AdminLoading() {
  return (
    <div className="animate-pulse" role="status" aria-live="polite">
      <div className="h-7 w-48 rounded bg-ink-200" />
      <div className="mt-2 h-4 w-80 rounded bg-ink-100" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-ink-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 h-64 rounded-xl border border-ink-200 bg-white" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
