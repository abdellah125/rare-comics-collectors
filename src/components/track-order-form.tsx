"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/auth-forms";
import { TextField } from "@/components/form-fields";
import { CheckIcon, TruckIcon } from "@/components/icons";
import { Badge, buttonSizes, buttonStyles } from "@/components/ui";
import { trackOrderAction, type TrackedOrder } from "@/lib/commerce/actions";
import { statusLabel } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { site } from "@/lib/site";
import type { ActionState } from "@/lib/validation";

const STAGES: { key: string; name: string; detail: string; reached: (o: TrackedOrder) => boolean }[] = [
  { key: "placed", name: "Order received", detail: "Order placed and inventory reserved.", reached: () => true },
  { key: "paid", name: "Payment confirmed", detail: "Payment cleared; books are pulled and photographed.", reached: (o) => !["pending_payment", "failed", "cancelled"].includes(o.status) },
  { key: "shipped", name: "Shipped", detail: "Double-boxed, insured to full value, signature required.", reached: (o) => ["shipped", "partially_shipped", "delivered", "completed"].includes(o.status) || o.shipments.some((s) => s.shippedAt) },
  { key: "delivered", name: "Delivered", detail: "Your inspection window starts on delivery.", reached: (o) => ["delivered", "completed"].includes(o.status) },
];

export function TrackOrderForm({ initialRef = "" }: { initialRef?: string }) {
  const [state, action, pending] = useActionState<ActionState<TrackedOrder> | undefined, FormData>(trackOrderAction, undefined);
  const order = state?.ok ? state.data : undefined;
  const terminal = order ? ["cancelled", "failed", "refunded"].includes(order.status) : false;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="lg:col-span-5">
        <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
          <h2 className="font-display text-xl font-semibold text-ink-950">Look up your order</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-600">Enter the order number from your confirmation email along with the email address you used.</p>
          <form action={action} className="mt-6 grid gap-5">
            <TextField label="Order number" name="reference" required placeholder="RCC-2026-482910" defaultValue={initialRef} hint="Order numbers start with RCC-." />
            <TextField label="Email on the order" name="email" type="email" required autoComplete="email" />
            <FormError state={state} />
            <button type="submit" disabled={pending} className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}>
              {pending ? "Looking it up…" : "Track"}
            </button>
          </form>
          <p className="mt-6 border-t border-ink-200 pt-5 text-[13px] leading-relaxed text-ink-600">
            Have an account?{" "}
            <Link href="/account/orders" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to see every order without a reference number. Grading submissions are tracked by email — reply to your intake confirmation or{" "}
            <Link href="/support" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              contact support
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="lg:col-span-7">
        {order ? (
          <div className="rounded-xl border border-ink-200 bg-white p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Order</p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink-950">{order.number}</p>
                <p className="mt-1 text-[13px] text-ink-600">
                  Placed {new Date(order.placedAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · {formatMoney(order.presentmentTotal, order.currency)}
                </p>
              </div>
              <Badge tone={terminal ? "sale" : "brand"}>{order.statusLabel}</Badge>
            </div>

            {terminal ? (
              <p className="mt-6 text-sm text-ink-700">This order is {statusLabel(order.status).toLowerCase()}. If you have questions, contact support with the order number.</p>
            ) : (
              <ol className="mt-6 border-l border-ink-200">
                {STAGES.map((s, i) => {
                  const done = s.reached(order);
                  const current = done && (i === STAGES.length - 1 || !STAGES[i + 1].reached(order));
                  return (
                    <li key={s.key} className="relative pb-7 pl-7 last:pb-0">
                      <span aria-hidden className={`absolute -left-[11px] top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full ring-4 ring-white ${done ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-400"}`}>
                        {done && <CheckIcon className="h-3.5 w-3.5" />}
                      </span>
                      <p className={`font-display text-[17px] font-semibold ${current ? "text-brand-700" : done ? "text-ink-950" : "text-ink-500"}`}>
                        {s.name}
                        {current && <span className="ml-2 text-xs font-medium uppercase tracking-wide">Current</span>}
                      </p>
                      <p className={`mt-1 text-[14px] leading-relaxed ${done ? "text-ink-600" : "text-ink-500"}`}>{s.detail}</p>
                    </li>
                  );
                })}
              </ol>
            )}

            {order.shipments.length > 0 && (
              <div className="mt-6 border-t border-ink-200 pt-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Shipments</h3>
                <ul className="mt-3 grid gap-2 text-sm">
                  {order.shipments.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-4 py-3">
                      <span className="flex items-center gap-2 text-ink-800">
                        <TruckIcon className="h-4 w-4 text-brand-600" />
                        {s.carrierName ?? "Carrier"} · {statusLabel(s.status)}
                      </span>
                      {s.trackingNumber &&
                        (s.trackingUrl ? (
                          <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-brand-700 underline-offset-2 hover:underline">
                            {s.trackingNumber}
                          </a>
                        ) : (
                          <span className="font-mono text-ink-700">{s.trackingNumber}</span>
                        ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 border-t border-ink-200 pt-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">History</h3>
              <ul className="mt-3 grid gap-1.5 text-[13px] text-ink-700">
                {order.events.map((e, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span>{e.message}</span>
                    <span className="text-ink-500">{new Date(e.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </li>
                ))}
              </ul>
            </div>

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
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-600">Every stage of your order is timestamped, and every shipment is insured to full declared value with signature required on delivery.</p>
          </div>
        )}
      </div>
    </div>
  );
}
