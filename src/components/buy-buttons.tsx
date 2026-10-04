"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useCart, type CartLine } from "@/components/cart-provider";
import { CartIcon, CheckIcon } from "@/components/icons";
import { useT } from "@/components/i18n-provider";
import { buttonSizes, buttonStyles } from "@/components/ui";
import type { ProductSummary } from "@/lib/products";
import { productToLine } from "@/lib/cart-lines";

/* ------------------------------------------------------------------------ */

export function AddToCartButton({
  line,
  qty = 1,
  disabled,
  size = "lg",
  variant = "outline",
  label,
  className = "",
}: {
  line: Omit<CartLine, "qty">;
  qty?: number;
  disabled?: boolean;
  size?: keyof typeof buttonSizes;
  variant?: keyof typeof buttonStyles;
  label?: string;
  className?: string;
}) {
  const tr = useT();
  const text = label ?? tr("Add to cart");
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        add(line, qty);
        setAdded(true);
        window.clearTimeout(resetTimer.current);
        resetTimer.current = window.setTimeout(() => setAdded(false), 1600);
      }}
      className={`${buttonStyles[variant]} ${buttonSizes[size]} ${className}`}
      aria-label={`${added ? tr("Added to cart") : text} — ${line.name}`}
    >
      {added ? <CheckIcon className="h-4 w-4" /> : <CartIcon className="h-4 w-4" />}
      {added ? tr("Added") : text}
    </button>
  );
}

export function BuyNowButton({
  line,
  qty = 1,
  disabled,
  size = "lg",
  variant = "primary",
  label,
  className = "",
}: {
  line: Omit<CartLine, "qty">;
  qty?: number;
  disabled?: boolean;
  size?: keyof typeof buttonSizes;
  variant?: keyof typeof buttonStyles;
  label?: string;
  className?: string;
}) {
  const tr = useT();
  const text = label ?? tr("Buy now");
  const { add } = useCart();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        // Buy Now skips the drawer and goes straight to checkout.
        add(line, qty, { open: false });
        startTransition(() => router.push("/checkout?express=1"));
      }}
      className={`${buttonStyles[variant]} ${buttonSizes[size]} ${className}`}
      aria-label={`${text} — ${line.name}`}
    >
      {pending ? tr("Taking you to checkout…") : text}
    </button>
  );
}

/** Quantity stepper + Buy Now + Add to Cart, used on the product detail page. */
export function PurchasePanel({ product }: { product: ProductSummary }) {
  const tr = useT();
  const [qty, setQty] = useState(1);
  const line = productToLine(product);
  const soldOut = product.stock <= 0;

  return (
    <div className="space-y-3">
      {product.stock > 1 && (
        <div className="flex items-center gap-3">
          <span id="qty-label" className="text-sm font-medium text-ink-700">
            {tr("Quantity")}
          </span>
          <div className="inline-flex items-center rounded-lg border border-ink-300">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="h-10 w-10 text-lg text-ink-600 hover:bg-ink-100 disabled:opacity-40"
              aria-label={tr("Decrease quantity")}
            >
              −
            </button>
            <output aria-labelledby="qty-label" className="w-10 text-center text-sm font-semibold tabular-nums">
              {qty}
            </output>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
              disabled={qty >= product.stock}
              className="h-10 w-10 text-lg text-ink-600 hover:bg-ink-100 disabled:opacity-40"
              aria-label={tr("Increase quantity")}
            >
              +
            </button>
          </div>
          <span className="text-xs text-ink-500">{tr("{count} available", { count: product.stock })}</span>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <BuyNowButton line={line} qty={qty} disabled={soldOut} className="w-full" />
        <AddToCartButton line={line} qty={qty} disabled={soldOut} className="w-full" />
      </div>

      {soldOut && (
        <p className="text-sm font-medium text-rose-700">
          {tr("Sold out — contact us to be notified when a comparable copy arrives.")}
        </p>
      )}
    </div>
  );
}
