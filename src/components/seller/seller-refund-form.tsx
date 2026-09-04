"use client";

import { useActionState, useState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { sellerRefundAction } from "@/lib/seller/order-actions";

export function SellerRefundForm({ orderId, items, returnRequestId }: { orderId: string; items: { id: string; title: string; remaining: number; perUnit: number }[]; returnRequestId?: string }) {
  const [state, action, pending] = useActionState(sellerRefundAction, undefined);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const item = items.find((i) => i.id === itemId);
  if (items.length === 0) return <p className="text-sm text-ink-600">Nothing left to refund on this order.</p>;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      {returnRequestId && <input type="hidden" name="returnRequestId" value={returnRequestId} />}
      <div className="grid gap-4 sm:grid-cols-4">
        <SelectField label="Item" name="orderItemId" value={itemId} onChange={(e) => { setItemId(e.target.value); setQty(1); }} className="sm:col-span-2">
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </SelectField>
        <TextField label="Quantity" name="qty" type="number" min={1} max={item?.remaining ?? 1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
        <SelectField label="Reason" name="reason" defaultValue={returnRequestId ? "return" : "requested_by_customer"}>
          <option value="requested_by_customer">Requested by customer</option>
          <option value="return">Returned item</option>
          <option value="goodwill">Goodwill</option>
        </SelectField>
        <TextField label="Note (optional)" name="note" className="sm:col-span-3" />
        <label className="flex items-center gap-2 self-end text-sm text-ink-700">
          <input type="checkbox" name="restock" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Return to stock
        </label>
      </div>
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending || !item} className={`${buttonStyles.outline} ${buttonSizes.md}`}>
          {pending ? "Refunding…" : `Refund ${item ? formatMoney(item.perUnit * qty) : ""}`}
        </button>
      </div>
    </form>
  );
}
