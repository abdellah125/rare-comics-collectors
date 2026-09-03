"use client";

import { useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { addListing } from "@/lib/auth-store";

const GRADERS = ["CGC", "CBCS", "Raw"];
const GRADES = ["1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0","5.5","6.0","6.5",
  "7.0","7.5","8.0","8.5","9.0","9.2","9.4","9.6","9.8","10.0"];
const LABELS = ["Universal Blue", "Signature Series", "Restored", "Qualified", "Not graded"];
const CURRENT_YEAR = new Date().getFullYear();
/** Covers are downscaled before being stored so a handful of listings stay within localStorage limits. */
const MAX_COVER_WIDTH = 800;

const field =
  "rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition";

function FormSection({ title, step, children }: { title: string; step?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        {step && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden>
            {step}
          </span>
        )}
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-950">{title}</h2>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export default function NewListingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /** Validate, downscale to ≤800px wide and keep the result as a JPEG data URL. */
  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setCoverError("Please use a JPEG, PNG, WebP or GIF image.");
      return;
    }
    setCoverError(null);
    const reader = new FileReader();
    reader.onerror = () => setCoverError("That file couldn't be read. Try a different image.");
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => setCoverError("That file couldn't be read as an image.");
      img.onload = () => {
        const scale = img.width > MAX_COVER_WIDTH ? MAX_COVER_WIDTH / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setCover(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onCoverChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    // Reset so choosing the same file again after "Remove photo" still fires onChange.
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const price = Math.round(Number.parseFloat(String(fd.get("price") ?? "")) * 100);
    if (!Number.isFinite(price) || price <= 0) return;
    setLoading(true);
    addListing({
      sellerId: user.id,
      title: String(fd.get("title") ?? "").trim(),
      issue: String(fd.get("issue") ?? "").trim().replace(/^#/, ""),
      publisher: String(fd.get("publisher") ?? "").trim(),
      year: Number.parseInt(String(fd.get("year") ?? "0"), 10),
      grade: String(fd.get("grade") ?? ""),
      grader: String(fd.get("grader") ?? "Raw"),
      price,
      description: String(fd.get("description") ?? "").trim(),
      coverImage: cover ?? undefined,
      keyIssue: String(fd.get("keyIssue") ?? "").trim() || undefined,
      writer: String(fd.get("writer") ?? "").trim() || undefined,
      artist: String(fd.get("artist") ?? "").trim() || undefined,
      certNumber: String(fd.get("certNumber") ?? "").trim() || undefined,
      label: String(fd.get("label") ?? "") || undefined,
      notes: String(fd.get("notes") ?? "").trim() || undefined,
    });
    router.push("/dashboard/listings");
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">Add a listing</h1>
      <p className="mt-1 text-sm text-ink-500">
        Required fields are marked; everything else is optional detail for collectors.
      </p>

      <form onSubmit={onSubmit} className="mt-8 grid max-w-2xl gap-6" aria-busy={loading}>
        {/* ── Photos ── */}
        <FormSection title="Cover photo" step="1">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-ink-300 bg-ink-50 hover:bg-ink-100"
            }`}
          >
            <label className="grid cursor-pointer gap-2 text-sm text-ink-600">
              <span className="text-4xl" aria-hidden>📷</span>
              <span className="font-medium text-ink-700">
                {cover ? "Replace photo" : "Drop a cover photo here, or click to choose"}
              </span>
              <span className="text-xs text-ink-500">JPEG, PNG, WebP or GIF — auto-resized to ≤800 px wide</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={onCoverChange}
                aria-describedby={coverError ? "cover-error" : undefined}
              />
            </label>
          </div>
          {coverError && (
            <p id="cover-error" role="alert" className="text-sm text-rose-700">
              {coverError}
            </p>
          )}
          {cover && (
            <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-lg border border-ink-200 shadow-sm">
              <Image src={cover} alt="Cover preview" fill className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => setCover(null)}
                className="absolute right-1.5 top-1.5 rounded-full bg-ink-950/70 p-1 text-xs text-white hover:bg-ink-950"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          )}
        </FormSection>

        {/* ── Core details (required) ── */}
        <FormSection title="Core details" step="2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Series / title *
              <input name="title" required className={field} placeholder="Amazing Spider-Man" autoComplete="off" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Issue # *
              <input name="issue" required className={field} placeholder="129" autoComplete="off" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Publisher *
              <input name="publisher" required className={field} placeholder="Marvel" autoComplete="off" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Year *
              <input name="year" type="number" required min={1920} max={CURRENT_YEAR + 1} className={field} placeholder="1974" />
            </label>
          </div>
        </FormSection>

        {/* ── Grading ── */}
        <FormSection title="Grading" step="3">
          <div className="grid gap-4 sm:grid-cols-3">
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
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Label <span className="text-ink-500">(optional)</span>
              <select name="label" className={field}>
                <option value="">Select if known…</option>
                {LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700 sm:col-span-2">
              Certification number <span className="text-ink-500">(optional)</span>
              <input name="certNumber" className={field} placeholder="e.g. 1234567890" inputMode="numeric" autoComplete="off" />
            </label>
          </div>
        </FormSection>

        {/* ── Collector details (all optional) ── */}
        <FormSection title="Collector details (optional)" step="4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-ink-700">
              Key issue / first appearance
              <input name="keyIssue" className={field} placeholder="First appearance of the Punisher" />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-700">
              Writer
              <input name="writer" className={field} placeholder="Gerry Conway" />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-700">
              Artist / cover artist
              <input name="artist" className={field} placeholder="Ross Andru" />
            </label>
          </div>
        </FormSection>

        {/* ── Price & description ── */}
        <FormSection title="Price & description" step="5">
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Price (USD) *
            <input name="price" type="number" required min={1} step={0.01} inputMode="decimal" className={field} placeholder="149.99" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Description <span className="text-ink-500">(optional)</span>
            <textarea name="description" rows={3} className={`${field} resize-none`} placeholder="Key issue. White pages. Tight staples." />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Additional notes <span className="text-ink-500">(optional)</span>
            <textarea name="notes" rows={2} className={`${field} resize-none`} placeholder="Ships in bag and board. Stored in climate-controlled vault." />
          </label>
        </FormSection>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {loading ? "Adding…" : "Add listing"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-ink-300 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
