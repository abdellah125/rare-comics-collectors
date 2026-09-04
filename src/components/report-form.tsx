"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { createReportAction } from "@/lib/moderation/actions";

const REASONS: Record<string, string[]> = {
  listing: ["Counterfeit or restored book sold as unrestored", "Misleading grade or description", "Prohibited item", "Wrong photos or stock images", "Pricing or scam concern", "Other"],
  seller: ["Not shipping orders", "Harassment or abuse", "Fake reviews", "Off-platform payment requests", "Other"],
  review: ["Spam or advertising", "Harassment or hate", "Not about the product", "Fake review", "Other"],
  user: ["Harassment or abuse", "Scam attempt", "Impersonation", "Other"],
};

export function ReportForm({ targetType, targetId, signedIn }: { targetType: string; targetId: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState(createReportAction, undefined);
  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      {!signedIn && <TextField label="Your email (optional)" name="email" type="email" hint="Only used if we need more details." />}
      <SelectField label="Reason" name="reason" required>
        {(REASONS[targetType] ?? REASONS.listing).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="Details (optional)" name="details" rows={4} placeholder="What did you notice? Links or order numbers help." />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <FormError state={state} />
      <FormSuccess state={state} />
      {!state?.ok && (
        <div>
          <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
            {pending ? "Sending…" : "Submit report"}
          </button>
        </div>
      )}
    </form>
  );
}
