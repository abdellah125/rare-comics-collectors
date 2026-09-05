import "server-only";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { minorUnitDigits } from "@/lib/money";
import { requestJson } from "@/lib/payments/http";
import type { PaymentProvider } from "@/lib/payments/types";

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
  purchase_units?: { payments?: { captures?: { id: string; status: string; seller_receivable_breakdown?: { paypal_fee?: { value: string } } }[] } }[];
};

export const paypalProvider: PaymentProvider = {
  id: "paypal",
  displayName: "PayPal",
  method: "paypal",
  isConfigured: () => env.paypal.configured,

  async createPayment(input) {
    const order = await api<PayPalOrder>("/v2/checkout/orders", {
      method: "POST",
      requestId: input.idempotencyKey,
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.orderId,
            custom_id: input.orderNumber,
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: value(input.amountMinor, input.currency) },
          },
        ],
        application_context: {
          brand_name: (await getSettings())["marketplace.name"].slice(0, 127),
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    });
    const approve = order.links?.find((l) => l.rel === "approve")?.href;
    if (!approve) return { kind: "failed", providerRef: order.id, message: "PayPal did not return an approval link" };
    return { kind: "redirect", providerRef: order.id, redirectUrl: approve };
  },

  async confirmPayment(providerRef) {
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
  },

  async refund(input) {
    const raw = (input.paymentRaw ?? {}) as { captureId?: string };
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
    let event: { id: string; event_type: string; resource: unknown };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const result = await api<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
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
    if (result.verification_status !== "SUCCESS") return null;
    return { eventId: event.id, type: event.event_type, data: event.resource };
  },
};
