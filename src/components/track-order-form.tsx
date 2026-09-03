"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { TextField } from "@/components/form-fields";
import { CheckIcon, TruckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { site } from "@/lib/site";

type Stage = { name: string; detail: string; done: boolean; current?: boolean };

const ORDER_STAGES: Stage[] = [
  { name: "Order received", detail: "Payment authorised and inventory reserved.", done: true },
  { name: "Pulled & photographed", detail: "Books pulled from the vault and photographed from six angles.", done: true },
  { name: "Packed", detail: "Bagged, boarded, double-boxed and insured to full value.", done: true, current: true },
  { name: "In transit", detail: "Signature required on delivery.", done: false },
  { name: "Delivered", detail: "Your 14-day inspection window starts on this date.", done: false },
];

const SUBMISSION_STAGES: Stage[] = [
  { name: "Received at vault", detail: "Signed for and scheduled on our insurance policy.", done: true },
  { name: "Pre-screened", detail: `Grade estimate and press candidacy assessed by a ${site.name} grader.`, done: true },
  { name: "Approved by you", detail: "Per-book recommendations accepted; tier and declared value locked.", done: true },
  { name: "Pressed", detail: "Humidity-controlled press cycle complete.", done: true, current: true },
  { name: "Submitted to grader", detail: "Shipped in a consolidated dealer submission.", done: false },
  { name: "Graded & returning", detail: "Encapsulated and on the way back to you, insured.", done: false },
];

export function TrackOrderForm() {
  const [result, setResult] = useState<null | { ref: string; kind: "order" | "submission" }>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const ref = String(data.get("reference") ?? "").trim().toUpperCase();
    setError(null);
    setLoading(true);

    // Demo lookup: RCC-… is an order, SUB-… is a grading submission.
    window.setTimeout(() => {
      setLoading(false);
      if (/^RCC-/.test(ref)) setResult({ ref, kind: "order" });
      else if (/^SUB-/.test(ref)) setResult({ ref, kind: "submission" });
      else {
        setResult(null);
        setError(
          "We couldn't find that reference. Order numbers start with RCC- and submission numbers start with SUB-. Check your confirmation email, or contact support and we'll look it up.",
        );
      }
    }, 600);
  };

  const stages = result?.kind === "submission" ? SUBMISSION_STAGES : ORDER_STAGES;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-5">
        <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
          <h2 className="font-display text-xl font-semibold text-ink-950">Look up your order</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-600">
            Enter the reference from your confirmation email along with the email address you used.
          </p>
          <form onSubmit={onSubmit} className="mt-6 grid gap-5">
            <TextField
              label="Order or submission number"
              name="reference"
              required
              placeholder="RCC-2026-482910"
              hint="Orders start with RCC-. Grading submissions start with SUB-."
            />
            <TextField label="Email on the order" name="email" type="email" required autoComplete="email" />
            <button type="submit" disabled={loading} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
              {loading ? "Looking it up…" : "Track"}
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-800 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <p className="mt-6 border-t border-ink-200 pt-5 text-[13px] leading-relaxed text-ink-600">
            Have an account?{" "}
            <Link href="/account/login" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to see every order and submission without a reference number.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            <strong className="text-ink-900">Demo lookup.</strong> Any reference starting with RCC- or SUB- returns
            sample tracking data. Connect your order database or 3PL feed before launch.
          </p>
        </div>
      </div>

      <div className="lg:col-span-7">
        {result ? (
          <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  {result.kind === "submission" ? "Grading submission" : "Order"}
                </p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink-950">{result.ref}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand-800 ring-1 ring-brand-200">
                <TruckIcon className="h-4 w-4" />
                {result.kind === "submission" ? "In progress" : "Ships within 24 hours"}
              </span>
            </div>

            <ol className="mt-6 border-l border-ink-200">
              {stages.map((s) => (
                <li key={s.name} className="relative pb-7 pl-7 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute -left-[11px] top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full ring-4 ring-white ${
                      s.done ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-400"
                    }`}
                  >
                    {s.done && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <p
                    className={`font-display text-[17px] font-semibold ${
                      s.current ? "text-brand-700" : s.done ? "text-ink-950" : "text-ink-500"
                    }`}
                  >
                    {s.name}
                    {s.current && <span className="ml-2 text-xs font-medium uppercase tracking-wide">Current</span>}
                  </p>
                  <p className={`mt-1 text-[14px] leading-relaxed ${s.done ? "text-ink-600" : "text-ink-500"}`}>
                    {s.detail}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-ink-200 pt-5">
              <Link href="/support" className={`${buttonStyles.outline} ${buttonSizes.md}`}>
                Something wrong? Contact support
              </Link>
              <a href={`tel:${site.phone}`} className={`${buttonStyles.quiet} ${buttonSizes.md}`}>
                Call {site.phoneDisplay}
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
              <TruckIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">Enter a reference to begin</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">
              Orders and grading submissions both track here. Try <span className="font-mono">RCC-2026-482910</span> or{" "}
              <span className="font-mono">SUB-2026-1174</span> to see how it works.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
