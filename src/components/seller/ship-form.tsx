"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { shipItemsAction } from "@/lib/seller/order-actions";
import type { ActionState } from "@/lib/validation";

export function ShipForm({ orderId, items, carriers, action = shipItemsAction }: { orderId: string; items: { id: string; title: string; qty: number }[]; carriers: { id: string; name: string }[]; action?: (prev: ActionState | undefined, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium text-ink-800">Items in this shipment</legend>
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-sm text-ink-800">
            <input type="checkbox" name="itemIds" value={i.id} defaultChecked className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
            {i.title} × {i.qty}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Carrier" name="carrierId" defaultValue={carriers[0]?.id ?? ""}>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="">Other (enter name)</option>
        </SelectField>
        <TextField label="Carrier name (if other)" name="carrierName" />
        <TextField label="Tracking number" name="trackingNumber" hint={err("trackingNumber")} />
        <TextField label="Tracking link (optional override)" name="trackingUrl" type="url" placeholder="https://…" className="sm:col-span-2" hint={err("trackingUrl")} />
        <TextField label="Note to buyer (optional)" name="note" />
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Saving…" : "Mark as shipped"}
        </button>
      </div>
    </form>
  );
}
