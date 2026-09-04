/**
 * Payment provider abstraction. Each provider adapts one gateway to this
 * interface; the checkout, refund and webhook code only talk to the interface,
 * so adding a gateway means adding one file under providers/ and registering
 * it in registry.ts.
 */
export type PaymentProviderId = "stripe" | "paypal" | "bank_transfer" | "test";
export type PaymentMethodKind = "card" | "paypal" | "bank_transfer" | "test";

export type PaymentIntentInput = {
  orderId: string;
  orderNumber: string;
  /** minor units of `currency` (presentment) */
  amountMinor: number;
  currency: string;
  email: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
};

export type PaymentIntentResult =
  /** Client completes the payment in the browser (Stripe Payment Element). */
  | { kind: "client_confirm"; providerRef: string; clientSecret: string; publishableKey: string }
  /** Buyer is sent to the gateway and comes back to returnUrl. */
  | { kind: "redirect"; providerRef: string; redirectUrl: string }
  /** Offline method: show instructions, await manual confirmation. */
  | { kind: "instructions"; providerRef: string; instructions: string }
  /** Settled immediately (test gateway). */
  | { kind: "succeeded"; providerRef: string; details?: PaymentDetails }
  | { kind: "failed"; providerRef: string | null; message: string };

export type PaymentDetails = { cardBrand?: string; cardLast4?: string; feeAmount?: number; raw?: unknown };

export type ConfirmResult =
  | { status: "succeeded"; providerRef: string; details?: PaymentDetails }
  | { status: "pending"; providerRef: string }
  | { status: "failed"; providerRef: string; message: string };

export type RefundInput = {
  /** provider reference stored on the Payment row */
  providerRef: string;
  /** any extra references the provider stored on the payment (e.g. PayPal capture id) */
  paymentRaw: unknown;
  amountMinor: number;
  currency: string;
  reason: string;
  idempotencyKey: string;
};

export type RefundResult = { status: "succeeded" | "pending" | "failed"; providerRef?: string; message?: string };

export type WebhookEventEnvelope = { eventId: string; type: string; data: unknown };

export interface PaymentProvider {
  id: PaymentProviderId;
  displayName: string;
  method: PaymentMethodKind;
  /** Whether credentials are present in the environment. */
  isConfigured(): boolean;
  createPayment(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  /** Called when the buyer returns from the gateway or the client reports completion. */
  confirmPayment?(providerRef: string, params: Record<string, string>): Promise<ConfirmResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  /** Verifies the signature and parses the event; returns null when it should be rejected. */
  verifyWebhook?(req: Request, rawBody: string): Promise<WebhookEventEnvelope | null>;
}

export class PaymentProviderError extends Error {
  constructor(message: string, public code = "provider_error") {
    super(message);
    this.name = "PaymentProviderError";
  }
}
