"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { catalogBySeller, type CatalogProduct } from "@/lib/catalog";
import { getMyListings, deleteListing, type UserListing } from "@/lib/auth-store";

export default function ListingsPage() {
  const { user } = useAuth();
  const catalogListings = user ? catalogBySeller(user.id) : [];
  const [myListings, setMyListings] = useState<UserListing[]>(
    user ? getMyListings(user.id) : []
  );

  const handleDelete = (id: string) => {
    deleteListing(id);
    setMyListings((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-950">My listings</h1>
        <Link href="/dashboard/listings/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + Add listing
        </Link>
      </div>

      {myListings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-ink-500">Your listings ({myListings.length})</h2>
          <div className="grid gap-3">
            {myListings.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-ink-200 bg-white p-4">
                <div>
                  <p className="font-medium text-ink-950">{l.title} #{l.issue}</p>
                  <p className="text-sm text-ink-500">{l.publisher} · {l.year} · {l.grader} {l.grade} · ${(l.price / 100).toFixed(2)}</p>
                  {l.description && <p className="mt-1 text-xs text-ink-400">{l.description}</p>}
                </div>
                <button type="button" onClick={() => handleDelete(l.id)} className="ml-4 shrink-0 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {catalogListings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-ink-500">Catalog listings ({catalogListings.length})</h2>
          <div className="grid gap-3">
            {catalogListings.slice(0, 20).map((p: CatalogProduct) => (
              <div key={p.slug} className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 p-4">
                <div>
                  <p className="font-medium text-ink-950">{p.title} {p.issue}</p>
                  <p className="text-sm text-ink-500">{p.publisher} · {p.year} · {p.grader} {p.grade} · ${(p.price / 100).toFixed(2)}</p>
                </div>
                <Link href={`/store/${p.slug}`} className="ml-4 shrink-0 rounded-lg px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">View</Link>
              </div>
            ))}
            {catalogListings.length > 20 && (
              <p className="text-sm text-ink-400">+ {catalogListings.length - 20} more listed in the store.</p>
            )}
          </div>
        </section>
      )}

      {catalogListings.length === 0 && myListings.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-ink-500">No listings yet.</p>
          <Link href="/dashboard/listings/new" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Add your first listing →</Link>
        </div>
      )}
    </div>
  );
}
