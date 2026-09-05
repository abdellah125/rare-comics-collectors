"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCart } from "@/components/cart-provider";
import { CartThumb } from "@/components/cart-thumb";
import { usePrice } from "@/components/currency-provider";
import { SelectField, TextField } from "@/components/form-fields";
import { CartIcon, CheckIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { BankDetails } from "@/components/bank-details";
import { StripePayment } from "@/components/stripe-payment";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { abandonPendingOrderAction, placeOrderAction, quoteAction } from "@/lib/commerce/actions";
import type { Quote } from "@/lib/commerce/checkout";
import type { Address } from "@/lib/commerce/pricing";
import type { CountryOption } from "@/lib/commerce/countries";
import { formatMoney } from "@/lib/money";

type SavedAddress = Address & { id: string; label: string | null };

export type CheckoutFormProps = {
  countries: CountryOption[];
  regionOptions: Record<string, string[]>;
  defaultCountry: string;
  user: { email: string; name: string; phone: string | null; addresses: SavedAddress[] } | null;
  guestCheckout: boolean;
  couponsEnabled: boolean;
  /** How long a card / redirect payment keeps the stock reserved (commerce.reservationMinutes). */
  reservationMinutes: number;
};

const emptyAddress = (countryCode: string): Address => ({ firstName: "", lastName: "", company: undefined, line1: "", line2: undefined, city: "", region: undefined, postalCode: undefined, countryCode, phone: undefined });

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm({ countries, regionOptions, defaultCountry, user, guestCheckout, couponsEnabled, reservationMinutes }: CheckoutFormProps) {
  const { lines, hydrated, clear } = useCart();
  const { formatExact, currency } = usePrice();
  const router = useRouter();

  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [shipping, setShipping] = useState<Address>(() => {
    const def = user?.addresses.find((a) => a.id) ?? null;
    return def ? { ...def } : { ...emptyAddress(defaultCountry), ...(user ? { firstName: user.name.split(" ")[0] ?? "", lastName: user.name.split(" ").slice(1).join(" ") } : {}) };
  });
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<Address>(() => emptyAddress(defaultCountry));
  const [shippingMethodId, setShippingMethodId] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("");
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | undefined>(undefined);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripe, setStripe] = useState<{ clientSecret: string; publishableKey: string; orderNumber: string; amountLabel: string } | null>(null);
  const idemKey = useRef(newKey());
  // Serial number of the latest quote request so a slow, older response can't overwrite a newer one.
  const quoteSeq = useRef(0);

  const cartLines = useMemo(() => lines.map((l) => ({ kind: l.kind, slug: l.slug, qty: l.qty })), [lines]);
  const country = countries.find((c) => c.code === shipping.countryCode);
  const regions = regionOptions[shipping.countryCode] ?? [];

  // Re-quote whenever anything that affects price changes (debounced).
  useEffect(() => {
    if (!hydrated || cartLines.length === 0) return;
    const t = window.setTimeout(async () => {
      const seq = ++quoteSeq.current;
      setQuoting(true);
      let res: Awaited<ReturnType<typeof quoteAction>>;
      try {
        res = await quoteAction({ lines: cartLines, countryCode: shipping.countryCode, region: shipping.region ?? undefined, shippingMethodId: shippingMethodId || undefined, couponCode });
      } catch {
        res = { error: "We couldn't reach the store to price your cart. Check your connection and try again." };
      }
      if (seq !== quoteSeq.current) return;
      setQuoting(false);
      if ("error" in res) {
        setQuoteError(res.error);
        return;
      }
      setQuoteError(null);
      setQuote(res);
      if (res.shipping && res.shipping.id !== shippingMethodId) setShippingMethodId(res.shipping.id);
      if (res.providers.length > 0 && !res.providers.some((p) => p.id === providerId)) setProviderId(res.providers[0].id);
    }, 250);
    return () => window.clearTimeout(t);
    // providerId is intentionally not a dependency: changing it doesn't change the price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cartLines, shipping.countryCode, shipping.region, shippingMethodId, couponCode]);

  const setShip = (patch: Partial<Address>) => setShipping((s) => ({ ...s, ...patch }));
  const setBill = (patch: Partial<Address>) => setBilling((s) => ({ ...s, ...patch }));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!quote || submitting) return;
    setSubmitting(true);
    setError(null);
    let result: Awaited<ReturnType<typeof placeOrderAction>>;
    try {
      result = await placeOrderAction({
        lines: cartLines,
        email,
        phone: phone || undefined,
        shippingAddress: shipping,
        billingSameAsShipping: billingSame,
        billingAddress: billingSame ? undefined : billing,
        shippingMethodId: shippingMethodId || undefined,
        providerId,
        couponCode,
        customerNote: note || undefined,
        idempotencyKey: idemKey.current,
      });
    } catch {
      // Network dropped or the server failed mid-request. Keep the same idempotency key so a
      // retry returns the order that may already exist instead of creating a second one.
      setError("We couldn't place your order. Check your connection and try again — you won't be charged twice.");
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!result.ok) {
      setError(result.message);
      idemKey.current = newKey();
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const p = result.payment;
    if (p.kind === "succeeded" || p.kind === "instructions") {
      clear();
      router.push(`/checkout/complete?order=${result.orderNumber}`);
      return;
    }
    if (p.kind === "redirect") {
      // The cart is kept until the provider confirms; the confirmation page empties it.
      window.location.assign(p.redirectUrl);
      return;
    }
    if (p.kind === "client_confirm") {
      setStripe({ clientSecret: p.clientSecret, publishableKey: p.publishableKey, orderNumber: result.orderNumber, amountLabel: quote ? formatMoney(quote.presentmentTotal, quote.currency.code) : "" });
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("Payment could not be started. Please try again.");
    setSubmitting(false);
  };

  if (!hydrated) {
    return (
      <div className="animate-pulse rounded-xl border border-ink-200 bg-ink-50 px-6 py-20 text-center" aria-busy>
        <p className="text-sm text-ink-500">Loading checkout…</p>
      </div>
    );
  }

  if (lines.length === 0 && !stripe) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
          <CartIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">There&apos;s nothing to check out</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">Add a graded comic or book a service, then come back here.</p>
        <Link href="/store" className={`${buttonStyles.primary} ${buttonSizes.md} mt-6`}>
          Shop graded comics
        </Link>
      </div>
    );
  }

  if (!user && !guestCheckout) {
    return (
      <div className="rounded-xl border border-ink-200 bg-ink-50 px-6 py-16 text-center">
        <h2 className="font-display text-xl font-semibold text-ink-950">Sign in to check out</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">Guest checkout is currently disabled.</p>
        <Link href="/account/login?next=/checkout" className={`${buttonStyles.primary} ${buttonSizes.md} mt-6`}>
          Sign in
        </Link>
      </div>
    );
  }

  if (stripe) {
    return (
      <div className="mx-auto max-w-xl">
        <p className="mb-4 text-sm text-ink-600">
          Order <span className="font-mono font-semibold text-ink-950">{stripe.orderNumber}</span> is reserved for {reservationMinutes} minutes while you pay.
        </p>
        <StripePayment
          clientSecret={stripe.clientSecret}
          publishableKey={stripe.publishableKey}
          returnUrl={`${window.location.origin}/checkout/return?order=${stripe.orderNumber}&provider=stripe`}
          amountLabel={stripe.amountLabel}
          onCancel={() => {
            // Release the reservation right away; the next attempt places a fresh order.
            void abandonPendingOrderAction(stripe.orderNumber).catch(() => {});
            setStripe(null);
            idemKey.current = newKey();
          }}
        />
      </div>
    );
  }

  const good = quote?.lines.filter((l) => !l.problem) ?? [];
  const canSubmit = Boolean(quote && !quoting && quote.warnings.length === 0 && good.length > 0 && providerId && (!quote.hasPhysical || quote.shipping));

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-12 lg:gap-12" aria-busy={submitting}>
      <div className="lg:col-span-7">
        {error && (
          <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {quote?.warnings.map((w) => (
          <p key={w} role="alert" className="mb-6 rounded-lg bg-gold-400/15 px-4 py-3 text-sm text-gold-800 ring-1 ring-gold-400/40">
            {w}
          </p>
        ))}

        <div className="rounded-xl border border-ink-200 bg-white p-6">
          <h2 className="font-display text-xl font-semibold text-ink-950">Contact</h2>
          {!user && (
            <p className="mt-1 text-[13px] text-ink-500">
              Already have an account?{" "}
              <Link href="/account/login?next=/checkout" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                Sign in
              </Link>{" "}
              to check out faster and keep your order history.
            </p>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField label="Email" name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={Boolean(user)} />
            <TextField label="Phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" />
          </div>
        </div>

        {user && user.addresses.length > 0 && (
          <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-ink-950">Saved addresses</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {user.addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setShipping({ ...a })}
                  className={`rounded-lg border px-3 py-2 text-left text-[13px] ${shipping.line1 === a.line1 && shipping.postalCode === a.postalCode ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50"}`}
                >
                  <span className="block font-semibold text-ink-950">{a.label ?? `${a.firstName} ${a.lastName}`}</span>
                  <span className="block text-ink-600">
                    {a.line1}, {a.city} {a.countryCode}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <AddressFields title="Shipping address" prefix="shipping" value={shipping} onChange={setShip} countries={countries} regions={regions} country={country} />

        <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <label className="flex items-center gap-2.5 text-sm text-ink-800">
            <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} className="h-4 w-4 rounded border-ink-300 accent-brand-600" />
            Billing address is the same as shipping
          </label>
        </div>
        {!billingSame && (
          <AddressFields title="Billing address" prefix="billing" value={billing} onChange={setBill} countries={countries} regions={regionOptions[billing.countryCode] ?? []} country={countries.find((c) => c.code === billing.countryCode)} />
        )}

        {quote?.hasPhysical && (
          <fieldset className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
            <legend className="font-display text-xl font-semibold text-ink-950">Shipping method</legend>
            {quote.shippingOptions.length === 0 ? (
              <p className="mt-4 text-sm text-rose-700">We can&apos;t ship to {country?.name ?? "that country"} yet.</p>
            ) : (
              <div className="mt-5 grid gap-3">
                {quote.shippingOptions.map((opt) => (
                  <label key={opt.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${shippingMethodId === opt.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50"}`}>
                    <input type="radio" name="shipping" value={opt.id} checked={shippingMethodId === opt.id} onChange={() => setShippingMethodId(opt.id)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-ink-950">
                        {opt.name} — {opt.estimatedDaysMin}–{opt.estimatedDaysMax} business days
                      </span>
                      <span className="mt-0.5 block text-[13px] text-ink-600">
                        {opt.description}
                        {opt.carrierName ? ` · ${opt.carrierName}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-ink-950">{opt.price === 0 ? "Free" : formatExact(opt.price)}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <legend className="font-display text-xl font-semibold text-ink-950">Payment</legend>
          {quote && quote.providers.length === 0 ? (
            <p className="mt-4 text-sm text-rose-700">No payment method is available for this order in {currency.code}. Try another currency or contact us.</p>
          ) : (
            <div className="mt-5 grid gap-3">
              {(quote?.providers ?? []).map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${providerId === p.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:bg-ink-50"}`}>
                  <input type="radio" name="payment" value={p.id} checked={providerId === p.id} onChange={() => setProviderId(p.id)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink-950">{p.displayName}</span>
                    <span className="mt-0.5 block text-[13px] text-ink-600">
                      {p.id === "stripe" && "Visa, Mastercard, Amex and more. You'll enter card details on the next step."}
                      {p.id === "paypal" && "You'll be redirected to PayPal to approve the payment."}
                      {p.id === "bank_transfer" && `Your books are reserved for ${quote?.bankTransfer?.reserveHours ?? 48} hours while the wire arrives. Details below and in your confirmation email.`}
                      {p.id === "test" && "Sandbox: no money moves."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {providerId === "bank_transfer" && quote?.bankTransfer && (
            <div className="mt-4 rounded-lg border border-ink-200 bg-ink-50 p-4">
              <p className="text-sm font-semibold text-ink-950">Wire details</p>
              <div className="mt-2">
                <BankDetails lines={quote.bankTransfer.lines} note={quote.bankTransfer.note} compact />
              </div>
              <p className="mt-2 text-[13px] text-ink-600">Your order number is the payment reference — it appears on the next page and in your email.</p>
            </div>
          )}
        </fieldset>

        <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
          <label className="block text-sm font-medium text-ink-800" htmlFor="checkout-note">
            Note for the seller (optional)
          </label>
          <textarea id="checkout-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="mt-1.5 w-full rounded-lg border border-ink-300 px-3.5 py-2.5 text-[15px] text-ink-900 focus:border-brand-500" placeholder="Delivery instructions, gift note…" />
        </div>
      </div>

      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-6">
            <h2 className="font-display text-xl font-semibold text-ink-950">Order summary</h2>
            <ul className="mt-5 grid gap-4">
              {lines.map((line) => {
                const resolved = quote?.lines.find((l) => l.id === line.id);
                return (
                  <li key={line.id} className="flex items-start gap-3">
                    <CartThumb line={line} className="h-16 w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-ink-950">{line.name}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {line.meta} · Qty {line.qty}
                      </span>
                      {resolved?.problem && <span className="mt-0.5 block text-xs font-medium text-rose-700">{resolved.problem}</span>}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-ink-950">{formatExact((resolved?.unitPrice ?? line.price) * line.qty)}</span>
                  </li>
                );
              })}
            </ul>

            {couponsEnabled && (
              <div className="mt-5 border-t border-ink-200 pt-5">
                {couponCode && quote?.couponCode ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-brand-800">
                      <strong>{quote.couponCode}</strong> — {quote.couponMessage}
                    </span>
                    <button type="button" onClick={() => { setCouponCode(undefined); setCouponInput(""); }} className="text-xs font-medium text-ink-500 underline">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={couponInput} onChange={(e) => setCouponInput(e.target.value)} placeholder="Coupon code" aria-label="Coupon code" className="h-10 min-w-0 flex-1 rounded-lg border border-ink-300 bg-white px-3 text-sm uppercase" />
                    <button type="button" onClick={() => setCouponCode(couponInput.trim() || undefined)} className={`${buttonStyles.outline} ${buttonSizes.sm}`}>
                      Apply
                    </button>
                  </div>
                )}
                {couponCode && quote && !quote.couponCode && quote.couponMessage && <p className="mt-2 text-xs text-rose-700">{quote.couponMessage}</p>}
              </div>
            )}

            <dl className="mt-6 grid gap-3 border-t border-ink-200 pt-5 text-sm" aria-busy={quoting}>
              <Row label="Subtotal" value={quote ? formatExact(quote.subtotal) : "—"} />
              {quote && quote.discount > 0 && <Row label="Discount" value={`− ${formatExact(quote.discount)}`} />}
              <Row label="Shipping & insurance" value={quote ? (quote.hasPhysical ? (quote.shipping ? (quote.shippingTotal === 0 ? "Free" : formatExact(quote.shippingTotal)) : "—") : "Not required") : "—"} />
              <Row label={quote ? `${quote.tax.label}${quote.tax.rateBps ? ` (${(quote.tax.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : ""}` : "Tax"} value={quote ? formatExact(quote.tax.amount) : "—"} />
              <div className="mt-1 flex justify-between gap-4 border-t border-ink-200 pt-4">
                <dt className="font-display text-lg font-semibold text-ink-950">Total</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink-950">{quote ? formatMoney(quote.presentmentTotal, quote.currency.code) : "—"}</dd>
              </div>
              {quote && !quote.currency.isBase && <p className="text-xs text-ink-500">Charged in {quote.currency.code}. Base amount {formatMoney(quote.total, "USD")}.</p>}
            </dl>
            {quoteError && <p className="mt-3 text-sm text-rose-700">{quoteError}</p>}

            <button type="submit" disabled={!canSubmit || submitting} className={`${buttonStyles.primary} ${buttonSizes.lg} mt-6 w-full`}>
              {submitting ? "Placing order…" : quote ? `Place order — ${formatMoney(quote.presentmentTotal, quote.currency.code)}` : "Place order"}
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
              <li className="flex items-start gap-2">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Stock is reserved the moment you place the order
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-600">{label}</dt>
      <dd className="font-medium tabular-nums text-ink-950">{value}</dd>
    </div>
  );
}

function AddressFields({ title, prefix, value, onChange, countries, regions, country }: { title: string; prefix: string; value: Address; onChange: (patch: Partial<Address>) => void; countries: CountryOption[]; regions: string[]; country: CountryOption | undefined }) {
  return (
    <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="font-display text-xl font-semibold text-ink-950">{title}</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <SelectField label="Country" name={`${prefix}Country`} required autoComplete="country" value={value.countryCode} onChange={(e) => onChange({ countryCode: e.target.value, region: undefined })} className="sm:col-span-2">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField label="First name" name={`${prefix}FirstName`} required autoComplete="given-name" value={value.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        <TextField label="Last name" name={`${prefix}LastName`} required autoComplete="family-name" value={value.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        <TextField label="Company (optional)" name={`${prefix}Company`} autoComplete="organization" value={value.company ?? ""} onChange={(e) => onChange({ company: e.target.value || undefined })} className="sm:col-span-2" />
        <TextField label="Address" name={`${prefix}Line1`} required autoComplete="address-line1" value={value.line1} onChange={(e) => onChange({ line1: e.target.value })} className="sm:col-span-2" />
        <TextField label="Apartment, suite, etc." name={`${prefix}Line2`} autoComplete="address-line2" value={value.line2 ?? ""} onChange={(e) => onChange({ line2: e.target.value || undefined })} className="sm:col-span-2" />
        <TextField label="City" name={`${prefix}City`} required autoComplete="address-level2" value={value.city} onChange={(e) => onChange({ city: e.target.value })} />
        <div className="grid grid-cols-2 gap-4">
          {regions.length > 0 ? (
            <SelectField label={country?.regionRequired ? "State / province" : "State / province (optional)"} name={`${prefix}Region`} required={country?.regionRequired} autoComplete="address-level1" value={value.region ?? ""} onChange={(e) => onChange({ region: e.target.value || undefined })}>
              <option value="">—</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectField>
          ) : (
            <TextField label={country?.regionRequired ? "State / region" : "State / region (optional)"} name={`${prefix}Region`} required={country?.regionRequired} autoComplete="address-level1" value={value.region ?? ""} onChange={(e) => onChange({ region: e.target.value || undefined })} />
          )}
          <TextField label={country?.postalCodeRequired === false ? "Postal code (optional)" : "Postal code"} name={`${prefix}Postal`} required={country?.postalCodeRequired !== false} autoComplete="postal-code" value={value.postalCode ?? ""} onChange={(e) => onChange({ postalCode: e.target.value || undefined })} />
        </div>
      </div>
    </div>
  );
}
