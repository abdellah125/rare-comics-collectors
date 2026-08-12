"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { catalogBySeller, type CatalogProduct } from "@/lib/catalog";
import { getMyListings, deleteListing, type UserListing } from "@/lib/auth-store";

function Price({ cents }: { cents: number }) {
  return <span className="font-semibold tabular-nums text-ink-950">${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

function UserListingCard({ l, onDelete }: { l: UserListing; onDelete: (id: string) => void }) {
  return (
    <li className="flex items-center gap-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:shadow-lift">
      {/* cover preview */}
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border border-ink-100 bg-ink-100">
        {l.coverImage ? (
          <Image src={l.coverImage} alt={`${l.title} ${l.issue} cover`} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-400" aria-hidden>
            no photo
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="truncate font-medium text-ink-950">
            {l.title} <span className="text-ink-500">#{l.issue}</span>
          </p>
          <Price cents={l.price} />
        </div>
        <p className="mt-0.5 text-sm text-ink-500">
          {l.publisher} · {l.year} · {l.grader} {l.grade}
          {l.keyIssue && <span className="text-brand-700"> · {l.keyIssue}</span>}
        </p>
        {l.description && <p className="mt-1 line-clamp-2 text-xs text-ink-400">{l.description}</p>}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-400">
          {l.certNumber && (<><dt className="font-semibold text-ink-500">Cert</dt><dd>#{l.certNumber}</dd></>)}
          {l.writer && (<><dt className="font-semibold text-ink-500">Writer</dt><dd>{l.writer}</dd></>)}
          {l.artist && (<><dt className="font-semibold text-ink-500">Artist</dt><dd>{l.artist}</dd></>)}
          {l.label && (<><dt className="font-semibold text-ink-500">Label</dt><dd>{l.label}</dd></>)}
        </dl>
        {l.notes && <p className="mt-1.5 text-[11px] italic text-ink-400">{l.notes}</p>}
      </div>

      <button type="button" onClick={() => onDelete(l.id)} className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
        Delete
      </button>
    </li>
  );
}

export default function ListingsPage() {
  const { user } = useAuth();
  const catalogListings = user ? catalogBySeller(user.id) : [];
  const [myListings, setMyListings] = useState<UserListing[]>(user ? getMyListings(user.id) : []);

  const handleDelete = (id: string) => {
    deleteListing(id);
    setMyListings((prev) => prev.filter((l) => l.id !== id));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-950">My listings</h1>
          <p className="mt-1 text-sm text-ink-500">Your books, with photos and market details.</p>
        </div>
        <Link href="/dashboard/listings/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          + Add listing
        </Link>
      </div>

      {myListings.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-500">
              Your listings <span className="text-ink-400">({myListings.length})</span>
            </h2>
            <p className="text-xs text-ink-400">Newest first</p>
          </div>
          <ul className="grid gap-3">
            {myListings.map((l) => <UserListingCard key={l.id} l={l} onDelete={handleDelete} />)}
          </ul>
        </section>
      )}

      {catalogListings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-ink-500">
            Catalog listings <span className="text-ink-400">({catalogListings.length} in the store)</span>
          </h2>
          <ul className="grid gap-3">
            {catalogListings.slice(0, 20).map((p: CatalogProduct) => (
              <li key={p.slug} className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 bg-ink-50 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-950">{p.title} <span className="text-ink-500">#{p.issue}</span></p>
                  <p className="text-sm text-ink-500">{p.publisher} · {p.year} · {p.grader} {p.grade} · <Price cents={p.price} /></p>
                </div>
                <Link href={`/store/${p.slug}`} className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">View</Link>
              </li>
            ))}
          </ul>
          {catalogListings.length > 20 && (
            <p className="mt-3 text-xs text-ink-400">+ {catalogListings.length - 20} more live in the store.</p>
          )}
        </section>
      )}

      {catalogListings.length === 0 && myListings.length === 0 && (
        <div className="mt-16 rounded-2xl border border-dashed border-ink-300 bg-ink-50 py-14 text-center">
          <p className="text-ink-500">No listings yet.</p>
          <p className="mt-1 text-sm text-ink-400">Add your first book with a cover photo to go live instantly.</p>
          <Link href="/dashboard/listings/new" className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Add your first listing
          </Link>
        </div>
      )}
    </div>
  );
}
