"use client";

import { useActionState } from "react";
import { Field, adminButton, adminTextarea } from "@/components/admin/ui";
import { submitIndexNowAction, type IndexNowSubmission } from "@/lib/admin/actions/indexnow";
import type { ActionState } from "@/lib/validation";

/** Paste URLs, submit, and see exactly what IndexNow answered — the feedback the bare GET URL never gives. */
export function IndexNowForm({ example }: { example: string }) {
  const [state, formAction, pending] = useActionState<ActionState<IndexNowSubmission> | undefined, FormData>(submitIndexNowAction, undefined);
  const errors = state && !state.ok ? (state.errors ?? {}) : {};
  const data = state?.ok ? state.data : undefined;
  return (
    <form action={formAction} className="grid gap-4" aria-busy={pending}>
      <div className="rounded-xl border border-ink-200 bg-white p-5">
        <Field label="URLs or paths to submit (one per line, up to 100)" hint={errors.urls}>
          <textarea name="urls" rows={6} required className={`${adminTextarea} font-mono text-[13px] ${errors.urls ? "border-rose-400" : ""}`} placeholder={example} />
        </Field>
      </div>
      {state && !state.ok && state.message && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.message}
          {errors.urls && <span className="block text-[12px] text-rose-600">{errors.urls}</span>}
        </p>
      )}
      {state?.ok && data && (
        <div role="status" className={`rounded-lg px-4 py-3 text-[13px] ${data.skipped ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          <p className="font-semibold">{state.message}</p>
          <p className="mt-1">{data.meaning}</p>
          {!data.skipped && (
            <dl className="mt-2 grid gap-1 text-[12px]">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-emerald-800/70">keyLocation</dt><dd className="break-all font-mono">{data.keyLocation}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-emerald-800/70">Submitted</dt><dd className="font-mono">{data.urls.join("\n").split("\n").map((u) => <span key={u} className="block break-all">{u}</span>)}</dd></div>
            </dl>
          )}
        </div>
      )}
      <div>
        <button type="submit" disabled={pending} className={adminButton.primary}>
          {pending ? "Submitting…" : "Submit to IndexNow"}
        </button>
      </div>
    </form>
  );
}
