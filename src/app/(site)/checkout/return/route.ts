import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { confirmReturn } from "@/lib/commerce/checkout";
import { hasRecentOrderCookie, recentOrderCookie } from "@/lib/commerce/recent-order";
import { db } from "@/lib/db";
import { cancelOrder } from "@/lib/orders/lifecycle";
import { ensureInstanceSecrets } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * Buyers land here after Stripe / PayPal. The payment is verified with the
 * provider before anything is shown. A route handler rather than a page so the
 * confirmation cookie can be attached to the redirect response, and so a
 * cancel at the provider releases the reservation straight away.
 */
export async function GET(req: Request) {
  await ensureInstanceSecrets();
  const url = new URL(req.url);
  const order = (url.searchParams.get("order") ?? "").toUpperCase().slice(0, 40);
  const provider = (url.searchParams.get("provider") ?? "").slice(0, 32);
  if (!order || !provider) return NextResponse.redirect(new URL("/cart", req.url), 303);

  if (url.searchParams.get("cancelled") === "1") {
    const row = await db.order.findUnique({ where: { number: order }, select: { id: true, status: true, userId: true } });
    const user = await getCurrentUser();
    const owner = Boolean(row && ((user && row.userId === user.id) || (await hasRecentOrderCookie(order))));
    if (row && owner && row.status === "pending_payment") {
      await cancelOrder(row.id, `Payment cancelled at ${provider}`, { id: user?.id ?? null, type: user ? "buyer" : "system" }, { notify: false });
    }
    return NextResponse.redirect(new URL(`/checkout?cancelled=${encodeURIComponent(order)}`, req.url), 303);
  }

  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = await confirmReturn(order, provider, params);
  const res = NextResponse.redirect(new URL(`/checkout/complete?order=${encodeURIComponent(order)}&result=${result.status}`, req.url), 303);
  const cookie = recentOrderCookie(order);
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
