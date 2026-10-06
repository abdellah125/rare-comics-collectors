"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasRecentOrderCookie } from "@/lib/commerce/recent-order";
import { CryptoError, checkCryptoPayment, cryptoView, requoteCryptoPayment, submitTxHash, type CryptoView } from "@/lib/crypto-payments/service";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { ensureInstanceSecrets } from "@/lib/secrets";

export type CryptoState = { ok: true; view: CryptoView; orderStatus: string; message?: string } | { ok: false; message: string };

/** The order's crypto payment, for its owner only (signed in, or holding the cookie the checkout issued). */
async function own(orderNumber: unknown) {
  await ensureInstanceSecrets();
  const number = String(orderNumber ?? "").toUpperCase().slice(0, 40);
  if (!number) return null;
  const order = await db.order.findUnique({ where: { number }, select: { id: true, status: true, userId: true, cryptoPayments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const payment = order?.cryptoPayments[0];
  if (!order || !payment) return null;
  const user = await getCurrentUser();
  if (!((user && order.userId === user.id) || (await hasRecentOrderCookie(number)))) return null;
  return { order, payment, user };
}

async function state(orderId: string, paymentId: string, message?: string): Promise<CryptoState> {
  const [payment, order] = await Promise.all([db.cryptoPayment.findUnique({ where: { id: paymentId } }), db.order.findUnique({ where: { id: orderId }, select: { status: true } })]);
  const view = payment && order ? await cryptoView(payment, order.status) : null;
  if (!view || !order) return { ok: false, message: "This payment is no longer available. Please contact us." };
  return { ok: true, view, orderStatus: order.status, message };
}

/**
 * Called by the payment page every few seconds. It asks the blockchain (no more often than the
 * service allows) and returns where the payment stands. It takes no claim from the browser.
 */
export async function cryptoStatusAction(orderNumber: unknown): Promise<CryptoState> {
  const ctx = await own(orderNumber);
  if (!ctx) return { ok: false, message: "Order not found." };
  await checkCryptoPayment(ctx.payment.id);
  return state(ctx.order.id, ctx.payment.id);
}

/** The buyer gives the transaction hash. It is looked up on chain and judged there; saying so proves nothing. */
export async function submitCryptoTxAction(orderNumber: unknown, hash: unknown): Promise<CryptoState> {
  const ctx = await own(orderNumber);
  if (!ctx) return { ok: false, message: "Order not found." };
  const meta = await requestMeta();
  const limiter = await rateLimit(`crypto-tx:${meta.ip ?? "unknown"}`, 12, 10 * 60_000);
  if (!limiter.ok) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const res = await submitTxHash(ctx.payment.id, String(hash ?? "").slice(0, 200), "buyer", { id: ctx.user?.id ?? null, type: ctx.user ? "buyer" : "system" });
  if (!res.ok) return { ok: false, message: res.message };
  return state(ctx.order.id, ctx.payment.id, "Transaction found. We are waiting for the network to confirm it.");
}

/** A new amount after the previous quote lapsed. */
export async function requoteCryptoAction(orderNumber: unknown): Promise<CryptoState> {
  const ctx = await own(orderNumber);
  if (!ctx) return { ok: false, message: "Order not found." };
  const meta = await requestMeta();
  const limiter = await rateLimit(`crypto-quote:${meta.ip ?? "unknown"}`, 10, 10 * 60_000);
  if (!limiter.ok) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  try {
    await requoteCryptoPayment(ctx.payment.id);
  } catch (err) {
    if (err instanceof CryptoError) return { ok: false, message: err.message };
    throw err;
  }
  return state(ctx.order.id, ctx.payment.id);
}
