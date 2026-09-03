"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { CartThumb } from "@/components/cart-thumb";
import { CartIcon, TrashIcon, ShieldIcon, TruckIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { formatPriceExact } from "@/lib/format";
import { FREE_SHIPPING_THRESHOLD, TAX_LABEL, estimateShipping, estimateTax } from "@/lib/pricing";

export function CartView() {
  const { lines, subtotal, setQty, remove, clear, hydrated } = useCart();

  if (!hydrated) {
    return (
      <div className="animate-pulse rounded-xl border border-ink-200 bg-ink-50 px-6 py-20" aria-busy>
        <p className="text-center text-sm text-ink-500">Loading your cart…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
          <CartIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">Your cart is empty</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
          Browse graded key issues in the store, or book a grading, pressing or appraisal service.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/store" className={`${buttonStyles.primary} ${buttonSizes.md}`}>
            Shop graded comics
          </Link>
          <Link href="/services" className={`${buttonStyles.outline} ${buttonSizes.md}`}>
            Browse services
          </Link>
        </div>
      </div>
    );
  }

  const hasPhysical = lines.some((l) => l.kind === "comic");
  const shipping = estimateShipping(subtotal, hasPhysical);
  const tax = estimateTax(subtotal);
  const total = subtotal + shipping + tax;
  const toFreeShipping = FREE_SHIPPING_THRESHOLD - subtotal;

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      <div className="lg:col-span-8">
        <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-4 p-5">
              <Link href={line.href} className="shrink-0" aria-label={line.name} tabIndex={-1}>
                <CartThumb line={line} className="h-28 w-20" />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold leading-snug text-ink-950">
                      <Link href={line.href} className="hover:text-brand-700">
                        {line.name}
                      </Link>
                    </h2>
                    <p className="mt-1 text-[13px] text-ink-500">{line.meta}</p>
                    <p className="mt-1 text-[12px] uppercase tracking-wide text-ink-500">
                      {line.kind === "comic" ? "Collectible comic" : "Service booking"}
                    </p>
                  </div>
                  <p className="font-display text-lg font-semibold tabular-nums text-ink-950">
                    {formatPriceExact(line.price * line.qty)}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <div className="inline-flex items-center rounded-lg border border-ink-300">
                    <button
                      type="button"
                      onClick={() => setQty(line.id, line.qty - 1)}
                      className="h-9 w-9 text-ink-600 hover:bg-ink-100"
                      aria-label={`Decrease quantity of ${line.name}`}
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(line.id, line.qty + 1)}
                      disabled={line.qty >= line.maxQty}
                      className="h-9 w-9 text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                      aria-label={`Increase quantity of ${line.name}`}
                    >
                      +
                    </button>
                  </div>
                  {line.qty >= line.maxQty && (
                    <span className="text-xs text-ink-500">Maximum available</span>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(line.id)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-rose-600"
                    aria-label={`Remove ${line.name} from cart`}
                  >
                    <TrashIcon className="h-4 w-4" /> Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/store" className={`${buttonStyles.outline} ${buttonSizes.sm}`}>
            ← Continue shopping
          </Link>
          <button type="button" onClick={clear} className={`${buttonStyles.quiet} ${buttonSizes.sm}`}>
            Empty cart
          </button>
        </div>
      </div>

      {/* Summary */}
      <aside className="lg:col-span-4">
        <div className="lg:sticky lg:top-24">
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-6">
            <h2 className="font-display text-xl font-semibold text-ink-950">Order summary</h2>

            <dl className="mt-5 grid gap-3 text-sm">
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
                <dt className="text-ink-600">Estimated tax ({TAX_LABEL})</dt>
                <dd className="font-medium tabular-nums text-ink-950">{formatPriceExact(tax)}</dd>
              </div>
              <div className="mt-2 flex justify-between gap-4 border-t border-ink-200 pt-4">
                <dt className="font-display text-lg font-semibold text-ink-950">Total</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink-950">
                  {formatPriceExact(total)}
                </dd>
              </div>
            </dl>

            {hasPhysical && toFreeShipping > 0 && (
              <p className="mt-4 rounded-lg bg-white px-3.5 py-2.5 text-[13px] text-ink-700 ring-1 ring-ink-200">
                Add <span className="font-semibold text-brand-700">{formatPriceExact(toFreeShipping)}</span> more for
                free insured shipping.
              </p>
            )}

            <Link href="/checkout" className={`${buttonStyles.primary} ${buttonSizes.lg} mt-5 w-full`}>
              Proceed to checkout
            </Link>

            <ul className="mt-5 grid gap-2.5 text-[13px] text-ink-600">
              <li className="flex items-start gap-2">
                <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Authenticity guaranteed on every book
              </li>
              <li className="flex items-start gap-2">
                <TruckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                Double-boxed, signature required, fully insured
              </li>
            </ul>

            <p className="mt-5 border-t border-ink-200 pt-4 text-xs leading-relaxed text-ink-500">
              Questions before you buy?{" "}
              <Link href="/support" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                Contact support
              </Link>{" "}
              or call us during business hours.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
