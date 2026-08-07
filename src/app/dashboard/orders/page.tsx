"use client";

import { useAuth } from "@/components/auth-provider";
import { catalogBySeller } from "@/lib/catalog";

export default function OrdersPage() {
  const { user } = useAuth();
  const catalogListings = user ? catalogBySeller(user.id) : [];

  // Each feedback entry represents a completed sale
  const orders = catalogListings
    .flatMap((p) =>
      p.feedback.map((f) => ({
        id: f.id,
        buyer: f.from,
        item: `${p.title} ${p.issue}`,
        grade: `${p.grader} ${p.grade}`,
        price: p.price,
        date: f.date,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">Orders</h1>
      <p className="mt-1 text-sm text-ink-500">{orders.length} completed sales</p>

      {orders.length === 0 ? (
        <div className="mt-12 text-center text-ink-500">No orders yet.</div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-ink-50">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-500">{o.date}</td>
                  <td className="px-4 py-3 font-medium text-ink-900">
                    {o.item} <span className="font-normal text-ink-500">({o.grade})</span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{o.buyer}</td>
                  <td className="px-4 py-3 font-semibold text-ink-900">${(o.price / 100).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Completed
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
