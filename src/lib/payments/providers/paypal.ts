import "server-only";
import { env } from "@/lib/env";
import { minorUnitDigits } from "@/lib/money";
import { requestJson } from "@/lib/payments/http";
import { INVOICE_REF_PREFIX } from "@/lib/payments/paypal-invoice";
import type { ConfirmResult, PaymentProvider } from "@/lib/payments/types";

const base = () => (env.paypal.live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const auth = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64");
  const data = await requestJson<{ access_token: string; expires_in: number }>(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function api<T>(path: string, init: RequestInit & { requestId?: string } = {}): Promise<T> {
  const token = await accessToken();
  const { requestId, ...rest } = init;
  return requestJson<T>(`${base()}${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      ...(rest.headers ?? {}),
    },
  });
}

function value(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return (amountMinor / 10 ** digits).toFixed(digits);
}

type PayPalOrder = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units?: { custom_id?: string; amount?: { value?: string; currency_code?: string }; payments?: { captures?: { id: string; status: string; amount?: { value?: string; currency_code?: string }; seller_receivable_breakdown?: { paypal_fee?: { value: string } } }[]; refunds?: { id: string; status: string }[] } }[];
};

/** Payments made through the former redirect flow: ask PayPal about the order and capture it when approved. */
async function confirmDirect(providerRef: string): Promise<ConfirmResult> {
    let order = await api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(providerRef)}`);
    if (order.status === "APPROVED") {
      order = await api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(providerRef)}/capture`, { method: "POST", requestId: `capture_${providerRef}`, body: "{}" });
    }
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status === "COMPLETED" && capture?.status === "COMPLETED") {
      const fee = capture.seller_receivable_breakdown?.paypal_fee?.value;
      return { status: "succeeded", providerRef, details: { feeAmount: fee ? Math.round(Number.parseFloat(fee) * 100) : undefined, raw: { captureId: capture.id } } };
    }
    if (capture?.status === "PENDING" || order.status === "APPROVED") return { status: "pending", providerRef };
    return { status: "failed", providerRef, message: `PayPal order ${order.status.toLowerCase()}` };
}

export const paypalProvider: PaymentProvider = {
  id: "paypal",
  displayName: "PayPal",
  method: "paypal",
  // Invoice requests need no API credentials: staff send the invoice from the PayPal account.
  isConfigured: () => true,

  /**
   * PayPal invoice request: nothing is charged and PayPal is not called. The order waits for
   * staff to send an invoice for its total; it becomes paid only when staff confirm the invoice
   * was paid. The former redirect flow is gone; confirmDirect and inspectPayment remain for
   * the orders it created.
   */
  async createPayment(input) {
    return {
      kind: "instructions",
      providerRef: `${INVOICE_REF_PREFIX}${input.orderNumber}`,
      instructions: "We will contact you and send a PayPal invoice for the order total. Nothing is charged until you pay that invoice.",
    };
  },

  async confirmPayment(providerRef) {
    // An invoice request has no PayPal order to look up; only staff can confirm it.
    if (providerRef.startsWith(INVOICE_REF_PREFIX)) return { status: "pending", providerRef };
    return confirmDirect(providerRef);
  },

  async inspectPayment(providerRef) {
    const order = await api<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(providerRef)}`);
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const refunds = unit?.payments?.refunds ?? [];
    return {
      status: capture ? `${order.status} / capture ${capture.status}` : order.status,
      captured: order.status === "COMPLETED" && capture?.status === "COMPLETED",
      captureId: capture?.id,
      amount: capture?.amount?.value ?? unit?.amount?.value,
      currency: capture?.amount?.currency_code ?? unit?.amount?.currency_code,
      reference: unit?.custom_id,
      refunded: refunds.some((r) => r.status === "COMPLETED") || ["REFUNDED", "PARTIALLY_REFUNDED"].includes(capture?.status ?? ""),
    };
  },

  async refund(input) {
    const raw = (input.paymentRaw ?? {}) as { captureId?: string; invoice?: boolean };
    // A paid invoice has no capture to refund through the API: staff refund it in PayPal.
    if (raw.invoice) return { status: "pending", message: "Refund this PayPal invoice from the PayPal account, then mark the refund as completed here." };
    if (!raw.captureId) return { status: "failed", message: "No PayPal capture id recorded for this payment" };
    const refund = await api<{ id: string; status: string }>(`/v2/payments/captures/${encodeURIComponent(raw.captureId)}/refund`, {
      method: "POST",
      requestId: input.idempotencyKey,
      body: JSON.stringify({ amount: { value: value(input.amountMinor, input.currency), currency_code: input.currency }, note_to_payer: input.reason.slice(0, 255) }),
    });
    if (refund.status === "COMPLETED") return { status: "succeeded", providerRef: refund.id };
    if (refund.status === "PENDING") return { status: "pending", providerRef: refund.id };
    return { status: "failed", providerRef: refund.id, message: `Refund ${refund.status}` };
  },

  async verifyWebhook(req, rawBody) {
    if (!env.paypal.webhookId) return null;
    const h = (name: string) => req.headers.get(name) ?? "";
    // Without PayPal's transmission headers there is nothing to verify: answer 400 without an API round-trip.
    if (!h("paypal-transmission-id") || !h("paypal-transmission-sig") || !h("paypal-cert-url") || !h("paypal-auth-algo") || !h("paypal-transmission-time")) return null;
    let event: { id: string; event_type: string; resource: unknown };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event || typeof event !== "object" || typeof event.id !== "string" || typeof event.event_type !== "string") return null;
    let result: { verification_status: string };
    try {
      result = await api<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: env.paypal.webhookId,
        webhook_event: event,
      }),
    });
    } catch (err) {
      // A verification call that fails (bad credentials, PayPal outage) must not surface as a 500.
      console.error("[webhook:paypal] signature verification call failed", err instanceof Error ? err.message : err);
      return null;
    }
    if (result.verification_status !== "SUCCESS") return null;
    return { eventId: event.id, type: event.event_type, data: event.resource };
  },
};
