"use client";

import { useActionState } from "react";
import { Field, adminButton } from "@/components/admin/ui";
import { importProductsAction } from "@/lib/admin/actions/products";

export function ImportForm() {
  const [state, action, pending] = useActionState(importProductsAction, undefined);
  return (
    <form action={action} className="grid gap-4" aria-busy={pending}>
      <Field label="CSV file">
        <input type="file" name="file" accept=".csv,text/csv" required className="block text-[13px]" />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink-800">
        <input type="checkbox" name="publish" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Publish immediately (otherwise imported as drafts)
      </label>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.message}
        </p>
      )}
      {state?.ok && (
        <div role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {state.message}
          {state.data && state.data.errors.length > 0 && (
            <ul className="mt-2 grid gap-0.5 text-[12px] text-rose-700">
              {state.data.errors.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <button type="submit" disabled={pending} className={adminButton.primary}>
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </form>
  );
}
