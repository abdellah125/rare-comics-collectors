"use client";

import { useEffect, useRef, useState } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";

type StripeElements = { create: (type: string, opts?: Record<string, unknown>) => { mount: (sel: HTMLElement) => void; unmount: () => void } };
type StripeInstance = {
  elements: (opts: { clientSecret: string; appearance?: Record<string, unknown> }) => StripeElements;
  confirmPayment: (opts: { elements: StripeElements; confirmParams: { return_url: string }; redirect?: "if_required" }) => Promise<{ error?: { message?: string }; paymentIntent?: { status: string; id: string } }>;
};
declare global {
  interface Window {
    Stripe?: (key: string) => StripeInstance;
  }
}

let loader: Promise<void> | null = null;
function loadStripeJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Stripe) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Could not load Stripe.js"));
      document.head.appendChild(s);
    });
  }
  return loader;
}

/**
 * Stripe Payment Element. Card data goes straight from the browser to Stripe;
 * the server only ever sees a PaymentIntent id. After confirmation the buyer
 * lands on /checkout/return, which verifies the intent server-side.
 */
export function StripePayment({ clientSecret, publishableKey, returnUrl, amountLabel, onCancel }: { clientSecret: string; publishableKey: string; returnUrl: string; amountLabel: string; onCancel: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<StripeInstance | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let element: ReturnType<StripeElements["create"]> | null = null;
    loadStripeJs()
      .then(() => {
        if (cancelled || !window.Stripe || !mountRef.current) return;
        const stripe = window.Stripe(publishableKey);
        const elements = stripe.elements({ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#e11d48", borderRadius: "8px" } } });
        element = elements.create("payment", { layout: "tabs" });
        element.mount(mountRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
      element?.unmount();
    };
  }, [clientSecret, publishableKey]);

  const pay = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setSubmitting(true);
    setError(null);
    const { error, paymentIntent } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (error) {
      setError(error.message ?? "Payment failed. Try another card.");
      setSubmitting(false);
      return;
    }
    const url = new URL(returnUrl, window.location.origin);
    if (paymentIntent) url.searchParams.set("payment_intent", paymentIntent.id);
    window.location.assign(url.toString());
  };

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h2 className="font-display text-xl font-semibold text-ink-950">Card details</h2>
      <p className="mt-1 text-[13px] text-ink-500">Processed securely by Stripe. We never see or store your card number.</p>
      <div ref={mountRef} className="mt-5 min-h-[120px]" />
      {!ready && !error && <p className="text-sm text-ink-500">Loading secure payment form…</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={pay} disabled={!ready || submitting} className={`${buttonStyles.primary} ${buttonSizes.lg}`}>
          {submitting ? "Processing…" : `Pay ${amountLabel}`}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className={`${buttonStyles.outline} ${buttonSizes.lg}`}>
          Back
        </button>
      </div>
    </div>
  );
}
