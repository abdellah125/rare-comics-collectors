"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { FormError } from "@/components/auth-forms";
import { SelectField, TextField } from "@/components/form-fields";
import { EmptyState } from "@/components/account/ui";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { deleteAddressAction, saveAddressAction } from "@/lib/account/actions";
import type { CountryOption } from "@/lib/commerce/countries";

export type AddressRow = {
  id: string;
  label: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
};

export function AddressBook({ addresses, countries, regionOptions }: { addresses: AddressRow[]; countries: CountryOption[]; regionOptions: Record<string, string[]> }) {
  const [editing, setEditing] = useState<AddressRow | "new" | null>(addresses.length === 0 ? "new" : null);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-6">
      {addresses.length === 0 && editing !== "new" && <EmptyState title="No saved addresses" body="Add one to speed up checkout." />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses.map((a) => (
          <li key={a.id} className="rounded-xl border border-ink-200 bg-white p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-ink-950">{a.label ?? `${a.firstName} ${a.lastName}`}</p>
              <div className="flex gap-1">
                {a.isDefaultShipping && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-800">Shipping</span>}
                {a.isDefaultBilling && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-700">Billing</span>}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-ink-700">
              {[a.firstName + " " + a.lastName, a.company, a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(", "), a.countryCode, a.phone].filter(Boolean).join("\n")}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => setEditing(a)}>
                Edit
              </button>
              <button
                type="button"
                disabled={pending}
                className={`${buttonStyles.quiet} ${buttonSizes.sm} text-rose-700`}
                onClick={() => {
                  if (!window.confirm("Remove this address?")) return;
                  start(async () => {
                    await deleteAddressAction(a.id);
                    router.refresh();
                  });
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <AddressForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} countries={countries} regionOptions={regionOptions} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
      ) : (
        <div>
          <button type="button" className={`${buttonStyles.primary} ${buttonSizes.md}`} onClick={() => setEditing("new")}>
            Add address
          </button>
        </div>
      )}
    </div>
  );
}

function AddressForm({ initial, countries, regionOptions, onDone, onCancel }: { initial: AddressRow | null; countries: CountryOption[]; regionOptions: Record<string, string[]>; onDone: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(saveAddressAction, undefined);
  const [country, setCountry] = useState(initial?.countryCode ?? countries[0]?.code ?? "US");
  const regions = regionOptions[country] ?? [];
  const c = countries.find((x) => x.code === country);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-ink-200 bg-ink-50 p-5">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <h2 className="font-display text-lg font-semibold text-ink-950">{initial ? "Edit address" : "New address"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Label (optional)" name="label" defaultValue={initial?.label ?? ""} placeholder="Home, Office…" className="sm:col-span-2" />
        <SelectField label="Country" name="countryCode" value={country} onChange={(e) => setCountry(e.target.value)} className="sm:col-span-2">
          {countries.map((x) => (
            <option key={x.code} value={x.code}>
              {x.name}
            </option>
          ))}
        </SelectField>
        <TextField label="First name" name="firstName" required defaultValue={initial?.firstName ?? ""} hint={err("firstName")} />
        <TextField label="Last name" name="lastName" required defaultValue={initial?.lastName ?? ""} hint={err("lastName")} />
        <TextField label="Company (optional)" name="company" defaultValue={initial?.company ?? ""} className="sm:col-span-2" />
        <TextField label="Address" name="line1" required defaultValue={initial?.line1 ?? ""} className="sm:col-span-2" hint={err("line1")} />
        <TextField label="Apartment, suite, etc." name="line2" defaultValue={initial?.line2 ?? ""} className="sm:col-span-2" />
        <TextField label="City" name="city" required defaultValue={initial?.city ?? ""} hint={err("city")} />
        <div className="grid grid-cols-2 gap-4">
          {regions.length > 0 ? (
            <SelectField label="State / province" name="region" required={c?.regionRequired} defaultValue={initial?.region ?? ""} hint={err("region")}>
              <option value="">—</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField label="State / region" name="region" required={c?.regionRequired} defaultValue={initial?.region ?? ""} hint={err("region")} />
          )}
          <TextField label="Postal code" name="postalCode" required={c?.postalCodeRequired !== false} defaultValue={initial?.postalCode ?? ""} hint={err("postalCode")} />
        </div>
        <TextField label="Phone (optional)" name="phone" type="tel" defaultValue={initial?.phone ?? ""} className="sm:col-span-2" />
      </div>
      <div className="flex flex-wrap gap-5 text-sm text-ink-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefaultShipping" defaultChecked={initial?.isDefaultShipping ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Default shipping
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefaultBilling" defaultChecked={initial?.isDefaultBilling ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Default billing
        </label>
      </div>
      <FormError state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Save address"}
        </button>
        <button type="button" onClick={onCancel} className={`${buttonStyles.quiet} ${buttonSizes.md}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
