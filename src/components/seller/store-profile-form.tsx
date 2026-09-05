"use client";

import { useActionState, useState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { updateSellerProfileAction } from "@/lib/seller/actions";

type Profile = { displayName: string; bio: string | null; shippingPolicy: string | null; returnPolicy: string | null; handlingDays: number; shipsFromCountry: string; shipsTo: string[]; customsNote: string | null };
type Country = { code: string; name: string };

export function StoreProfileForm({ profile, countries, buyerCountries }: { profile: Profile; countries: Country[]; buyerCountries: Country[] }) {
  const [state, action, pending] = useActionState(updateSellerProfileAction, undefined);
  const [worldwide, setWorldwide] = useState(profile.shipsTo.length === 0);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Store name" name="displayName" required minLength={3} defaultValue={profile.displayName} hint={err("displayName")} />
        <TextField label="Handling time (business days)" name="handlingDays" type="number" min={1} max={14} required defaultValue={profile.handlingDays} hint="How fast you ship after payment." />
        <SelectField label="Ships from" name="shipsFromCountry" defaultValue={profile.shipsFromCountry}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <label className="text-sm font-medium text-ink-800">
          Store logo (optional)
          <input type="file" name="logo" accept="image/*" className="mt-1.5 block text-[13px] font-normal" />
        </label>
      </div>

      <fieldset className="rounded-xl border border-ink-200 p-4">
        <legend className="px-1 text-sm font-semibold text-ink-900">International shipping</legend>
        <label className="flex items-start gap-2.5 text-sm text-ink-700">
          <input type="checkbox" checked={worldwide} onChange={(e) => setWorldwide(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
          <span>
            Ship everywhere the marketplace delivers
            <span className="block text-[12px] text-ink-500">Untick to choose the countries you serve. Buyers elsewhere see “the seller doesn’t ship to your country” at checkout.</span>
          </span>
        </label>
        {!worldwide && (
          <label className="mt-3 block text-sm font-medium text-ink-800">
            Countries you ship to
            <select name="shipsTo" multiple defaultValue={profile.shipsTo} size={8} className="mt-1.5 block w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none">
              {buyerCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] font-normal text-ink-500">Hold Ctrl (⌘ on Mac) to select several. {err("shipsTo")}</span>
          </label>
        )}
        <TextAreaField label="Customs & duties note (optional)" name="customsNote" rows={2} defaultValue={profile.customsNote ?? ""} className="mt-3" hint="Shown to buyers in other countries on their order page, e.g. “Ships with a CN22 declaration; duties are collected by the carrier on delivery.”" />
      </fieldset>

      <TextAreaField label="About your store" name="bio" rows={3} defaultValue={profile.bio ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField label="Shipping policy" name="shippingPolicy" rows={3} defaultValue={profile.shippingPolicy ?? ""} />
        <TextAreaField label="Return policy" name="returnPolicy" rows={3} defaultValue={profile.returnPolicy ?? ""} />
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
