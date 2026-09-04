import "server-only";
import type { Coupon } from "@prisma/client";
import { db } from "@/lib/db";
import { applyBps } from "@/lib/money";
import { parseJsonArray, isString } from "@/lib/json";

export type CouponLine = { productId: string | null; sellerId: string | null; categoryId: string | null; subtotal: number };

export type CouponOutcome =
  | { ok: true; coupon: Coupon; discount: number; freeShipping: boolean; eligibleSubtotal: number }
  | { ok: false; message: string };

/**
 * Validates a coupon for a basket and returns the discount in base minor units.
 * Scope rules: order (everything), category / product / seller (matching lines only).
 */
export async function evaluateCoupon(code: string, ctx: { userId: string | null; lines: CouponLine[]; subtotal: number }): Promise<CouponOutcome> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.isActive) return { ok: false, message: "That code isn't valid." };
  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) return { ok: false, message: "That code isn't active yet." };
  if (coupon.endsAt && coupon.endsAt.getTime() < now) return { ok: false, message: "That code has expired." };
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return { ok: false, message: "That code has reached its usage limit." };
  if (coupon.perUserLimit !== null) {
    if (!ctx.userId) return { ok: false, message: "Sign in to use this code." };
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId: ctx.userId } });
    if (used >= coupon.perUserLimit) return { ok: false, message: "You've already used this code." };
  }
  if (coupon.eligibility === "new_customers") {
    if (!ctx.userId) return { ok: false, message: "Sign in to use this new-customer code." };
    const orders = await db.order.count({ where: { userId: ctx.userId, paymentStatus: { in: ["paid", "partially_refunded"] } } });
    if (orders > 0) return { ok: false, message: "This code is for first orders only." };
  }
  const scopeIds = parseJsonArray(coupon.scopeIdsJson, isString);
  const eligible = ctx.lines.filter((l) => {
    if (coupon.sellerId && l.sellerId !== coupon.sellerId) return false;
    if (coupon.scope === "product") return Boolean(l.productId && scopeIds.includes(l.productId));
    if (coupon.scope === "category") return Boolean(l.categoryId && scopeIds.includes(l.categoryId));
    if (coupon.scope === "seller") return Boolean(l.sellerId && scopeIds.includes(l.sellerId));
    return true;
  });
  const eligibleSubtotal = eligible.reduce((n, l) => n + l.subtotal, 0);
  if (eligibleSubtotal === 0) return { ok: false, message: "That code doesn't apply to anything in your cart." };
  if (coupon.minSubtotal !== null && ctx.subtotal < coupon.minSubtotal) return { ok: false, message: "Your order is below the minimum for this code." };

  let discount = 0;
  let freeShipping = false;
  if (coupon.type === "percent") discount = applyBps(eligibleSubtotal, coupon.value);
  else if (coupon.type === "fixed") discount = Math.min(coupon.value, eligibleSubtotal);
  else freeShipping = true;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  return { ok: true, coupon, discount, freeShipping, eligibleSubtotal };
}

/** Splits an order-level discount across lines proportionally to their subtotal (last line absorbs rounding). */
export function allocateDiscount(lines: { subtotal: number }[], discount: number): number[] {
  const total = lines.reduce((n, l) => n + l.subtotal, 0);
  if (total === 0 || discount === 0) return lines.map(() => 0);
  const out = lines.map((l) => Math.floor((discount * l.subtotal) / total));
  const diff = discount - out.reduce((n, v) => n + v, 0);
  if (out.length > 0) out[out.length - 1] += diff;
  return out;
}
