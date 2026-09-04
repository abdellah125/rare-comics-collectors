"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { updateSellerProfileAction } from "@/lib/seller/actions";

export function StoreProfileForm({ profile, countries }: { profile: { displayName: string; bio: string | null; shippingPolicy: string | null; returnPolicy: string | null; handlingDays: number; shipsFromCountry: string }; countries: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(updateSellerProfileAction, undefined);
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
