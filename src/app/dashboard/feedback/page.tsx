"use client";

import { useAuth } from "@/components/auth-provider";
import { catalogBySeller } from "@/lib/catalog";

export default function FeedbackPage() {
  const { user } = useAuth();
  const catalogListings = user ? catalogBySeller(user.id) : [];

  const allFeedback = catalogListings
    .flatMap((p) => p.feedback.map((f) => ({ ...f, item: `${p.title} ${p.issue}` })))
    .sort((a, b) => b.date.localeCompare(a.date));

  const avgRating =
    allFeedback.length > 0
      ? (allFeedback.reduce((s, f) => s + f.rating, 0) / allFeedback.length).toFixed(2)
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-2xl font-semibold text-ink-950">Feedback</h1>
        {avgRating && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
            ⭐ {avgRating} avg · {allFeedback.length} reviews
          </span>
        )}
      </div>

      {allFeedback.length === 0 ? (
        <div className="mt-12 text-center text-ink-500">No feedback yet.</div>
      ) : (
        <div className="mt-6 grid gap-3">
          {allFeedback.map((f) => (
            <div key={f.id} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink-950">{f.from}</p>
                  <p className="mt-0.5 text-xs text-ink-500">on {f.item} · {f.date}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">{f.comment}</p>
                </div>
                <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                  {f.rating}/5 ★
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
