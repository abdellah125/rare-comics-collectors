"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useCart } from "@/components/cart-provider";
import { CartThumb } from "@/components/cart-thumb";
import { CloseIcon, TrashIcon, CartIcon } from "@/components/icons";
import { usePrice } from "@/components/currency-provider";
import { buttonSizes, buttonStyles } from "@/components/ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CartDrawer() {
  const { isOpen, closeCart, lines, subtotal, setQty, remove, count } = useCart();
  const { formatExact } = usePrice();
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Move focus into the dialog when it opens and back to the trigger when it closes.
  useEffect(() => {
    if (isOpen) {
      restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = window.setTimeout(() => closeButtonRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
    restoreFocusTo.current?.focus();
    restoreFocusTo.current = null;
  }, [isOpen]);

  // Keep Tab cycling inside the dialog while it is open.
  const trapFocus = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[70] overflow-hidden ${isOpen ? "" : "pointer-events-none"}`}
      aria-hidden={!isOpen}
      inert={!isOpen}
    >
      <div
        onClick={closeCart}
        aria-hidden
        className={`absolute inset-0 bg-ink-950/55 backdrop-blur-[2px] transition-opacity duration-250 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        onKeyDown={trapFocus}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-250 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink-950">
            Your cart{count > 0 && <span className="ml-2 text-sm font-normal text-ink-500">({count})</span>}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeCart}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            aria-label="Close cart"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-100 text-ink-400">
              <CartIcon className="h-6 w-6" />
            </span>
            <p className="text-sm text-ink-600">Your cart is empty.</p>
            <Link
              href="/store"
              onClick={closeCart}
              className={`${buttonStyles.primary} ${buttonSizes.md}`}
            >
              Browse the store
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-3.5 py-4">
                  <CartThumb line={line} className="h-20 w-14" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={line.href}
                      onClick={closeCart}
                      className="line-clamp-2 text-sm font-semibold text-ink-950 hover:text-brand-700"
                    >
                      {line.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">{line.meta}</p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="inline-flex items-center rounded-md border border-ink-300">
                        <button
                          type="button"
                          onClick={() => setQty(line.id, line.qty - 1)}
                          className="h-7 w-7 text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                          aria-label={`Decrease quantity of ${line.name}`}
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-xs font-semibold tabular-nums" aria-live="polite">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(line.id, line.qty + 1)}
                          disabled={line.qty >= line.maxQty}
                          className="h-7 w-7 text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                          aria-label={`Increase quantity of ${line.name}`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.id)}
                        className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-rose-600"
                        aria-label={`Remove ${line.name} from cart`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-950">
                    {formatExact(line.price * line.qty)}
                  </p>
                </li>
              ))}
            </ul>

            <footer className="border-t border-ink-200 px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-600">Subtotal</span>
                <span className="font-display text-xl font-semibold tabular-nums text-ink-950">
                  {formatExact(subtotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Shipping, insurance and tax calculated at checkout.
              </p>
              <div className="mt-4 grid gap-2">
                <Link
                  href="/checkout"
                  onClick={closeCart}
                  className={`${buttonStyles.primary} ${buttonSizes.lg} w-full`}
                >
                  Checkout
                </Link>
                <Link
                  href="/cart"
                  onClick={closeCart}
                  className={`${buttonStyles.outline} ${buttonSizes.md} w-full`}
                >
                  View full cart
                </Link>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
