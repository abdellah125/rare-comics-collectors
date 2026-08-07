"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCart } from "@/components/cart-provider";
import { SelectField, TextField } from "@/components/form-fields";
import { CheckIcon, ShieldIcon, TruckIcon, CartIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { formatPriceExact } from "@/lib/format";
import { site } from "@/lib/site";

const FREE_SHIPPING_THRESHOLD = 25_000;
const FLAT_SHIPPING = 1_495;
const EXPRESS_SHIPPING = 3_995;

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

function makeOrderNumber() {
  const n = Math.floor(100_000 + Math.random() * 900_000);
  return `VC-2026-${n}`;
}

export function CheckoutView() {
  const { lines, subtotal, hydrated, clear } = useCart();
  const [shippingSpeed, setShippingSpeed] = useState<"standard" | "express">("standard");
  const [payment, setPayment] = useState<"card" | "paypal" | "wire">("card");
  const [placed, setPlaced] = useState<{ orderNumber: string; email: string; total: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (placed) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-6 font-display text-2xl font-semibold text-ink-950">Order placed</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          Thank you. A confirmation is on its way to{" "}
          <span className="font-semibold text-ink-950">{placed.email}</span>. Your books are pulled, photographed and
          double-boxed within one business day.
        </p>

        <dl className="mx-auto mt-7 grid max-w-sm gap-3 rounded-xl border border-brand-200 bg-white p-5 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Order number</dt>
            <dd className="font-mono font-semibold text-ink-950">{placed.orderNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Total charged</dt>
            <dd className="font-semibold tabular-nums text-ink-950">{formatPriceExact(placed.total)}</dd>
          </div>
        </dl>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/track-order" className={`${buttonStyles.primary} ${buttonSizes.md}`}>
            Track this order
          </Link>
          <Link href="/store" className={`${buttonStyles.outline} ${buttonSizes.md}`}>
            Keep shopping
          </Link>
        </div>

        <p className="mt-6 text-[13px] text-ink-600">
          Need help?{" "}
          <Link href="/support" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Contact support
          </Link>{" "}
          or call {site.phoneDisplay}. Save your order number — you&apos;ll need it to track without an account.
        </p>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="animate-pulse rounded-xl border border-ink-200 bg-ink-50 px-6 py-20 text-center" aria-busy>
        <p className="text-sm text-ink-500">Loading checkout…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
          <CartIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">There&apos;s nothing to check out</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
          Add a graded comic or book a service, then come back here.
        </p>
        <Link href="/store" className={`${buttonStyles.primary} ${buttonSizes.md} mt-6`}>
          Shop graded comics
        </Link>
      </div>
    );
  }

  const hasPhysical = lines.some((l) => l.kind === "comic");
  const baseShipping = !hasPhysical || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
  const shipping = !hasPhysical ? 0 : shippingSpeed === "express" ? EXPRESS_SHIPPING : baseShipping;
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + shipping + tax;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    // Demo checkout: no payment processor is wired up. Swap this for a Stripe /
    // PayPal server action before taking real money.
    window.setTimeout(() => {
      setPlaced({ orderNumber: makeOrderNumber(), email, total });
      clear();
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 700);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-7">
        <div className="rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-display text-xl font-semibold text-ink-950">Contact</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            Already have an account?{" "}
            <Link href="/account/login" className="font-medium text-brand-700 underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to check out faster and keep your order history.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            <TextField label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="(512) 555-0184" />
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-display text-xl font-semibold text-ink-950">Shipping address</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField label="First name" name="firstName" required autoComplete="given-name" />
            <TextField label="Last name" name="lastName" required autoComplete="family-name" />
            <TextField label="Address" name="address" required autoComplete="street-address" className="sm:col-span-2" />
            <TextField label="Apartment, suite, etc." name="address2" autoComplete="address-line2" className="sm:col-span-2" />
            <TextField label="City" name="city" required autoComplete="address-level2" />
            <div className="grid grid-cols-2 gap-4">
              <SelectField label="State" name="state" required autoComplete="address-level1" defaultValue="TX">
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectField>
              <TextField label="ZIP" name="zip" required autoComplete="postal-code" inputMode="numeric" />
            </div>
          </div>
        </div>

        {hasPhysical && (
          <fieldset className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
            <legend className="font-display text-xl font-semibold text-ink-950">Shipping method</legend>
            <div className="mt-5 grid gap-3">
              {[
                {
                  id: "standard" as const,
                  name: "Insured standard — 2–5 business days",
                  note: "Double-boxed, signature required, insured to full value.",
                  cost: baseShipping,
                },
                {
                  id: "express" as const,
                  name: "Insured express — 1–2 business days",
                  note: "Priority handling, same insurance and packaging.",
                  cost: EXPRESS_SHIPPING,
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    shippingSpeed === opt.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="shipping"
                    value={opt.id}
                    checked={shippingSpeed === opt.id}
                    onChange={() => setShippingSpeed(opt.id)}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink-950">{opt.name}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-600">{opt.note}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink-950">
                    {opt.cost === 0 ? "Free" : formatPriceExact(opt.cost)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <legend className="font-display text-xl font-semibold text-ink-950">Payment</legend>
          <div className="mt-5 grid gap-3">
            {[
              { id: "card" as const, name: "Credit or debit card", note: "Visa, Mastercard, Amex, Discover." },
              { id: "paypal" as const, name: "PayPal", note: "You'll be redirected to approve the payment." },
              { id: "wire" as const, name: "Bank wire / ACH", note: "Preferred on orders over $10,000. Invoice sent within one business day." },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                  payment === opt.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50"
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value={opt.id}
                  checked={payment === opt.id}
                  onChange={() => setPayment(opt.id)}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-ink-950">{opt.name}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-600">{opt.note}</span>
                </span>
              </label>
            ))}
          </div>

          {payment === "card" && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField
                label="Card number"
                name="cardNumber"
                required
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                className="sm:col-span-2"
              />
              <TextField label="Expiry (MM/YY)" name="cardExpiry" required autoComplete="cc-exp" placeholder="04/29" />
              <TextField label="Security code" name="cardCvc" required autoComplete="cc-csc" placeholder="123" />
            </div>
          )}

          <p className="mt-5 rounded-lg bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
            <strong className="text-ink-900">Demo store.</strong> No payment processor is connected — submitting this
            form places a sample order and does not charge anything. Connect Stripe, PayPal or your processor of choice
            before going live.
          </p>
        </fieldset>
      </div>

      {/* Summary */}
      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-6">
            <h2 className="font-display text-xl font-semibold text-ink-950">Order summary</h2>

            <ul className="mt-5 grid gap-4">
              {lines.map((line) => (
                <li key={line.id} className="flex items-start gap-3">
                  <span
                    className="h-16 w-11 shrink-0 rounded ring-1 ring-ink-950/10"
                    style={{
                      background: line.palette
                        ? `linear-gradient(150deg, ${line.palette[0]}, ${line.palette[1]})`
                        : "linear-gradient(150deg,#1c2130,#4e5a72)",
                    }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-ink-950">{line.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {line.meta} · Qty {line.qty}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink-950">
                    {formatPriceExact(line.price * line.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 grid gap-3 border-t border-ink-200 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium tabular-nums text-ink-950">{formatPriceExact(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Shipping &amp; insurance</dt>
                <dd className="font-medium tabular-nums text-ink-950">
                  {shipping === 0 ? "Free" : formatPriceExact(shipping)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-600">Estimated tax (TX 8.25%)</dt>
                <dd className="font-medium tabular-nums text-ink-950">{formatPriceExact(tax)}</dd>
              </div>
              <div className="mt-1 flex justify-between gap-4 border-t border-ink-200 pt-4">
                <dt className="font-display text-lg font-semibold text-ink-950">Total</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink-950">
                  {formatPriceExact(total)}
                </dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={submitting}
              className={`${buttonStyles.primary} ${buttonSizes.lg} mt-6 w-full`}
            >
              {submitting ? "Placing order…" : `Place order — ${formatPriceExact(total)}`}
            </button>

            <ul className="mt-5 grid gap-2.5 text-[13px] text-ink-600">
              <li className="flex items-start gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Authenticity guaranteed — undisclosed restoration refunded in full
              </li>
              <li className="flex items-start gap-2">
                <TruckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                14-day inspection window from delivery
              </li>
            </ul>

            <p className="mt-5 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500">
              By placing this order you agree to our{" "}
              <Link href="/policies/terms-of-service" className="underline underline-offset-2">
                Terms of Service
              </Link>
              ,{" "}
              <Link href="/policies/shipping" className="underline underline-offset-2">
                Shipping Policy
              </Link>{" "}
              and{" "}
              <Link href="/policies/returns-and-refunds" className="underline underline-offset-2">
                Returns &amp; Refunds Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </aside>
    </form>
  );
}
