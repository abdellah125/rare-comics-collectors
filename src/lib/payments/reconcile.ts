import "server-only";
import { db } from "@/lib/db";
import { restoreLatePaidOrder, type ActorRef } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess } from "@/lib/payments/payment-service";
import { getProvider } from "@/lib/payments/registry";
import type { GatewayRecord } from "@/lib/payments/types";

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

export type PaymentCheck = { label: string; ok: boolean | null; detail: string };

/**
 * Everything an admin wants to see before (or after) a restore, on one order: what the gateway
 * says, whether it is the same order and money, refunds, stock, ledger. Read-only.
 */
export async function verifyOrderPayment(orderId: string): Promise<{ checks: PaymentCheck[]; canRestore: boolean }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { stock: true, status: true, title: true, issue: true } } } }, payments: { orderBy: { createdAt: "desc" }, take: 1 }, refunds: { select: { status: true, amount: true } } },
  });
  if (!order) return { checks: [], canRestore: false };
  const payment = order.payments[0];
  const checks: PaymentCheck[] = [];
  if (!payment) return { checks: [{ label: "Payment record", ok: false, detail: "No payment attempt on this order" }], canRestore: false };
  const provider = getProvider(payment.provider);
  let gateway: GatewayRecord | null = null;
  if (provider?.inspectPayment && payment.providerRef) {
    try {
      gateway = await provider.inspectPayment(payment.providerRef);
    } catch (err) {
      checks.push({ label: `${provider.displayName} record`, ok: null, detail: `Could not be read: ${err instanceof Error ? err.message : err}` });
    }
  }
  if (gateway) {
    checks.push({ label: `${provider!.displayName} record`, ok: gateway.captured, detail: `${gateway.status}${gateway.captureId ? ` · capture ${gateway.captureId}` : ""} · ref ${payment.providerRef}` });
    checks.push({ label: "Belongs to this order", ok: gateway.reference ? gateway.reference === order.number : null, detail: gateway.reference ? `gateway reference ${gateway.reference}` : "the gateway did not echo an order number" });
    const ours = (payment.presentmentAmount / 100).toFixed(2);
    checks.push({ label: "Amount matches", ok: gateway.amount ? gateway.amount === ours && (gateway.currency ?? payment.currency) === payment.currency : null, detail: `gateway ${gateway.amount ?? "?"} ${gateway.currency ?? ""} · order ${ours} ${payment.currency}` });
    checks.push({ label: "Not refunded at the gateway", ok: !gateway.refunded, detail: gateway.refunded ? "the gateway shows a refund" : "no refund" });
  } else if (!provider?.inspectPayment) {
    checks.push({ label: "Gateway record", ok: null, detail: `${payment.provider} cannot be queried automatically` });
  }
  checks.push({ label: "Recorded on the order", ok: payment.status === "succeeded" && order.paymentStatus === "paid", detail: `payment ${payment.status}${payment.capturedAt ? ` · captured ${payment.capturedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""} · order payment status ${order.paymentStatus}` });
  checks.push({ label: "Not refunded here", ok: order.refunds.length === 0 && payment.refundedAmount === 0, detail: order.refunds.length ? `${order.refunds.length} refund record(s)` : "no refunds" });
  const comics = order.items.filter((i) => i.kind === "comic");
  const stockOk = comics.every((i) => !i.productId || (i.product && i.product.status === "published" && i.product.stock >= i.qty));
  checks.push({ label: order.status === "paid" || order.status === "processing" ? "Stock reserved" : "Item still in stock", ok: order.status === "paid" || order.status === "processing" ? true : stockOk, detail: comics.map((i) => `${i.title}: ${i.product ? `${i.product.stock} in stock, ${i.product.status}` : "listing removed"}`).join("; ") || "no comics" });
  const ledger = await db.ledgerEntry.count({ where: { orderId } });
  const restored = order.status === "paid" || order.status === "processing";
  checks.push({ label: restored ? "Seller ledger credited once" : "Seller ledger not yet credited", ok: restored ? ledger > 0 : ledger === 0, detail: `${ledger} ledger entr${ledger === 1 ? "y" : "ies"}` });
  checks.push({ label: "Order status", ok: restored, detail: `${order.status}${order.cancelReason ? ` (${order.cancelReason})` : ""}` });
  const canRestore = ["cancelled", "failed"].includes(order.status) && order.paymentStatus === "paid" && order.refunds.length === 0 && payment.refundedAmount === 0 && stockOk && (!gateway || (gateway.captured && !gateway.refunded && (!gateway.reference || gateway.reference === order.number)));
  return { checks, canRestore };
}

/** Recent gateway payments still open on our side, checked against the gateway (job, every 30 minutes). */
export async function reconcileRecentPayments(days = 7): Promise<{ checked: number; booked: number; restored: number }> {
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
  // Orders that were cancelled before their (confirmed) payment was recorded: back to paid while the stock lasts.
  const late = await db.order.findMany({ where: { status: { in: ["cancelled", "failed"] }, paymentStatus: "paid", placedAt: { gte: since }, refunds: { none: {} } }, select: { id: true }, take: 100 });
  let restored = 0;
  for (const o of late) {
    if ((await restoreLatePaidOrder(o.id, { id: null, type: "job" })) === "restored") restored += 1;
  }
  if (payments.length > 0 || late.length > 0) console.log(`[reconcile] ${payments.length} open payment(s) checked, ${booked} booked; ${late.length} late-paid order(s) checked, ${restored} restored`);
  return { checked: payments.length, booked, restored };
}
