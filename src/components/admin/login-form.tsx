"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth-forms";
import { TextField } from "@/components/form-fields";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { loginAction } from "@/lib/auth/actions";

export function AdminLoginForm({ next, error }: { next?: string; error?: string | null }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const notice = error === "not_admin" ? "That account doesn't have admin access." : error === "suspended" ? "This account is suspended." : null;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="mode" value="admin" />
      {next && <input type="hidden" name="next" value={next} />}
      {notice && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {notice}
        </p>
      )}
      <TextField label="Work email" name="email" type="email" required autoComplete="username" autoFocus />
      <TextField label="Password" name="password" type="password" required autoComplete="current-password" />
      <FormError state={state} />
      <button type="submit" disabled={pending} className={`${buttonStyles.dark} ${buttonSizes.lg} w-full`}>
        {pending ? "Signing in…" : "Sign in to admin"}
      </button>
      <p className="text-center text-[12px] text-ink-500">
        Admin sessions expire after 12 hours and require two-factor authentication.{" "}
        <Link href="/account/reset" className="underline underline-offset-2">
          Forgot password?
        </Link>
      </p>
    </form>
  );
}
