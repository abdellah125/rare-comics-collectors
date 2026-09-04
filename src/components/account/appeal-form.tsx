"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextAreaField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { submitAppealAction, submitPublicAppealAction } from "@/lib/account/appeal-actions";

export function AppealForm({ violations }: { violations: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(submitAppealAction, undefined);
  if (state?.ok) return <FormSuccess state={state} />;
  return (
    <form action={action} className="grid gap-3">
      {violations.length > 0 && (
        <label className="grid gap-1 text-[13px] text-ink-700">
          Which decision are you appealing?
          <select name="violationId" className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900" defaultValue={violations[0].id}>
            {violations.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
            <option value="">My account status in general</option>
          </select>
        </label>
      )}
      <TextAreaField label="Why should we review it?" name="message" rows={4} required minLength={20} placeholder="Explain what happened and any context we should know." />
      <FormError state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`}>
          {pending ? "Sending…" : "Submit appeal"}
        </button>
      </div>
    </form>
  );
}

export function PublicAppealForm() {
  const [state, action, pending] = useActionState(submitPublicAppealAction, undefined);
  if (state?.ok) return <FormSuccess state={state} />;
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-[13px] text-ink-700">
        Account email
        <input name="email" type="email" required autoComplete="email" className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900" />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <TextAreaField label="Your appeal" name="message" rows={5} required minLength={20} placeholder="Explain what happened and why the decision should be reviewed." />
      <FormError state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Sending…" : "Submit appeal"}
        </button>
      </div>
    </form>
  );
}
