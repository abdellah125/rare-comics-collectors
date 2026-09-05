"use client";

import { useActionState, useState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { ERAS, GRADERS, GRADES, LABELS } from "@/lib/domain";
import { createListingAction, updateListingAction } from "@/lib/seller/listing-actions";
import type { ActionState } from "@/lib/validation";

export type ListingFormValues = {
  id?: string;
  title: string;
  issue: string;
  publisher: string;
  year: number;
  era: string;
  grader: string;
  grade: string;
  label: string;
  certNumber: string | null;
  price: number;
  compareAt: number | null;
  stock: number;
  keyIssue: string | null;
  writer: string;
  artist: string;
  coverArtist: string;
  summary: string;
  description: string;
  highlights: string[];
  categoryId: string | null;
  weightGrams: number | null;
  restrictedCountries: string[];
  allowedCountries: string[];
  tags: string[];
  status: string;
  images: { id: string; url: string }[];
};

function Section({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden>
          {step}
        </span>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-950">{title}</h2>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function ListingForm({ initial, categories, maxImages, minPriceLabel }: { initial: ListingFormValues | null; categories: { id: string; name: string }[]; maxImages: number; minPriceLabel: string }) {
  const create = createListingAction as (prev: ActionState<unknown> | undefined, fd: FormData) => Promise<ActionState<unknown>>;
  const update = updateListingAction as (prev: ActionState<unknown> | undefined, fd: FormData) => Promise<ActionState<unknown>>;
  const [state, action, pending] = useActionState(initial ? update : create, undefined);
  const [grader, setGrader] = useState(initial?.grader ?? "CGC");
  const [previews, setPreviews] = useState<string[]>([]);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  const money = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2));

  return (
    <form action={action} className="grid max-w-3xl gap-6" aria-busy={pending}>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Section title="Photos" step="1">
        <p className="text-[13px] text-ink-600">Up to {maxImages} photos. The first one is the cover shown in the store. JPEG, PNG or WebP.</p>
        {initial && initial.images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {initial.images.map((img) => (
              <li key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-28 w-20 rounded-md object-cover ring-1 ring-ink-200" />
                <label className="mt-1 flex items-center gap-1 text-[11px] text-ink-600">
                  <input type="checkbox" name="removeImage" value={img.id} className="h-3 w-3 accent-brand-600" /> Remove
                </label>
              </li>
            ))}
          </ul>
        )}
        <input
          type="file"
          name="images"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="block text-sm"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).slice(0, maxImages);
            setPreviews(files.map((f) => URL.createObjectURL(f)));
          }}
        />
        {previews.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {previews.map((p) => (
              <li key={p}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-28 w-20 rounded-md object-cover ring-1 ring-ink-200" />
              </li>
            ))}
          </ul>
        )}
        {err("images") && <p className="text-sm text-rose-700">{err("images")}</p>}
      </Section>

      <Section title="Core details" step="2">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Series / title" name="title" required defaultValue={initial?.title ?? ""} placeholder="Amazing Spider-Man" hint={err("title")} />
          <TextField label="Issue #" name="issue" required defaultValue={initial?.issue?.replace(/^#/, "") ?? ""} placeholder="129" hint={err("issue")} />
          <TextField label="Publisher" name="publisher" required defaultValue={initial?.publisher ?? ""} placeholder="Marvel Comics" hint={err("publisher")} />
          <TextField label="Cover year" name="year" type="number" required min={1900} max={new Date().getFullYear() + 1} defaultValue={initial?.year ?? ""} hint={err("year")} />
          <SelectField label="Era" name="era" required defaultValue={initial?.era ?? "Bronze Age"}>
            {ERAS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </SelectField>
          <SelectField label="Category" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Section>

      <Section title="Grading" step="3">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Grader" name="grader" required value={grader} onChange={(e) => setGrader(e.target.value)}>
            {GRADERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </SelectField>
          <SelectField label="Grade" name="grade" required defaultValue={initial?.grade ?? "8.0"}>
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </SelectField>
          <SelectField label="Label" name="label" defaultValue={initial?.label ?? (grader === "Raw" ? "Ungraded" : "Universal Blue")}>
            {LABELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </SelectField>
          {grader !== "Raw" && <TextField label="Certification number" name="certNumber" defaultValue={initial?.certNumber ?? ""} inputMode="numeric" className="sm:col-span-2" hint="Buyers can verify it on the grader's website." />}
        </div>
      </Section>

      <Section title="Pricing & stock" step="4">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Price (USD)" name="price" type="number" required min={0.01} step={0.01} inputMode="decimal" defaultValue={money(initial?.price)} hint={err("price") ?? `Minimum ${minPriceLabel}`} />
          <TextField label="Compare-at price (optional)" name="compareAt" type="number" min={0} step={0.01} inputMode="decimal" defaultValue={money(initial?.compareAt)} hint="Shows a strike-through sale price." />
          <TextField label="Quantity" name="stock" type="number" required min={0} max={999} defaultValue={initial?.stock ?? 1} />
          <TextField label="Weight (grams, optional)" name="weightGrams" type="number" min={0} defaultValue={initial?.weightGrams ?? ""} />
          <TextField label="Don't ship to (country codes)" name="restrictedCountries" defaultValue={initial?.restrictedCountries.join(", ") ?? ""} placeholder="e.g. BR, IN" className="sm:col-span-2" hint="Comma-separated ISO codes. Leave empty to ship anywhere the marketplace does." />
          <TextField label="Only ship to (country codes, optional)" name="allowedCountries" defaultValue={initial?.allowedCountries.join(", ") ?? ""} placeholder="e.g. US, CA, GB" className="sm:col-span-2" hint="Leave empty to use your store-wide ship-to list from Store settings." />
        </div>
      </Section>

      <Section title="Collector details" step="5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Key issue / first appearance" name="keyIssue" defaultValue={initial?.keyIssue ?? ""} className="sm:col-span-2" />
          <TextField label="Writer" name="writer" defaultValue={initial?.writer ?? ""} />
          <TextField label="Interior artist" name="artist" defaultValue={initial?.artist ?? ""} />
          <TextField label="Cover artist" name="coverArtist" defaultValue={initial?.coverArtist ?? ""} />
          <TextField label="Tags" name="tags" defaultValue={initial?.tags.join(", ") ?? ""} placeholder="key issue, first appearance" hint="Comma-separated; used in store search." />
        </div>
      </Section>

      <Section title="Description" step="6">
        <TextAreaField label="Short summary" name="summary" required rows={2} maxLength={400} defaultValue={initial?.summary ?? ""} hint={err("summary") ?? "One or two sentences shown at the top of the listing."} />
        <TextAreaField label="Full description" name="description" required rows={6} defaultValue={initial?.description ?? ""} hint={err("description") ?? "Condition notes, page quality, provenance. Blank lines start new paragraphs."} />
        <TextAreaField label="Highlights (one per line)" name="highlights" rows={4} defaultValue={initial?.highlights.join("\n") ?? ""} />
      </Section>

      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="publish" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          {pending ? "Saving…" : initial?.status === "published" ? "Save changes" : "Publish listing"}
        </button>
        <button type="submit" name="intent" value="draft" disabled={pending} className={`${buttonStyles.outline} ${buttonSizes.lg}`}>
          {initial ? "Save without publishing" : "Save as draft"}
        </button>
      </div>
    </form>
  );
}
