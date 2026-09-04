"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { uploadSellerDocumentAction } from "@/lib/seller/actions";

export function SellerDocsForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(uploadSellerDocumentAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
      <SelectField label="Document type" name="type" defaultValue="id_front" disabled={disabled}>
        <option value="id_front">ID — front</option>
        <option value="id_back">ID — back</option>
        <option value="business_registration">Business registration</option>
        <option value="proof_of_address">Proof of address</option>
        <option value="other">Other</option>
      </SelectField>
      <label className="text-sm font-medium text-ink-800">
        File
        <input type="file" name="file" required accept="image/*,application/pdf" disabled={disabled} className="mt-1.5 block w-full text-[13px] font-normal" />
      </label>
      <button type="submit" disabled={pending || disabled} className={`${buttonStyles.outline} ${buttonSizes.md}`}>
        {pending ? "Uploading…" : "Upload"}
      </button>
      <div className="sm:col-span-3">
        <FormError state={state} />
        <FormSuccess state={state} />
      </div>
    </form>
  );
}
