"use client";

import { useActionState, useState } from "react";
import { Field, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { refundOrderAction } from "@/lib/admin/actions/orders";
import { REFUND_REASONS, statusLabel } from "@/lib/domain";
import { formatMoney } from "@/lib/money";

type Item = { id: string; title: string; qty: number; refundedQty: number; unitNet: number };

/** Full or partial refund with optional per-item allocation and restock. */
export function RefundForm({ orderId, remaining, items }: { orderId: string; remaining: number; items: Item[] }) {
  const [state, action, pending] = useActionState(refundOrderAction, undefined);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const suggested = Object.entries(selected).reduce((n, [id, qty]) => {
    const it = items.find((i) => i.id === id);
    return n + (it ? it.unitNet * qty : 0);
  }, 0);
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <p className="text-[13px] text-ink-600">
        Up to <strong>{formatMoney(remaining)}</strong> can still be refunded on this payment.
      </p>
      <fieldset className="grid gap-1.5 rounded-lg border border-ink-200 p-3">
        <legend className="px-1 text-[12px] font-semibold text-ink-700">Items (optional — allocates the refund and reverses seller earnings)</legend>
        {items.map((i) => {
          const left = i.qty - i.refundedQty;
          return (
            <label key={i.id} className="flex items-center gap-2 text-[13px] text-ink-800">
              <input
                type="checkbox"
                name="items"
                value={i.id}
                disabled={left <= 0}
                checked={Boolean(selected[i.id])}
                onChange={(e) => {
                  const next = { ...selected };
                  if (e.target.checked) next[i.id] = 1;
                  else delete next[i.id];
                  setSelected(next);
                  const total = Object.entries(next).reduce((n, [id, q]) => n + (items.find((x) => x.id === id)?.unitNet ?? 0) * q, 0);
                  if (total > 0) setAmount((Math.min(total, remaining) / 100).toFixed(2));
                }}
                className="h-4 w-4 rounded border-ink-300 accent-brand-600"
              />
              <span className="flex-1">
                {i.title} <span className="text-ink-500">({left} of {i.qty} refundable · {formatMoney(i.unitNet)} each)</span>
              </span>
              {selected[i.id] && left > 1 && (
                <input
                  type="number"
                  name={`qty_${i.id}`}
                  min={1}
                  max={left}
                  value={selected[i.id]}
                  onChange={(e) => {
                    const q = Math.max(1, Math.min(left, Number(e.target.value) || 1));
                    const next = { ...selected, [i.id]: q };
                    setSelected(next);
                    const total = Object.entries(next).reduce((n, [id, qq]) => n + (items.find((x) => x.id === id)?.unitNet ?? 0) * qq, 0);
                    setAmount((Math.min(total, remaining) / 100).toFixed(2));
                  }}
                  className="h-8 w-16 rounded border border-ink-300 px-2 text-[13px]"
                  aria-label={`Quantity of ${i.title} to refund`}
                />
              )}
            </label>
          );
        })}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount (USD)" hint={suggested > 0 ? `Suggested ${formatMoney(Math.min(suggested, remaining))}` : undefined}>
          <input name="amount" type="number" step="0.01" min="0.01" max={(remaining / 100).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} required className={adminInput} />
        </Field>
        <Field label="Reason">
          <select name="reason" defaultValue="requested_by_customer" className={adminSelect}>
            {REFUND_REASONS.map((r) => (
              <option key={r} value={r}>
                {statusLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (internal)">
          <input name="note" className={adminInput} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-ink-800">
        <input type="checkbox" name="restock" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Return refunded quantities to stock
      </label>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.message}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending || remaining <= 0} className={adminButton.danger} onClick={(e) => { if (!window.confirm(`Refund ${formatMoney(Math.round(Number.parseFloat(amount || "0") * 100))}? This cannot be undone.`)) e.preventDefault(); }}>
          {pending ? "Refunding…" : "Issue refund"}
        </button>
      </div>
    </form>
  );
}
