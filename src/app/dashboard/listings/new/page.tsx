"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { addListing } from "@/lib/auth-store";

const GRADERS = ["CGC", "CBCS", "Raw"];
const GRADES = ["1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0","5.5","6.0","6.5",
  "7.0","7.5","8.0","8.5","9.0","9.2","9.4","9.6","9.8","10.0"];
const LABELS = ["Universal Blue", "Signature Series", "Restored", "Qualified", "Not graded"];

const field =
  "rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-950 placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none transition";

function Section({ title, step, children }: { title: string; step?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        {step && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
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
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const onCoverChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) {
      alert("Please use JPEG, PNG, WebP or GIF.");
      return;
    }
    // Limit localStorage-friendly size: recompress to ≲800 KB
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        const maxW = 800;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setCoverDataUrl(dataUrl);
        setCoverPreview(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    // Delegate to the same handler
    const input = document.createElement("input");
    input.type = "file";
    input.files = dt.files;
    // @ts-expect-error - reuse handler
    onCoverChange({ target: input });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const price = Math.round(parseFloat(String(fd.get("price") ?? "0")) * 100);
    setLoading(true);
    addListing({
      sellerId: user.id,
      title: String(fd.get("title") ?? ""),
      issue: String(fd.get("issue") ?? "").replace(/^#/, ""),
      publisher: String(fd.get("publisher") ?? ""),
      year: parseInt(String(fd.get("year") ?? "0"), 10),
      grade: String(fd.get("grade") ?? ""),
      grader: String(fd.get("grader") ?? "Raw"),
      price,
      description: String(fd.get("description") ?? ""),
      coverImage: coverDataUrl ?? undefined,
      keyIssue: String(fd.get("keyIssue") ?? "") || undefined,
      writer: String(fd.get("writer") ?? "") || undefined,
      artist: String(fd.get("artist") ?? "") || undefined,
      certNumber: String(fd.get("certNumber") ?? "") || undefined,
      label: String(fd.get("label") ?? "") || undefined,
      notes: String(fd.get("notes") ?? "") || undefined,
    });
    router.push("/dashboard/listings");
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">Add a listing</h1>
      <p className="mt-1 text-sm text-ink-500">
        Required fields are marked; everything else is optional detail for collectors.
      </p>

      <form onSubmit={onSubmit} className="mt-8 grid max-w-2xl gap-6">
        {/* ── Photos ── */}
        <Section title="Cover photo" step="1">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-ink-300 bg-ink-50 hover:bg-ink-100"
            }`}
          >
            <label className="grid cursor-pointer gap-2 text-sm text-ink-600">
              <span className="text-4xl" aria-hidden>📷</span>
              <span className="font-medium text-ink-700">
                {coverPreview ? "Replace photo" : "Drop a cover photo here, or click to choose"}
              </span>
              <span className="text-xs text-ink-400">JPEG, PNG, WebP or GIF — auto-resized to ≤800 px wide</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onCoverChange} />
            </label>
          </div>
          {coverPreview && (
            <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-lg border border-ink-200 shadow-sm">
              <Image src={coverPreview} alt="Cover preview" fill className="object-cover" unoptimized />
              <button
                type="button"
                onClick={() => { setCoverPreview(null); setCoverDataUrl(null); }}
                className="absolute right-1.5 top-1.5 rounded-full bg-ink-950/70 p-1 text-xs text-white hover:bg-ink-950"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          )}
        </Section>

        {/* ── Core details (required) ── */}
        <Section title="Core details" step="2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Series / title *
              <input name="title" required className={field} placeholder="Amazing Spider-Man" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Issue # *
              <input name="issue" required className={field} placeholder="129" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Publisher *
              <input name="publisher" required className={field} placeholder="Marvel" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700">
              Year *
              <input name="year" type="number" required min={1920} max={2030} className={field} placeholder="1974" />
            </label>
          </div>
        </Section>

        {/* ── Grading ── */}
        <Section title="Grading" step="3">
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
              Label <span className="text-ink-400">(optional)</span>
              <select name="label" className={field}>
                <option value="">Select if known…</option>
                {LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-700 sm:col-span-2">
              CGC cert number <span className="text-ink-400">(optional)</span>
              <input name="certNumber" className={field} placeholder="e.g. 1234567890" />
            </label>
          </div>
        </Section>

        {/* ── Collector details (all optional) ── */}
        <Section title="Collector details (optional)" step="4">
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
        </Section>

        {/* ── Price & description ── */}
        <Section title="Price & description" step="5">
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Price (USD) *
            <input name="price" type="number" required min={1} step={0.01} className={field} placeholder="149.99" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Description <span className="text-ink-400">(optional)</span>
            <textarea name="description" rows={3} className={`${field} resize-none`} placeholder="Key issue. White pages. Tight staples." />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink-700">
            Additional notes <span className="text-ink-400">(optional)</span>
            <textarea name="notes" rows={2} className={`${field} resize-none`} placeholder="Ships in bag and board. Stored in climate-controlled vault." />
          </label>
        </Section>

        <div className="flex gap-3 pt-2">
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
