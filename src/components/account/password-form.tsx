"use client";

import { useActionState } from "react";
import { FormError, FormSuccess } from "@/components/auth-forms";
import { TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { changePasswordAction } from "@/lib/account/actions";

export function PasswordForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  return (
    <form action={action} className="grid max-w-md gap-4">
      <TextField label="Current password" name="current" type="password" required autoComplete="current-password" disabled={disabled} hint={err("current")} />
      <TextField label="New password" name="password" type="password" required autoComplete="new-password" minLength={10} disabled={disabled} hint={err("password") ?? "At least 10 characters with a letter and a number."} />
      <TextField label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" disabled={disabled} hint={err("confirm")} />
      <FormError state={state} />
      <FormSuccess state={state} />
      <div>
        <button type="submit" disabled={pending || disabled} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
