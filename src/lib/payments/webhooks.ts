import "server-only";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/payments/registry";
import { stripeApi } from "@/lib/payments/providers/stripe";
import { markOrderPaid, markOrderPaymentFailed, addOrderEvent } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess, applyProviderRefund, openChargeback, closeChargeback } from "@/lib/payments/payment-service";
import type { WebhookEventEnvelope } from "@/lib/payments/types";

const WEBHOOK_ACTOR = { id: null, type: "webhook" as const };

/**
 * Receives a verified webhook, stores it exactly once (provider + eventId is
 * unique) and processes it. Re-deliveries of a processed event are acknowledged
 * without side effects; failures are kept for retry from the admin.
 */
export async function ingestWebhook(providerId: string, req: Request): Promise<Response> {
  const provider = getProvider(providerId);
  if (!provider?.verifyWebhook) return new Response("Unknown provider", { status: 404 });
  const rawBody = await req.text();
  const envelope = await provider.verifyWebhook(req, rawBody);
  if (!envelope) return new Response("Invalid signature", { status: 400 });

  let stored;
  try {
    stored = await db.webhookEvent.create({
      data: { provider: providerId, eventId: envelope.eventId, type: envelope.type, payload: rawBody.slice(0, 200_000) },
    });
  } catch {
    // unique violation → already received
    return Response.json({ received: true, duplicate: true });
  }
  try {
    await processWebhook(providerId, envelope);
    await db.webhookEvent.update({ where: { id: stored.id }, data: { status: "processed", processedAt: new Date() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.webhookEvent.update({ where: { id: stored.id }, data: { status: "failed", error: message.slice(0, 1000) } });
    console.error(`[webhook:${providerId}] ${envelope.type} failed: ${message}`);
  }
  return Response.json({ received: true });
}

export async function reprocessWebhookEvent(id: string) {
  const event = await db.webhookEvent.findUnique({ where: { id } });
  if (!event) return;
  const provider = getProvider(event.provider);
  if (!provider) throw new Error("Unknown provider");
  const parsed = JSON.parse(event.payload) as Record<string, unknown>;
  const envelope: WebhookEventEnvelope =
    event.provider === "stripe"
      ? { eventId: event.eventId, type: event.type, data: (parsed.data as { object: unknown })?.object }
      : { eventId: event.eventId, type: event.type, data: parsed.resource };
  try {
    await processWebhook(event.provider, envelope);
    await db.webhookEvent.update({ where: { id }, data: { status: "processed", processedAt: new Date(), error: null } });
  } catch (err) {
    await db.webhookEvent.update({ where: { id }, data: { status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 1000) } });
    throw err;
  }
}

async function paymentByRef(provider: string, providerRef: string) {
  return db.payment.findFirst({ where: { provider, providerRef }, include: { order: { select: { id: true, number: true } } } });
}

async function processWebhook(providerId: string, event: WebhookEventEnvelope) {
  if (providerId === "stripe") return processStripe(event);
  if (providerId === "paypal") return processPaypal(event);
  await db.webhookEvent.updateMany({ where: { provider: providerId, eventId: event.eventId }, data: { status: "ignored" } });
}

type StripeObject = { id: string; object: string; payment_intent?: string; amount?: number; amount_refunded?: number; reason?: string; status?: string; last_payment_error?: { message?: string }; charge?: string; evidence_details?: { due_by?: number } };

async function processStripe(event: WebhookEventEnvelope) {
  const obj = event.data as StripeObject;
  switch (event.type) {
    case "payment_intent.succeeded": {
      const payment = await paymentByRef("stripe", obj.id);
      if (!payment) return;
      const intent = await stripeApi.retrieveIntent(obj.id);
      await applyPaymentSuccess(payment.id, stripeApi.detailsFrom(intent), WEBHOOK_ACTOR);
      return;
    }
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const payment = await paymentByRef("stripe", obj.id);
      if (!payment) return;
      await db.payment.update({ where: { id: payment.id }, data: { status: event.type.endsWith("canceled") ? "cancelled" : "failed", failureMessage: obj.last_payment_error?.message ?? null } });
      await markOrderPaymentFailed(payment.orderId, obj.last_payment_error?.message ?? event.type, WEBHOOK_ACTOR);
      return;
    }
    case "charge.refunded": {
      if (!obj.payment_intent) return;
      const payment = await paymentByRef("stripe", obj.payment_intent);
      if (!payment) return;
      await applyProviderRefund(payment.id, obj.amount_refunded ?? 0, WEBHOOK_ACTOR);
      return;
    }
    case "charge.dispute.created": {
      if (!obj.payment_intent) return;
      const payment = await paymentByRef("stripe", obj.payment_intent);
      if (!payment) return;
      await openChargeback(payment.id, { providerRef: obj.id, amountPresentment: obj.amount ?? payment.presentmentAmount, reason: obj.reason ?? null, evidenceDueAt: obj.evidence_details?.due_by ? new Date(obj.evidence_details.due_by * 1000) : null });
      return;
    }
    case "charge.dispute.closed": {
      await closeChargeback(obj.id, obj.status === "won" ? "won" : obj.status === "lost" ? "lost" : "closed");
      return;
    }
    default:
      await db.webhookEvent.updateMany({ where: { provider: "stripe", eventId: event.eventId }, data: { status: "ignored" } });
  }
}

type PayPalResource = { id: string; status?: string; custom_id?: string; supplementary_data?: { related_ids?: { order_id?: string } }; amount?: { value?: string; currency_code?: string }; reason?: string; disputed_transactions?: { seller_transaction_id?: string }[]; dispute_outcome?: { outcome_code?: string } };

async function processPaypal(event: WebhookEventEnvelope) {
  const res = event.data as PayPalResource;
  switch (event.type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const orderId = res.supplementary_data?.related_ids?.order_id;
      const payment = orderId ? await paymentByRef("paypal", orderId) : null;
      if (!payment) return;
      await applyPaymentSuccess(payment.id, { raw: { captureId: res.id } }, WEBHOOK_ACTOR);
      return;
    }
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const orderId = res.supplementary_data?.related_ids?.order_id;
      const payment = orderId ? await paymentByRef("paypal", orderId) : null;
      if (!payment) return;
      await db.payment.update({ where: { id: payment.id }, data: { status: "failed", failureMessage: event.type } });
      await markOrderPaymentFailed(payment.orderId, event.type, WEBHOOK_ACTOR);
      return;
    }
    case "PAYMENT.CAPTURE.REFUNDED": {
      const orderId = res.supplementary_data?.related_ids?.order_id;
      const payment = orderId ? await paymentByRef("paypal", orderId) : null;
      if (!payment) return;
      const refunded = res.amount?.value ? Math.round(Number.parseFloat(res.amount.value) * 100) : 0;
      await applyProviderRefund(payment.id, payment.refundedAmount + refunded, WEBHOOK_ACTOR, { absolute: false });
      return;
    }
    case "CUSTOMER.DISPUTE.CREATED": {
      const captureId = res.disputed_transactions?.[0]?.seller_transaction_id;
      if (!captureId) return;
      const payment = await db.payment.findFirst({ where: { provider: "paypal", rawJson: { contains: captureId } } });
      if (!payment) return;
      await openChargeback(payment.id, { providerRef: res.id, amountPresentment: payment.presentmentAmount, reason: res.reason ?? null, evidenceDueAt: null });
      return;
    }
    case "CUSTOMER.DISPUTE.RESOLVED": {
      const outcome = res.dispute_outcome?.outcome_code ?? "";
      await closeChargeback(res.id, outcome === "RESOLVED_SELLER_FAVOUR" ? "won" : outcome === "RESOLVED_BUYER_FAVOUR" ? "lost" : "closed");
      return;
    }
    default:
      await db.webhookEvent.updateMany({ where: { provider: "paypal", eventId: event.eventId }, data: { status: "ignored" } });
  }
}

export { addOrderEvent, markOrderPaid };
