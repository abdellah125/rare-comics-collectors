"use client";

import { useEffect } from "react";

export type PurchaseItem = { item_id: string; item_name: string; price: number; quantity: number; item_category?: string };

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Pushes a GA4-shaped `purchase` event for the Google tag once per order. The
 * command is queued on `dataLayer` exactly the way gtag.js does it, so it works
 * whether the tag library has already loaded or is still on its way, and it is
 * harmless where the tag is not rendered at all (previews, local runs).
 * Refreshing the confirmation page does not fire it again.
 */
export function PurchaseEvent({
  transactionId,
  value,
  currency,
  tax,
  shipping,
  paymentType,
  items,
}: {
  transactionId: string;
  value: number;
  currency: string;
  tax: number;
  shipping: number;
  paymentType: string;
  items: PurchaseItem[];
}) {
  useEffect(() => {
    const key = `rcc.purchase.${transactionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // storage unavailable: fire anyway
    }
    window.dataLayer = window.dataLayer || [];
    // gtag.js only recognises Arguments objects on the queue, never plain arrays.
    const gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    } as (...args: unknown[]) => void;
    gtag("event", "purchase", { transaction_id: transactionId, value, currency, tax, shipping, payment_type: paymentType, items });
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }, [transactionId, value, currency, tax, shipping, paymentType, items]);
  return null;
}
