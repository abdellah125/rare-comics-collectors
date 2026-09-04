"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-forms";
import { TextAreaField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { replyToReviewAction } from "@/lib/seller/order-actions";

export function ReviewReplyForm({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(replyToReviewAction, undefined);
  if (state?.ok) return <p className="text-sm text-brand-800">Reply posted.</p>;
  if (!open)
    return (
      <button type="button" className={`${buttonStyles.outline} ${buttonSizes.sm}`} onClick={() => setOpen(true)}>
        Reply publicly
      </button>
    );
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <TextAreaField label="Public reply" name="reply" rows={3} required />
      <FormError state={state} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`}>
          {pending ? "Posting…" : "Post reply"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${buttonStyles.quiet} ${buttonSizes.sm}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
