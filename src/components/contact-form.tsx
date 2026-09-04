"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth-forms";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { CheckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { createTicketAction } from "@/lib/support/actions";

/** Topic label → support category so contact messages land in the same queue as tickets. */
function categoryFor(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("order") || t.includes("buy")) return "order";
  if (t.includes("grading") || t.includes("submission") || t.includes("press")) return "listing";
  if (t.includes("apprais") || t.includes("sell") || t.includes("consign")) return "seller";
  if (t.includes("ship")) return "shipping";
  if (t.includes("return") || t.includes("refund")) return "returns";
  if (t.includes("account")) return "account";
  return "other";
}

export function ContactForm({ topics, defaultTopic, submitLabel = "Send message", className = "" }: { topics: string[]; defaultTopic?: string; submitLabel?: string; className?: string }) {
  const [state, action, pending] = useActionState(createTicketAction, undefined);
  const err = (k: string) => (state && !state.ok ? state.errors?.[k] : undefined);

  if (state?.ok) {
    return (
      <div className={`rounded-xl border border-brand-200 bg-brand-50 p-8 text-center ${className}`} role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 font-display text-xl font-semibold text-ink-950">Message received</h3>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-700">
          Your reference is <span className="font-mono font-semibold text-ink-950">{state.data?.number}</span>. We reply within one business day, usually sooner.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        const topic = String(fd.get("topic") ?? "");
        fd.set("category", categoryFor(topic));
        fd.set("subject", topic || "Website enquiry");
        const phone = String(fd.get("phone") ?? "").trim();
        if (phone) fd.set("body", `${String(fd.get("body") ?? "")}\n\nPhone: ${phone}`);
        return action(fd);
      }}
      className={`grid gap-5 ${className}`}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Name" name="name" required autoComplete="name" hint={err("name")} />
        <TextField label="Email" name="email" type="email" required autoComplete="email" hint={err("email")} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />
        <SelectField label="What's this about?" name="topic" required defaultValue={defaultTopic ?? topics[0]}>
          {topics.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Order or submission number (optional)" name="orderNumber" placeholder="RCC-2026-000000" />
      <TextAreaField label="Message" name="body" required rows={5} hint={err("body")} placeholder="Tell us about the books, the question, or what went wrong." />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <FormError state={state} />
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full sm:w-auto`}>
        {pending ? "Sending…" : submitLabel}
      </button>
      <p className="text-xs leading-relaxed text-ink-500">By sending this form you agree to our privacy policy. We only use your details to reply to this enquiry.</p>
    </form>
  );
}
