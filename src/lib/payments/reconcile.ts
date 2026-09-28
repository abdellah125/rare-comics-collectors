import "server-only";
import { db } from "@/lib/db";
import type { ActorRef } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess } from "@/lib/payments/payment-service";
import { getProvider } from "@/lib/payments/registry";

export type ReconcileOutcome = "succeeded" | "pending" | "failed" | "skipped";

/**
 * Asks the gateway what really happened to a payment and books a success we missed.
 *
 * The buyer's return leg (/checkout/return) used to be the only place a PayPal order was
 * captured and an order marked paid. A closed tab, a slow function or a webhook that never
 * arrived left the money at the gateway while the order stayed in pending_payment and was
 * then cancelled by the reservation job. This is called from the PayPal approval webhook,
 * from the expiry job before it cancels anything, from a half-hourly sweep and from the
 * admin order page. It only ever books successes: a payment the gateway calls failed or
 * still open is left for the expiry job and the return leg.
 */
export async function reconcilePayment(paymentId: string, actor: ActorRef): Promise<ReconcileOutcome> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return "skipped";
  if (["succeeded", "refunded", "partially_refunded"].includes(payment.status)) return "succeeded";
  const provider = getProvider(payment.provider);
  // The test gateway answers "succeeded" to everything, which would stop test reservations from expiring.
  if (!provider?.confirmPayment || !payment.providerRef || provider.id === "test") return "skipped";
  let result;
  try {
    result = await provider.confirmPayment(payment.providerRef, {});
  } catch (err) {
    console.error(`[reconcile] ${payment.provider} ${payment.providerRef}: ${err instanceof Error ? err.message : err}`);
    return "pending";
  }
  if (result.status === "succeeded") {
    await applyPaymentSuccess(payment.id, result.details, actor);
    return "succeeded";
  }
  return result.status;
}

/** Recent gateway payments still open on our side, checked against the gateway (job, every 30 minutes). */
export async function reconcileRecentPayments(days = 7): Promise<{ checked: number; booked: number }> {
  const since = new Date(Date.now() - days * 86_400_000);
  const payments = await db.payment.findMany({
    where: {
      provider: { in: ["paypal", "stripe"] },
      status: { in: ["pending", "requires_action"] },
      providerRef: { not: null },
      createdAt: { gte: since },
      order: { status: { in: ["pending_payment", "cancelled", "failed"] } },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  let booked = 0;
  for (const p of payments) {
    if ((await reconcilePayment(p.id, { id: null, type: "job" })) === "succeeded") booked += 1;
  }
  if (payments.length > 0) console.log(`[reconcile] ${payments.length} open payment(s) checked, ${booked} booked`);
  return { checked: payments.length, booked };
}
