"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { applySellerAction } from "@/lib/seller/actions";

export function SellerApplyForm({ countries, defaultCountry, requireVerification }: { countries: { code: string; name: string }[]; defaultCountry: string; requireVerification: boolean }) {
  const [state, action, pending] = useActionState(applySellerAction, undefined);
  const [type, setType] = useState<"individual" | "company">("individual");
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Store name" name="displayName" required minLength={3} hint={err("displayName") ?? "Shown on your listings and storefront."} />
        <SelectField label="Selling as" name="businessType" value={type} onChange={(e) => setType(e.target.value as "individual" | "company")}>
          <option value="individual">Individual</option>
          <option value="company">Business</option>
        </SelectField>
        {type === "company" && <TextField label="Legal business name" name="businessName" required className="sm:col-span-2" />}
        <SelectField label="Country" name="countryCode" defaultValue={defaultCountry} required hint={err("countryCode")}>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label={type === "company" ? "Tax / VAT id" : "Tax id (optional)"} name="taxId" required={type === "company"} hint="Encrypted at rest; used for payout reporting only." />
      </div>
      <TextAreaField label="About your store" name="bio" rows={3} placeholder="What you collect, how long you've been dealing, how you grade and pack." />
      <TextAreaField label="Anything else for the review team? (optional)" name="applicationNote" rows={2} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextAreaField label="Shipping policy (optional)" name="shippingPolicy" rows={3} placeholder="Handling time, packaging, carriers." />
        <TextAreaField label="Return policy (optional)" name="returnPolicy" rows={3} placeholder="Marketplace minimum is a 14-day inspection window." />
      </div>
      <fieldset className="grid gap-3 rounded-lg border border-ink-200 p-4">
        <legend className="px-1 text-sm font-semibold text-ink-900">Identity verification {requireVerification ? "(required before your first payout)" : "(optional)"}</legend>
        <p className="text-[13px] text-ink-600">Upload a government ID (front and back) and, for businesses, a registration document. JPEG, PNG, WebP or PDF up to 8 MB each.</p>
        <div className="grid gap-3 sm:grid-cols-3 text-[13px] text-ink-700">
          <label>
            ID front
            <input type="file" name="doc_id_front" accept="image/*,application/pdf" className="mt-1 block w-full text-[12px]" />
          </label>
          <label>
            ID back
            <input type="file" name="doc_id_back" accept="image/*,application/pdf" className="mt-1 block w-full text-[12px]" />
          </label>
          <label>
            Business registration
            <input type="file" name="doc_business_registration" accept="image/*,application/pdf" className="mt-1 block w-full text-[12px]" />
          </label>
        </div>
      </fieldset>
      <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-600">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
        <span>
          I agree to the{" "}
          <Link href="/policies/terms-of-service" className="underline underline-offset-2">
            seller terms
          </Link>
          , will only list books I own, and will describe condition honestly.
        </span>
      </label>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending || state?.ok} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          {pending ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </form>
  );
}
