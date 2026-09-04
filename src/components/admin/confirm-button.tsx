"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { adminButton } from "@/components/admin/ui";
import type { ActionState } from "@/lib/validation";

/**
 * Button that asks for confirmation in a native <dialog> before running a
 * server action, then refreshes the route. Optional reason field is passed
 * to the action.
 */
export function ConfirmButton({ label, title, message, action, variant = "outline", size, withReason, reasonLabel = "Reason", confirmLabel = "Confirm", onDone }: { label: string; title?: string; message: string; action: (reason?: string) => Promise<ActionState<unknown> | void>; variant?: keyof Omit<typeof adminButton, "sm">; size?: "sm"; withReason?: boolean; reasonLabel?: string; confirmLabel?: string; onDone?: (state: ActionState<unknown> | void) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), 4000);
    return () => window.clearTimeout(t);
  }, [result]);

  const run = () =>
    start(async () => {
      const res = await action(withReason ? reason : undefined);
      ref.current?.close();
      if (res && !res.ok) {
        setError(res.message ?? "Something went wrong");
        return;
      }
      setError(null);
      setResult((res && res.message) || "Done");
      setReason("");
      onDone?.(res);
      router.refresh();
    });

  return (
    <>
      <button type="button" className={`${adminButton[variant]} ${size === "sm" ? adminButton.sm : ""}`} onClick={() => ref.current?.showModal()} disabled={pending}>
        {pending ? "Working…" : label}
      </button>
      {result && (
        <span role="status" className="ml-2 text-[12px] text-emerald-700">
          {result}
        </span>
      )}
      {error && (
        <span role="alert" className="ml-2 text-[12px] text-rose-700">
          {error}
        </span>
      )}
      <dialog ref={ref} className="w-[min(92vw,420px)] rounded-xl border border-ink-200 p-0 shadow-2xl backdrop:bg-ink-950/50" onClose={() => setReason("")}>
        <form method="dialog" className="p-5" onSubmit={(e) => e.preventDefault()}>
          <h2 className="text-base font-semibold text-ink-950">{title ?? label}</h2>
          <p className="mt-2 text-sm text-ink-700">{message}</p>
          {withReason && (
            <label className="mt-4 block text-[13px]">
              <span className="mb-1 block font-medium text-ink-800">{reasonLabel}</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm" />
            </label>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={adminButton.quiet} onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button type="button" className={variant === "danger" ? adminButton.danger : adminButton.primary} onClick={run} disabled={pending || (withReason && reason.trim().length < 2)}>
              {pending ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
