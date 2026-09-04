"use client";

import { useActionState, useState } from "react";
import { Field, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { ERAS, GRADERS, GRADES, LABELS, PRODUCT_STATUSES } from "@/lib/domain";
import { createProductAdminAction, updateProductAdminAction } from "@/lib/admin/actions/products";
import type { ListingFormValues } from "@/components/seller/listing-form";
import type { ActionState } from "@/lib/validation";

export type AdminProductValues = ListingFormValues & { sellerId: string | null; brandId: string | null; featured: boolean; bestseller: boolean; featuredUntil: string | null; allowedCountries: string[]; moderationNote: string | null };

export function AdminProductForm({ initial, sellers, brands, categories, maxImages }: { initial: AdminProductValues | null; sellers: { id: string; displayName: string }[]; brands: { id: string; name: string }[]; categories: { id: string; name: string }[]; maxImages: number }) {
  const action = (initial ? updateProductAdminAction : createProductAdminAction) as (prev: ActionState<unknown> | undefined, fd: FormData) => Promise<ActionState<unknown>>;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [grader, setGrader] = useState(initial?.grader ?? "CGC");
  const errors = state && !state.ok ? (state.errors ?? {}) : {};
  const err = (k: string) => errors[k];
  const money = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));
  const inputCls = (k: string) => `${adminInput} ${err(k) ? "border-rose-400" : ""}`;

  return (
    <form action={formAction} className="grid gap-5" aria-busy={pending}>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Book</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Title" hint={err("title")}>
                <input name="title" required defaultValue={initial?.title ?? ""} className={inputCls("title")} />
              </Field>
              <Field label="Issue #" hint={err("issue")}>
                <input name="issue" required defaultValue={initial?.issue?.replace(/^#/, "") ?? ""} className={inputCls("issue")} />
              </Field>
              <Field label="Publisher" hint={err("publisher")}>
                <input name="publisher" required defaultValue={initial?.publisher ?? ""} className={inputCls("publisher")} list="publisher-list" />
                <datalist id="publisher-list">
                  {brands.map((b) => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Brand (publisher record)">
                <select name="brandId" defaultValue={initial?.brandId ?? ""} className={adminSelect}>
                  <option value="">—</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Year" hint={err("year")}>
                <input name="year" type="number" required min={1900} max={new Date().getFullYear() + 1} defaultValue={initial?.year ?? ""} className={inputCls("year")} />
              </Field>
              <Field label="Era">
                <select name="era" defaultValue={initial?.era ?? "Silver Age"} className={adminSelect}>
                  {ERAS.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select name="categoryId" defaultValue={initial?.categoryId ?? ""} className={adminSelect}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Key issue">
                <input name="keyIssue" defaultValue={initial?.keyIssue ?? ""} className={adminInput} />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Grading</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <Field label="Grader">
                <select name="grader" value={grader} onChange={(e) => setGrader(e.target.value)} className={adminSelect}>
                  {GRADERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Grade">
                <select name="grade" defaultValue={initial?.grade ?? "8.0"} className={adminSelect}>
                  {GRADES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <Field label="Label">
                <select name="label" defaultValue={initial?.label ?? (grader === "Raw" ? "Ungraded" : "Universal Blue")} className={adminSelect}>
                  {LABELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cert number">
                <input name="certNumber" defaultValue={initial?.certNumber ?? ""} className={adminInput} disabled={grader === "Raw"} />
              </Field>
              <Field label="Writer">
                <input name="writer" defaultValue={initial?.writer ?? ""} className={adminInput} />
              </Field>
              <Field label="Interior artist">
                <input name="artist" defaultValue={initial?.artist ?? ""} className={adminInput} />
              </Field>
              <Field label="Cover artist">
                <input name="coverArtist" defaultValue={initial?.coverArtist ?? ""} className={adminInput} />
              </Field>
              <Field label="Tags">
                <input name="tags" defaultValue={initial?.tags.join(", ") ?? ""} className={adminInput} placeholder="comma-separated" />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Copy</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Summary" hint={err("summary")}>
                <textarea name="summary" rows={2} required defaultValue={initial?.summary ?? ""} className={adminTextarea} />
              </Field>
              <Field label="Description" hint={err("description") ?? "Blank lines separate paragraphs."}>
                <textarea name="description" rows={6} required defaultValue={initial?.description ?? ""} className={adminTextarea} />
              </Field>
              <Field label="Highlights (one per line)">
                <textarea name="highlights" rows={3} defaultValue={initial?.highlights.join("\n") ?? ""} className={adminTextarea} />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Images</h2>
            {initial && initial.images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-3">
                {initial.images.map((img) => (
                  <li key={img.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-24 w-16 rounded object-cover ring-1 ring-ink-200" />
                    <label className="mt-1 flex items-center gap-1 text-[11px] text-ink-600">
                      <input type="checkbox" name="removeImage" value={img.id} className="h-3 w-3 accent-brand-600" /> Remove
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={`Upload (max ${maxImages})`}>
                <input type="file" name="images" multiple accept="image/jpeg,image/png,image/webp" className="block text-[13px]" />
              </Field>
              <Field label="Or image URL / path" hint="e.g. /covers/my-scan.jpg">
                <input name="imageUrl" className={adminInput} placeholder="https://… or /covers/…" />
              </Field>
            </div>
          </section>
        </div>

        <div className="grid gap-5 self-start">
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Pricing & stock</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Price (USD)" hint={err("price")}>
                <input name="price" type="number" step="0.01" min="0.01" required defaultValue={money(initial?.price)} className={inputCls("price")} />
              </Field>
              <Field label="Compare-at (USD)">
                <input name="compareAt" type="number" step="0.01" min="0" defaultValue={money(initial?.compareAt)} className={adminInput} />
              </Field>
              <Field label="Stock" hint={initial ? "Changes are recorded as a correction." : undefined}>
                <input name="stock" type="number" min={0} max={999} required defaultValue={initial?.stock ?? 1} className={adminInput} />
              </Field>
              <Field label="Weight (g)">
                <input name="weightGrams" type="number" min={0} defaultValue={initial?.weightGrams ?? ""} className={adminInput} />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Visibility</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Status">
                <select name="status" defaultValue={initial?.status ?? "published"} className={adminSelect}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Seller" hint="Blank = house inventory">
                <select name="sellerId" defaultValue={initial?.sellerId ?? ""} className={adminSelect}>
                  <option value="">House inventory</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="featured" defaultChecked={initial?.featured ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Featured on the home page
              </label>
              <Field label="Featured until (optional)">
                <input name="featuredUntil" type="date" defaultValue={initial?.featuredUntil ?? ""} className={adminInput} />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="bestseller" defaultChecked={initial?.bestseller ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Bestseller badge
              </label>
              <Field label="Ship only to (country codes)">
                <input name="allowedCountries" defaultValue={initial?.allowedCountries.join(", ") ?? ""} className={adminInput} placeholder="blank = anywhere" />
              </Field>
              <Field label="Don't ship to">
                <input name="restrictedCountries" defaultValue={initial?.restrictedCountries.join(", ") ?? ""} className={adminInput} />
              </Field>
              <Field label="Moderation note (shown to seller)">
                <input name="moderationNote" defaultValue={initial?.moderationNote ?? ""} className={adminInput} />
              </Field>
            </div>
          </section>
          {state && !state.ok && state.message && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
              {state.message}
            </p>
          )}
          {state?.ok && state.message && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              {state.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="intent" value="publish" disabled={pending} className={adminButton.primary}>
              {pending ? "Saving…" : initial ? "Save listing" : "Create listing"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
