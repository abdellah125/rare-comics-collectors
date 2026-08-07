"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { addListing } from "@/lib/auth-store";

const GRADERS = ["CGC", "CBCS", "Raw"];
const GRADES = ["1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0","5.5","6.0","6.5",
  "7.0","7.5","8.0","8.5","9.0","9.2","9.4","9.6","9.8","10.0"];

export default function NewListingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const price = Math.round(parseFloat(String(fd.get("price") ?? "0")) * 100);
    setLoading(true);
    addListing({
      sellerId: user.id,
      title: String(fd.get("title") ?? ""),
      issue: String(fd.get("issue") ?? ""),
      publisher: String(fd.get("publisher") ?? ""),
      year: parseInt(String(fd.get("year") ?? "0"), 10),
      grade: String(fd.get("grade") ?? ""),
      grader: String(fd.get("grader") ?? "Raw"),
      price,
      description: String(fd.get("description") ?? ""),
    });
    router.push("/dashboard/listings");
  };

  const field = "rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">Add a listing</h1>
      <p className="mt-1 text-sm text-ink-500">Fill in the details. Your book will appear in the store immediately.</p>

      <form onSubmit={onSubmit} className="mt-8 grid max-w-lg gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Series / title *
            <input name="title" required className={field} placeholder="Amazing Spider-Man" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Issue # *
            <input name="issue" required className={field} placeholder="129" />
          </label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Publisher *
            <input name="publisher" required className={field} placeholder="Marvel" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Year *
            <input name="year" type="number" required min={1930} max={2030} className={field} placeholder="1974" />
          </label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Grader *
            <select name="grader" required className={field}>
              {GRADERS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Grade *
            <select name="grade" required className={field}>
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-ink-700">
          Price (USD) *
          <input name="price" type="number" required min={1} step={0.01} className={field} placeholder="149.99" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink-700">
          Description (optional)
          <textarea name="description" rows={3} className={`${field} resize-none`} placeholder="Key issue. White pages. Tight staples." />
        </label>
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {loading ? "Adding…" : "Add listing"}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-ink-200 px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
