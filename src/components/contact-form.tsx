"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/form-fields";
import { CheckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { site } from "@/lib/site";

export function ContactForm({
  topics,
  defaultTopic,
  submitLabel = "Send message",
  className = "",
}: {
  topics: string[];
  defaultTopic?: string;
  submitLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState("sending");
    // Demo form: wire this to a server action, Formspree, Resend or your CRM.
    window.setTimeout(() => setState("sent"), 700);
  };

  if (state === "sent") {
    return (
      <div className={`rounded-xl border border-brand-200 bg-brand-50 p-8 text-center ${className}`} role="status">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-5 font-display text-xl font-semibold text-ink-950">Message sent</h3>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-ink-700">
          Thanks — we read every message. Expect a reply within one business day, usually sooner.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className={`${buttonStyles.outline} ${buttonSizes.md} mt-6`}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={`grid gap-5 ${className}`}>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Name" name="name" required autoComplete="name" />
        <TextField label="Email" name="email" type="email" required autoComplete="email" />
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
      <TextField
        label="Order number (if you have one)"
        name="orderNumber"
        placeholder="RCC-2026-000000"
        hint="Only needed for order or shipping questions."
      />
      <TextAreaField
        label="Message"
        name="message"
        required
        placeholder="Tell us what you have, what you need, or what went wrong. The more detail the better — cert numbers, issue numbers and photos all help."
      />

      <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-600">
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
        <span>
          I agree that {site.name} may store and use my details to respond to this enquiry, as described in the{" "}
          <Link href="/policies/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === "sending"} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          {state === "sending" ? "Sending…" : submitLabel}
        </button>
        <p className="text-[13px] text-ink-500">Typical reply time: under one business day.</p>
      </div>

      <p className="rounded-lg bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
        <strong className="text-ink-900">Demo form.</strong> No backend is connected — submissions are not sent
        anywhere. Point this at a server action, Resend, Formspree or your CRM before launch.
      </p>
    </form>
  );
}
