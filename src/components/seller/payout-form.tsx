"use client";

import { useActionState, useState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { updatePayoutMethodAction } from "@/lib/seller/actions";

export function PayoutForm({ current, globalSchedule, disabled }: { current: { payoutMethod: string | null; payoutDetailsMasked: string | null; minPayout: number | null; payoutSchedule: string | null }; globalSchedule: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(updatePayoutMethodAction, undefined);
  const [method, setMethod] = useState(current.payoutMethod ?? "bank");
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={action} className="grid gap-4">
      {current.payoutDetailsMasked && <p className="text-sm text-ink-700">Current: <strong>{current.payoutDetailsMasked}</strong></p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Method" name="payoutMethod" value={method} onChange={(e) => setMethod(e.target.value)} disabled={disabled}>
          <option value="bank">Bank transfer</option>
          <option value="paypal">PayPal</option>
          <option value="manual">Arranged with finance</option>
        </SelectField>
        <SelectField label="Schedule" name="payoutSchedule" defaultValue={current.payoutSchedule ?? ""} disabled={disabled}>
          <option value="">Marketplace default ({globalSchedule})</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Every two weeks</option>
          <option value="monthly">Monthly</option>
          <option value="manual">Only when I request</option>
        </SelectField>
        <TextField label="Minimum payout (cents)" name="minPayout" type="number" min={0} defaultValue={current.minPayout ?? ""} disabled={disabled} hint="Leave blank for the marketplace minimum." />
      </div>
      {method === "bank" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Account holder name" name="accountName" required disabled={disabled} />
          <TextField label="Bank name" name="bankName" disabled={disabled} />
          <TextField label="Account number / IBAN" name="accountNumber" required disabled={disabled} hint={err("accountNumber")} />
          <TextField label="Routing / SWIFT / sort code" name="routingNumber" disabled={disabled} />
        </div>
      )}
      {method === "paypal" && <TextField label="PayPal email" name="paypalEmail" type="email" required disabled={disabled} hint={err("paypalEmail")} />}
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending || disabled} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Save payout method"}
        </button>
      </div>
    </form>
  );
}
