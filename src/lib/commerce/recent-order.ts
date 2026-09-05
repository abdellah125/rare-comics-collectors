import "server-only";
import { cookies } from "next/headers";
import { signValue, verifySignedValue } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * A guest may view the confirmation page of an order they just placed. The
 * proof is a signed, order-specific cookie that only the checkout flow issues
 * (server action or the provider return handler) — never a callable action, so
 * nobody can mint one for someone else's order number.
 */
export const RECENT_ORDER_TTL_SECONDS = 48 * 3600;

export function recentOrderCookie(orderNumber: string) {
  return {
    name: `rcc_o_${orderNumber}`,
    value: signValue(orderNumber, RECENT_ORDER_TTL_SECONDS),
    options: { httpOnly: true, sameSite: "lax" as const, secure: env.isProd, path: "/", maxAge: RECENT_ORDER_TTL_SECONDS },
  };
}

/** Server actions and route handlers only (cookies cannot be written while a page renders). */
export async function rememberRecentOrder(orderNumber: string) {
  const c = recentOrderCookie(orderNumber);
  (await cookies()).set(c.name, c.value, c.options);
}

/** True when the request carries a valid cookie for this order. */
export async function hasRecentOrderCookie(orderNumber: string): Promise<boolean> {
  const value = (await cookies()).get(`rcc_o_${orderNumber}`)?.value ?? "";
  return verifySignedValue(value) === orderNumber;
}
