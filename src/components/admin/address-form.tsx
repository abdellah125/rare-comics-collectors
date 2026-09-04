"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field, adminInput, adminSelect } from "@/components/admin/ui";
import { updateOrderAddressAction } from "@/lib/admin/actions/orders";
import type { Address } from "@/lib/commerce/pricing";

export function OrderAddressForm({ orderId, which, address, countries }: { orderId: string; which: "shipping" | "billing"; address: Address | null; countries: { code: string; name: string }[] }) {
  return (
    <ActionForm action={updateOrderAddressAction} hidden={{ orderId, which }} submitLabel={`Save ${which} address`} variant="outline">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="First name">
          <input name="firstName" required defaultValue={address?.firstName ?? ""} className={adminInput} />
        </Field>
        <Field label="Last name">
          <input name="lastName" required defaultValue={address?.lastName ?? ""} className={adminInput} />
        </Field>
        <Field label="Company" className="sm:col-span-2">
          <input name="company" defaultValue={address?.company ?? ""} className={adminInput} />
        </Field>
        <Field label="Address line 1" className="sm:col-span-2">
          <input name="line1" required defaultValue={address?.line1 ?? ""} className={adminInput} />
        </Field>
        <Field label="Address line 2" className="sm:col-span-2">
          <input name="line2" defaultValue={address?.line2 ?? ""} className={adminInput} />
        </Field>
        <Field label="City">
          <input name="city" required defaultValue={address?.city ?? ""} className={adminInput} />
        </Field>
        <Field label="Region / state">
          <input name="region" defaultValue={address?.region ?? ""} className={adminInput} />
        </Field>
        <Field label="Postal code">
          <input name="postalCode" defaultValue={address?.postalCode ?? ""} className={adminInput} />
        </Field>
        <Field label="Country">
          <select name="countryCode" defaultValue={address?.countryCode ?? "US"} className={adminSelect}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone" className="sm:col-span-2">
          <input name="phone" defaultValue={address?.phone ?? ""} className={adminInput} />
        </Field>
      </div>
    </ActionForm>
  );
}
