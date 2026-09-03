"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { getMyListings } from "@/lib/auth-store";

export default function DashboardPage() {
  const { user } = useAuth();
  const myListings = user ? getMyListings(user.id) : [];

  // Sales and buyer feedback need a real order backend; until then they are empty.
  const stats = [
    { label: "Active listings", value: myListings.length },
    { label: "Completed sales", value: 0 },
    { label: "Avg rating", value: "—" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">
        Welcome back, {user?.name}
      </h1>
      <p className="mt-1 text-sm text-ink-500">Member since {user?.joinedAt}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-200 bg-ink-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">{s.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink-950">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/listings" className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm">
          <p className="font-semibold text-ink-950 group-hover:text-brand-700">My listings →</p>
          <p className="mt-1 text-sm text-ink-500">{myListings.length} comics currently for sale.</p>
        </Link>
        <Link href="/dashboard/listings/new" className="group rounded-xl border border-brand-200 bg-brand-50 p-5 hover:border-brand-300 hover:shadow-sm">
          <p className="font-semibold text-brand-800 group-hover:text-brand-700">+ Add a listing →</p>
          <p className="mt-1 text-sm text-brand-700">List a graded or raw comic for sale.</p>
        </Link>
        <Link href="/dashboard/orders" className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm">
          <p className="font-semibold text-ink-950 group-hover:text-brand-700">Orders →</p>
          <p className="mt-1 text-sm text-ink-500">See who bought your books.</p>
        </Link>
        <Link href="/dashboard/feedback" className="group rounded-xl border border-ink-200 bg-white p-5 hover:border-brand-300 hover:shadow-sm">
          <p className="font-semibold text-ink-950 group-hover:text-brand-700">Feedback →</p>
          <p className="mt-1 text-sm text-ink-500">Reviews from your buyers.</p>
        </Link>
      </div>
    </div>
  );
}
