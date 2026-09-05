"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { updateProfileAction } from "@/lib/account/actions";

type Profile = { name: string; email: string; phone: string | null; countryCode: string | null; timezone: string; marketingOptIn: boolean; currency: string; locale: string };

export function ProfileForm({
  profile,
  countries,
  timezones,
  currencies,
  locales,
}: {
  profile: Profile;
  countries: { code: string; name: string }[];
  timezones: string[];
  currencies: { code: string; name: string; symbol: string }[];
  locales: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(updateProfileAction, undefined);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Full name" name="name" required defaultValue={profile.name} autoComplete="name" hint={err("name")} />
        <TextField label="Email" name="emailDisplay" value={profile.email} readOnly disabled hint="Contact support to change the email on your account." />
        <TextField label="Phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" />
        <SelectField label="Country" name="countryCode" defaultValue={profile.countryCode ?? "US"} hint="Pre-fills checkout and decides which sellers can ship to you.">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Display currency" name="currency" defaultValue={profile.currency} hint={err("currency") ?? "Prices are shown in this currency; you are charged in it where the payment method supports it."}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name} ({c.symbol})
            </option>
          ))}
        </SelectField>
        <SelectField label="Language" name="locale" defaultValue={profile.locale} hint={err("locale") ?? "Storefront language, where a translation exists."}>
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Timezone" name="timezone" defaultValue={profile.timezone} className="sm:col-span-2" hint={err("timezone") ?? "Used for dates in your account and emails."}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </SelectField>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-700">
        <input type="checkbox" name="marketingOptIn" defaultChecked={profile.marketingOptIn} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
        Email me about new arrivals, sales and events (never more than twice a month).
      </label>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
