"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { signValue } from "@/lib/crypto";
import { ensureInstanceSecrets } from "@/lib/secrets";
import { getCurrentUser } from "@/lib/auth/session";
import { PlaceOrderSchema, QuoteSchema, placeOrder, quoteCheckout, type PlaceOrderResult, type Quote } from "@/lib/commerce/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { failState, fieldErrors, formToObject, type ActionState } from "@/lib/validation";
import { statusLabel } from "@/lib/domain";

export async function quoteAction(input: unknown): Promise<Quote | { error: string }> {
  const parsed = QuoteSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid cart" };
  const user = await getCurrentUser();
  try {
    return await quoteCheckout({ ...parsed.data, userId: user?.id });
  } catch (err) {
    console.error("[checkout] quote failed", err);
    return { error: "We couldn't price your cart right now. Please try again." };
  }
}

/** Marks an order as "just placed in this browser" so the confirmation page can show it to a guest. */
export async function rememberRecentOrder(orderNumber: string) {
  await ensureInstanceSecrets();
  (await cookies()).set(`rcc_o_${orderNumber}`, signValue(orderNumber, 48 * 3600), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: 48 * 3600,
  });
}

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = PlaceOrderSchema.safeParse(input);
  if (!parsed.success) {
    const errs = fieldErrors(parsed.error);
    const [field, message] = Object.entries(errs)[0] ?? ["", "Check the form"];
    return { ok: false, message: message, field };
  }
  const meta = await requestMeta();
  const limiter = rateLimit(`checkout:${meta.ip ?? "unknown"}`, 12, 10 * 60_000);
  if (!limiter.ok) return { ok: false, message: "Too many checkout attempts. Please wait a few minutes." };
  const user = await getCurrentUser();
  if (user?.impersonator) return { ok: false, message: "Purchases are disabled during a support session." };
  const result = await placeOrder(parsed.data, { userId: user?.id ?? null, userRestrictions: user?.restrictions ?? [], ip: meta.ip, userAgent: meta.userAgent });
  if (result.ok) await rememberRecentOrder(result.orderNumber);
  return result;
}

/* ------------------------------------------------------------ tracking */

const TrackSchema = z.object({ reference: z.string().trim().min(4).max(40), email: z.email().trim().toLowerCase() });

export type TrackedOrder = {
  number: string;
  status: string;
  statusLabel: string;
  placedAt: string;
  total: number;
  currency: string;
  presentmentTotal: number;
  items: { title: string; qty: number; status: string }[];
  shipments: { carrierName: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string; shippedAt: string | null; deliveredAt: string | null }[];
  events: { type: string; message: string; at: string }[];
};

export async function trackOrderAction(_prev: ActionState<TrackedOrder> | undefined, formData: FormData): Promise<ActionState<TrackedOrder>> {
  const parsed = TrackSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Enter your order number and the email used on the order.");
  const meta = await requestMeta();
  const limiter = rateLimit(`track:${meta.ip ?? "unknown"}`, 20, 10 * 60_000);
  if (!limiter.ok) return failState("Too many lookups. Try again in a few minutes.");
  const number = parsed.data.reference.toUpperCase();
  const order = await db.order.findFirst({
    where: { number, email: parsed.data.email },
    include: {
      items: { select: { title: true, qty: true, status: true } },
      shipments: { include: { carrier: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" }, where: { type: { notIn: ["note"] } }, select: { type: true, message: true, createdAt: true } },
    },
  });
  if (!order) {
    return failState("We couldn't find an order with that number and email. Check your confirmation email, or contact support and we'll look it up.");
  }
  return {
    ok: true,
    data: {
      number: order.number,
      status: order.status,
      statusLabel: statusLabel(order.status),
      placedAt: order.placedAt.toISOString(),
      total: order.total,
      currency: order.currency,
      presentmentTotal: order.presentmentTotal,
      items: order.items,
      shipments: order.shipments.map((s) => ({
        carrierName: s.carrier?.name ?? s.carrierName,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        status: s.status,
        shippedAt: s.shippedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
      })),
      events: order.events.filter((e) => !e.type.startsWith("chargeback")).map((e) => ({ type: e.type, message: e.message, at: e.createdAt.toISOString() })),
    },
  };
}
