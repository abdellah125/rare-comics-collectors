"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { CheckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { TICKET_CATEGORIES, statusLabel } from "@/lib/domain";
import { createTicketAction } from "@/lib/support/actions";

/** New support ticket — signed-in users skip the name/email fields. */
export function TicketForm({ signedIn, defaultOrder, defaultCategory, compact = false }: { signedIn: boolean; defaultOrder?: string; defaultCategory?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(createTicketAction, undefined);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);
  if (state?.ok) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-8 text-center" role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 font-display text-xl font-semibold text-ink-950">Ticket {state.data?.number} opened</h3>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-700">{state.message}</p>
        {signedIn && state.data && (
          <Link href={`/account/support/${state.data.number}`} className={`${buttonStyles.outline} ${buttonSizes.md} mt-6`}>
            View ticket
          </Link>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      {!signedIn && (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Name" name="name" required autoComplete="name" hint={err("name")} />
          <TextField label="Email" name="email" type="email" required autoComplete="email" hint={err("email")} />
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="What's this about?" name="category" required defaultValue={defaultCategory ?? "other"}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {statusLabel(c)}
            </option>
          ))}
        </SelectField>
        <TextField label="Order number (optional)" name="orderNumber" defaultValue={defaultOrder ?? ""} placeholder="RCC-2026-000000" />
      </div>
      <TextField label="Subject" name="subject" required maxLength={160} hint={err("subject")} />
      <TextAreaField label="Message" name="body" required rows={compact ? 4 : 6} hint={err("body")} />
      <label className="text-[13px] text-ink-600">
        Attachments (photos or PDFs, up to 5)
        <input type="file" name="attachments" multiple accept="image/*,application/pdf" className="mt-1 block text-[13px]" />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <FormError state={state} />
      <div>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
