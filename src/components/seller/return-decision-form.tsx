"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { sellerReturnDecisionAction } from "@/lib/seller/order-actions";

export function ReturnDecisionForm({ returnId, mode }: { returnId: string; mode: "decide" | "received" }) {
  const [state, action, pending] = useActionState(sellerReturnDecisionAction, undefined);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="returnId" value={returnId} />
      <TextField label="Note to buyer (optional)" name="note" placeholder={mode === "decide" ? "Return address, packing instructions…" : "Condition on arrival"} />
      <FormError state={state} />
      <FormSuccess state={state} />
      <div className="flex flex-wrap gap-2">
        {mode === "decide" ? (
          <>
            <button type="submit" name="decision" value="approve" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`}>
              Approve return
            </button>
            <button type="submit" name="decision" value="reject" disabled={pending} className={`${buttonStyles.outline} ${buttonSizes.sm} text-rose-700`}>
              Decline
            </button>
          </>
        ) : (
          <button type="submit" name="decision" value="received" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.sm}`}>
            Mark as received
          </button>
        )}
      </div>
    </form>
  );
}
