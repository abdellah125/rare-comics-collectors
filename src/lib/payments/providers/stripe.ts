import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { formEncode, requestJson } from "@/lib/payments/http";
import type { PaymentProvider, PaymentDetails } from "@/lib/payments/types";

const API = "https://api.stripe.com/v1";

type StripeIntent = {
  id: string;
  status: string;
  client_secret?: string;
  amount: number;
  currency: string;
  last_payment_error?: { message?: string; code?: string } | null;
  latest_charge?: { id: string; payment_method_details?: { card?: { brand?: string; last4?: string } }; balance_transaction?: { fee?: number } } | string | null;
};

function headers(idempotencyKey?: string): HeadersInit {
  return {
    authorization: `Bearer ${env.stripe.secretKey}`,
    "content-type": "application/x-www-form-urlencoded",
    "stripe-version": "2024-06-20",
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  };
}

function detailsFrom(intent: StripeIntent): PaymentDetails {
  const charge = typeof intent.latest_charge === "object" && intent.latest_charge ? intent.latest_charge : null;
  return {
    cardBrand: charge?.payment_method_details?.card?.brand,
    cardLast4: charge?.payment_method_details?.card?.last4,
    feeAmount: charge?.balance_transaction?.fee,
    raw: { intentId: intent.id, chargeId: charge?.id },
  };
}

async function retrieveIntent(id: string): Promise<StripeIntent> {
  return requestJson<StripeIntent>(`${API}/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge&expand[]=latest_charge.balance_transaction`, { headers: headers() });
}

/** Verifies Stripe's `Stripe-Signature` header (t=…,v1=…) against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSeconds = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  if (!safeEqual(expected, v1)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number.parseInt(t, 10));
  return Number.isFinite(age) && age <= toleranceSeconds;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  displayName: "Credit or debit card",
  method: "card",
  isConfigured: () => env.stripe.configured,

  async createPayment(input) {
    const intent = await requestJson<StripeIntent>(`${API}/payment_intents`, {
      method: "POST",
      headers: headers(input.idempotencyKey),
      body: formEncode({
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: input.email,
        description: input.description,
        metadata: { ...input.metadata, order_id: input.orderId, order_number: input.orderNumber },
      }),
    });
    if (!intent.client_secret) return { kind: "failed", providerRef: intent.id, message: "Stripe did not return a client secret" };
    return { kind: "client_confirm", providerRef: intent.id, clientSecret: intent.client_secret, publishableKey: env.stripe.publishableKey };
  },

  async confirmPayment(providerRef) {
    const intent = await retrieveIntent(providerRef);
    if (intent.status === "succeeded") return { status: "succeeded", providerRef, details: detailsFrom(intent) };
    if (intent.status === "processing" || intent.status === "requires_capture") return { status: "pending", providerRef };
    if (intent.status === "canceled") return { status: "failed", providerRef, message: "Payment was cancelled" };
    return { status: "failed", providerRef, message: intent.last_payment_error?.message ?? `Payment not completed (${intent.status})` };
  },

  async refund(input) {
    const reason = ["duplicate", "fraudulent", "requested_by_customer"].includes(input.reason) ? input.reason : "requested_by_customer";
    const refund = await requestJson<{ id: string; status: string; failure_reason?: string }>(`${API}/refunds`, {
      method: "POST",
      headers: headers(input.idempotencyKey),
      body: formEncode({ payment_intent: input.providerRef, amount: input.amountMinor, reason }),
    });
    if (refund.status === "succeeded") return { status: "succeeded", providerRef: refund.id };
    if (refund.status === "pending") return { status: "pending", providerRef: refund.id };
    return { status: "failed", providerRef: refund.id, message: refund.failure_reason ?? `Refund ${refund.status}` };
  },

  async verifyWebhook(req, rawBody) {
    if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), env.stripe.webhookSecret)) return null;
    const event = JSON.parse(rawBody) as { id: string; type: string; data: { object: unknown } };
    return { eventId: event.id, type: event.type, data: event.data.object };
  },
};

/** Exposed for webhook processing: fetch the current intent state with charge details. */
export const stripeApi = { retrieveIntent, detailsFrom };
