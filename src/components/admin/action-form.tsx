"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, type ReactNode } from "react";
import { adminButton } from "@/components/admin/ui";
import type { ActionState } from "@/lib/validation";

/**
 * Generic admin form bound to a server action: shows field/global errors,
 * success messages, a pending state and refreshes the route on success.
 */
export function ActionForm<S extends ActionState<unknown>>({ action, children, submitLabel = "Save", variant = "primary", className = "", resetOnSuccess = false, hidden = {}, onSuccess }: { action: (prev: S | undefined, formData: FormData) => Promise<S>; children: ReactNode | ((errors: Record<string, string>) => ReactNode); submitLabel?: string; variant?: "primary" | "dark" | "outline" | "danger"; className?: string; resetOnSuccess?: boolean; hidden?: Record<string, string>; onSuccess?: (state: S) => void }) {
  const [state, formAction, pending] = useActionState<S | undefined, FormData>(action, undefined);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const errors = state && !state.ok ? (state.errors ?? {}) : {};
  return (
    <form
      action={formAction}
      className={`grid gap-4 ${className}`}
      aria-busy={pending}
      onSubmit={(e) => {
        if (resetOnSuccess) {
          const form = e.currentTarget;
          window.setTimeout(() => {
            if (form.isConnected) form.reset();
          }, 800);
        }
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {typeof children === "function" ? children(errors) : children}
      {state && !state.ok && state.message && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.message}
          {Object.keys(errors).length > 0 && <span className="block text-[12px] text-rose-600">{Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {state.message}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={adminButton[variant]}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
