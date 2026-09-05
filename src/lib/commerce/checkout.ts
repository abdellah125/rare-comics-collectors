import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getPresentmentCurrency } from "@/lib/currency";
import { newOrderNumber } from "@/lib/ids";
import { parseJsonArray, isString } from "@/lib/json";
import { applyBps, convertFromBase, formatMoney } from "@/lib/money";
import { getSettings, commissionBpsFor } from "@/lib/settings";
import { services } from "@/lib/services";
import { AddressSchema, productShipsTo, shippingOptionsFor, taxFor, validateAddressForCountry, type Address, type ShippingOption } from "@/lib/commerce/pricing";
import { allocateDiscount, evaluateCoupon, type CouponLine } from "@/lib/commerce/coupons";
import { availableProviders, getProvider, type ProviderStatus } from "@/lib/payments/registry";
import { applyPaymentSuccess } from "@/lib/payments/payment-service";
import { addOrderEvent, cancelOrder } from "@/lib/orders/lifecycle";
import type { PaymentIntentResult } from "@/lib/payments/types";
import { queueTemplateEmail } from "@/lib/mail";
import { zId } from "@/lib/validation";

export const CartLineSchema = z.object({
  kind: z.enum(["comic", "service"]),
  slug: z.string().min(1).max(120),
  qty: z.coerce.number().int().min(1).max(25),
});
export type CartLineInput = z.infer<typeof CartLineSchema>;

export const QuoteSchema = z.object({
  lines: z.array(CartLineSchema).max(50),
  countryCode: z.string().length(2).optional(),
  region: z.string().max(80).optional(),
  shippingMethodId: z.string().max(64).optional(),
  couponCode: z.string().max(40).optional(),
  userId: z.string().optional(),
});

export type ResolvedLine = {
  id: string;
  kind: "comic" | "service";
  slug: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  productId: string | null;
  sellerId: string | null;
  categoryId: string | null;
  sku: string | null;
  unitPrice: number;
  qty: number;
  subtotal: number;
  available: number;
  problem: string | null;
};

export type Quote = {
  lines: ResolvedLine[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  couponMessage: string | null;
  shippingOptions: ShippingOption[];
  shipping: ShippingOption | null;
  shippingTotal: number;
  tax: { amount: number; label: string; rateBps: number };
  total: number;
  currency: { code: string; symbol: string; decimals: number; rateToBase: number; isBase: boolean };
  presentmentTotal: number;
  hasPhysical: boolean;
  providers: ProviderStatus[];
  warnings: string[];
};

/** Resolves cart lines against live catalog data — client prices are never trusted. */
export async function resolveLines(lines: CartLineInput[], countryCode?: string): Promise<ResolvedLine[]> {
  const comicSlugs = lines.filter((l) => l.kind === "comic").map((l) => l.slug);
  const products = comicSlugs.length
    ? await db.product.findMany({
        where: { slug: { in: comicSlugs }, deletedAt: null },
        include: { images: { orderBy: { position: "asc" }, take: 1 }, seller: { select: { id: true, status: true } } },
      })
    : [];
  const out: ResolvedLine[] = [];
  for (const line of lines) {
    if (line.kind === "service") {
      const svc = services.find((s) => s.slug === line.slug);
      if (!svc) continue;
      if (svc.price === null) {
        out.push({ id: `service:${svc.slug}`, kind: "service", slug: svc.slug, title: svc.name, subtitle: svc.priceNote, imageUrl: null, productId: null, sellerId: null, categoryId: null, sku: null, unitPrice: 0, qty: line.qty, subtotal: 0, available: 0, problem: "This service is quoted individually — contact us to book it." });
        continue;
      }
      out.push({ id: `service:${svc.slug}`, kind: "service", slug: svc.slug, title: svc.name, subtitle: svc.priceNote, imageUrl: null, productId: null, sellerId: null, categoryId: null, sku: null, unitPrice: svc.price, qty: line.qty, subtotal: svc.price * line.qty, available: 25, problem: null });
      continue;
    }
    const p = products.find((x) => x.slug === line.slug);
    if (!p) {
      out.push({ id: `comic:${line.slug}`, kind: "comic", slug: line.slug, title: line.slug, subtitle: "", imageUrl: null, productId: null, sellerId: null, categoryId: null, sku: null, unitPrice: 0, qty: line.qty, subtotal: 0, available: 0, problem: "This listing is no longer available." });
      continue;
    }
    let problem: string | null = null;
    if (p.status !== "published" || (p.seller && p.seller.status !== "approved")) problem = "This listing is no longer available.";
    else if (p.stock <= 0) problem = "Sold out.";
    else if (line.qty > p.stock) problem = `Only ${p.stock} available.`;
    else if (countryCode && !productShipsTo({ restrictedCountries: parseJsonArray(p.restrictedCountriesJson, isString), allowedCountries: parseJsonArray(p.allowedCountriesJson, isString) }, countryCode)) problem = "The seller doesn't ship this item to your country.";
    const qty = Math.min(line.qty, Math.max(p.stock, 0)) || line.qty;
    out.push({
      id: `comic:${p.slug}`,
      kind: "comic",
      slug: p.slug,
      title: `${p.title} ${p.issue}`,
      subtitle: `${p.grader === "Raw" ? "Raw" : `${p.grader} ${p.grade}`} · ${p.publisher} · ${p.year}`,
      imageUrl: p.images[0]?.url ?? null,
      productId: p.id,
      sellerId: p.sellerId,
      categoryId: p.categoryId,
      sku: p.sku,
      unitPrice: p.price,
      qty,
      subtotal: p.price * qty,
      available: p.stock,
      problem,
    });
  }
  return out;
}

export async function quoteCheckout(input: z.infer<typeof QuoteSchema>): Promise<Quote> {
  const settings = await getSettings();
  const currency = await getPresentmentCurrency();
  const countryCode = input.countryCode?.toUpperCase() ?? settings["marketplace.defaultCountry"];
  const lines = await resolveLines(input.lines, countryCode);
  const warnings = lines.filter((l) => l.problem).map((l) => `${l.title}: ${l.problem}`);
  const good = lines.filter((l) => !l.problem);
  const subtotal = good.reduce((n, l) => n + l.subtotal, 0);
  const hasPhysical = good.some((l) => l.kind === "comic");

  let discount = 0;
  let couponMessage: string | null = null;
  let couponCode: string | null = null;
  let freeShipping = false;
  if (input.couponCode && settings["features.coupons"]) {
    const couponLines: CouponLine[] = good.map((l) => ({ productId: l.productId, sellerId: l.sellerId, categoryId: l.categoryId, subtotal: l.subtotal }));
    const res = await evaluateCoupon(input.couponCode, { userId: input.userId ?? null, lines: couponLines, subtotal });
    if (res.ok) {
      discount = res.discount;
      freeShipping = res.freeShipping;
      couponCode = res.coupon.code;
      couponMessage = res.freeShipping ? "Free shipping applied." : `${res.coupon.code} applied — ${formatMoney(res.discount)} off.`;
    } else couponMessage = res.message;
  }

  const shippingOptions = hasPhysical ? await shippingOptionsFor(countryCode, subtotal - discount) : [];
  const shipping = hasPhysical ? (shippingOptions.find((o) => o.id === input.shippingMethodId) ?? shippingOptions[0] ?? null) : null;
  if (hasPhysical && shippingOptions.length === 0) warnings.push("We can't ship to the selected country yet.");
  const shippingTotal = shipping ? (freeShipping ? 0 : shipping.price) : 0;
  const tax = await taxFor({ countryCode, region: input.region ?? null }, Math.max(0, subtotal - discount), shippingTotal);
  const total = Math.max(0, subtotal - discount) + shippingTotal + (tax.inclusive ? 0 : tax.amount);
  const presentmentTotal = currency.isBase ? total : convertFromBase(total, currency);
  const providers = await availableProviders({ currency: currency.code, countryCode, amountMinor: presentmentTotal });

  return {
    lines,
    subtotal,
    discount,
    couponCode,
    couponMessage,
    shippingOptions,
    shipping,
    shippingTotal,
    tax: { amount: tax.amount, label: tax.label, rateBps: tax.rateBps },
    total,
    currency: { code: currency.code, symbol: currency.symbol, decimals: currency.decimals, rateToBase: currency.rateToBase, isBase: currency.isBase },
    presentmentTotal,
    hasPhysical,
    providers,
    warnings,
  };
}

export const PlaceOrderSchema = z.object({
  lines: z.array(CartLineSchema).min(1).max(50),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().max(40).optional(),
  shippingAddress: AddressSchema,
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: AddressSchema.optional(),
  shippingMethodId: z.string().max(64).optional(),
  providerId: z.string().min(1).max(32),
  couponCode: z.string().max(40).optional(),
  customerNote: z.string().trim().max(1000).optional(),
  idempotencyKey: zId,
  simulate: z.string().max(20).optional(),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderSchema>;

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; payment: PaymentIntentResult; providerId: string }
  | { ok: false; message: string; field?: string };

export class CheckoutError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

function computeRisk(input: { total: number; isGuest: boolean; firstOrder: boolean; shippingCountry: string; billingCountry: string; recentFailures: number }): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  if (input.total >= 500_000 && input.firstOrder) {
    score += 30;
    flags.push("high_value_first_order");
  }
  if (input.shippingCountry !== input.billingCountry) {
    score += 20;
    flags.push("billing_shipping_country_mismatch");
  }
  if (input.isGuest && input.total >= 250_000) {
    score += 15;
    flags.push("guest_high_value");
  }
  if (input.recentFailures >= 3) {
    score += 40;
    flags.push("repeated_payment_failures");
  }
  return { score: Math.min(100, score), flags };
}

/**
 * Creates the order, reserves stock and starts the payment. Idempotent on
 * `idempotencyKey`: a retry (double click, network retry) returns the first
 * result instead of creating a second order.
 */
export async function placeOrder(
  input: PlaceOrderInput,
  ctx: { userId: string | null; userRestrictions: string[]; ip: string | null; userAgent: string | null },
): Promise<PlaceOrderResult> {
  const settings = await getSettings();
  const key = `checkout:${input.idempotencyKey}`;
  const existing = await db.idempotencyKey.findUnique({ where: { key } });
  if (existing) {
    if (existing.status === "done" && existing.responseJson) return JSON.parse(existing.responseJson) as PlaceOrderResult;
    return { ok: false, message: "This order is already being processed. Please wait a moment." };
  }
  try {
    await db.idempotencyKey.create({ data: { key, scope: "checkout", userId: ctx.userId, expiresAt: new Date(Date.now() + 24 * 3_600_000) } });
  } catch {
    // Two identical submissions raced; the other one owns the key.
    return { ok: false, message: "This order is already being processed. Please wait a moment." };
  }

  const done = async (result: PlaceOrderResult) => {
    await db.idempotencyKey.update({ where: { key }, data: { status: "done", responseJson: JSON.stringify(result) } }).catch(() => {});
    return result;
  };
  const fail = async (message: string, field?: string) => {
    await db.idempotencyKey.delete({ where: { key } }).catch(() => {});
    return { ok: false as const, message, field };
  };

  try {
    if (ctx.userRestrictions.includes("no_purchase")) return fail("Purchasing is restricted on this account. Contact support.");
    if (!ctx.userId && !settings["commerce.guestCheckout"]) return fail("Please sign in to check out.");
    const addressCheck = await validateAddressForCountry(input.shippingAddress);
    if (!addressCheck.ok) return fail(addressCheck.message, addressCheck.field ? `shippingAddress.${addressCheck.field}` : undefined);
    const billing = input.billingSameAsShipping || !input.billingAddress ? input.shippingAddress : input.billingAddress;

    const quote = await quoteCheckout({
      lines: input.lines,
      countryCode: input.shippingAddress.countryCode,
      region: input.shippingAddress.region,
      shippingMethodId: input.shippingMethodId,
      couponCode: input.couponCode,
      userId: ctx.userId ?? undefined,
    });
    if (quote.warnings.length > 0) return fail(quote.warnings[0]);
    const good = quote.lines.filter((l) => !l.problem);
    if (good.length === 0) return fail("Your cart is empty.");
    if (good.reduce((n, l) => n + l.qty, 0) > settings["commerce.maxOrderItems"]) return fail(`Orders are limited to ${settings["commerce.maxOrderItems"]} items.`);
    if (settings["commerce.maxOrderValue"] > 0 && quote.total > settings["commerce.maxOrderValue"]) return fail("This order exceeds the maximum online order value. Contact us to arrange it.");
    if (quote.hasPhysical && !quote.shipping) return fail("Choose a shipping method.", "shippingMethodId");
    const providerStatus = quote.providers.find((p) => p.id === input.providerId);
    const provider = providerStatus ? getProvider(input.providerId) : null;
    if (!provider) return fail("That payment method isn't available for this order.", "providerId");
    if (input.couponCode && !quote.couponCode) return fail(quote.couponMessage ?? "That coupon isn't valid.", "couponCode");

    const [priorOrders, recentFailures] = await Promise.all([
      ctx.userId ? db.order.count({ where: { userId: ctx.userId, paymentStatus: "paid" } }) : db.order.count({ where: { email: input.email, paymentStatus: "paid" } }),
      ctx.ip ? db.payment.count({ where: { status: "failed", createdAt: { gte: new Date(Date.now() - 86_400_000) }, order: { ipAddress: ctx.ip } } }) : 0,
    ]);
    const risk = computeRisk({ total: quote.total, isGuest: !ctx.userId, firstOrder: priorOrders === 0, shippingCountry: input.shippingAddress.countryCode, billingCountry: billing.countryCode, recentFailures });

    const discounts = allocateDiscount(good, quote.discount);
    const number = await newOrderNumber();

    const order = await db.$transaction(async (tx) => {
      // Reserve stock atomically: the conditional update fails if someone bought it first.
      for (const line of good) {
        if (!line.productId) continue;
        const r = await tx.product.updateMany({ where: { id: line.productId, stock: { gte: line.qty }, status: "published" }, data: { stock: { decrement: line.qty } } });
        if (r.count === 0) throw new CheckoutError(`${line.title} just sold out.`);
      }
      const created = await tx.order.create({
        data: {
          number,
          userId: ctx.userId,
          email: input.email,
          phone: input.phone ?? null,
          currency: quote.currency.code,
          exchangeRate: quote.currency.rateToBase,
          subtotal: quote.subtotal,
          discountTotal: quote.discount,
          shippingTotal: quote.shippingTotal,
          taxTotal: quote.tax.amount,
          total: quote.total,
          presentmentTotal: quote.presentmentTotal,
          shippingAddressJson: JSON.stringify(input.shippingAddress),
          billingAddressJson: JSON.stringify(billing),
          shippingMethodName: quote.shipping?.name ?? null,
          shippingMethodId: quote.shipping?.id ?? null,
          couponCode: quote.couponCode,
          customerNote: input.customerNote ?? null,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          countryCode: input.shippingAddress.countryCode,
          riskScore: risk.score,
          riskFlagsJson: JSON.stringify(risk.flags),
          idempotencyKey: input.idempotencyKey,
        },
      });
      const sellerBps = new Map<string, number>();
      for (let i = 0; i < good.length; i++) {
        const line = good[i];
        let commissionBps = 0;
        if (line.sellerId) {
          if (!sellerBps.has(line.sellerId)) {
            const seller = await tx.sellerProfile.findUnique({ where: { id: line.sellerId }, select: { commissionBps: true } });
            sellerBps.set(line.sellerId, await commissionBpsFor(seller?.commissionBps));
          }
          commissionBps = sellerBps.get(line.sellerId)!;
        }
        const net = line.subtotal - discounts[i];
        const commissionAmount = applyBps(net, commissionBps);
        const taxShare = quote.subtotal > 0 ? Math.round((quote.tax.amount * line.subtotal) / quote.subtotal) : 0;
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: line.productId,
            sellerId: line.sellerId,
            kind: line.kind,
            title: line.title,
            subtitle: line.subtitle,
            sku: line.sku,
            slug: line.slug,
            imageUrl: line.imageUrl,
            unitPrice: line.unitPrice,
            qty: line.qty,
            subtotal: line.subtotal,
            discountAmount: discounts[i],
            taxAmount: taxShare,
            commissionBps,
            commissionAmount,
            sellerNet: net - commissionAmount,
          },
        });
        if (line.productId) await tx.inventoryAdjustment.create({ data: { productId: line.productId, delta: -line.qty, reason: "reservation", orderId: created.id, actorId: ctx.userId } });
      }
      if (quote.couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: quote.couponCode } });
        if (coupon) {
          await tx.coupon.update({ where: { id: coupon.id }, data: { usesCount: { increment: 1 } } });
          await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: created.id, userId: ctx.userId, amount: quote.discount } });
          await tx.order.update({ where: { id: created.id }, data: { couponId: coupon.id } });
        }
      }
      await tx.orderEvent.create({ data: { orderId: created.id, type: "order.placed", message: `Order placed (${provider.displayName})`, actorType: ctx.userId ? "buyer" : "system", actorId: ctx.userId } });
      return created;
    });

    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        provider: provider.id,
        method: provider.method,
        status: "pending",
        amount: quote.total,
        currency: quote.currency.code,
        presentmentAmount: quote.presentmentTotal,
        idempotencyKey: `pay_${input.idempotencyKey}`,
      },
    });

    let intent: PaymentIntentResult;
    try {
      intent = await provider.createPayment({
        orderId: order.id,
        orderNumber: order.number,
        amountMinor: quote.presentmentTotal,
        currency: quote.currency.code,
        email: input.email,
        description: `${settings["marketplace.name"]} order ${order.number}`,
        returnUrl: `${env.siteUrl}/checkout/return?order=${order.number}&provider=${provider.id}`,
        cancelUrl: `${env.siteUrl}/checkout/return?order=${order.number}&provider=${provider.id}&cancelled=1`,
        metadata: { simulate: input.simulate ?? "" },
        idempotencyKey: `pay_${input.idempotencyKey}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      intent = { kind: "failed", providerRef: null, message };
    }

    await db.payment.update({
      where: { id: payment.id },
      data: {
        providerRef: intent.providerRef,
        status: intent.kind === "succeeded" ? "succeeded" : intent.kind === "failed" ? "failed" : intent.kind === "client_confirm" ? "requires_action" : "pending",
        failureMessage: intent.kind === "failed" ? intent.message : null,
      },
    });

    if (intent.kind === "failed") {
      await addOrderEvent(db, order.id, "payment.failed", `Payment could not be started: ${intent.message}`);
      await cancelOrder(order.id, "Payment failed", { id: null, type: "system" }, { notify: false });
      return done({ ok: false, message: `Payment failed: ${intent.message}` });
    }
    if (intent.kind === "succeeded") {
      await applyPaymentSuccess(payment.id, intent.details, { id: ctx.userId, type: ctx.userId ? "buyer" : "system" });
    }
    if (intent.kind === "instructions") {
      await addOrderEvent(db, order.id, "payment.awaiting", `Awaiting ${provider.displayName}`);
      await queueTemplateEmail("order_awaiting_payment", input.email, {
        name: input.shippingAddress.firstName,
        orderNumber: order.number,
        total: formatMoney(quote.total),
        instructions: intent.instructions,
        hours: settings["commerce.autoCancelUnpaidHours"],
      }, { userId: ctx.userId });
    }
    await audit({ actor: ctx.userId ? { id: ctx.userId, email: input.email, type: "user" } : "system", action: "order.placed", targetType: "order", targetId: order.id, summary: `Order ${order.number} placed for ${formatMoney(quote.total)} via ${provider.id}` });
    return done({ ok: true, orderId: order.id, orderNumber: order.number, payment: intent, providerId: provider.id });
  } catch (err) {
    if (err instanceof CheckoutError) return fail(err.message, err.field);
    await db.idempotencyKey.delete({ where: { key } }).catch(() => {});
    throw err;
  }
}

/** Buyer returned from a redirect/client flow: verify with the provider and settle the order. */
export async function confirmReturn(orderNumber: string, providerId: string, params: Record<string, string>): Promise<{ status: "succeeded" | "pending" | "failed"; message?: string }> {
  const order = await db.order.findUnique({ where: { number: orderNumber }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const payment = order?.payments[0];
  if (!order || !payment || payment.provider !== providerId) return { status: "failed", message: "Order not found" };
  if (payment.status === "succeeded") return { status: "succeeded" };
  const provider = getProvider(providerId);
  if (!provider?.confirmPayment || !payment.providerRef) return { status: "pending" };
  const result = await provider.confirmPayment(payment.providerRef, params);
  if (result.status === "succeeded") {
    await applyPaymentSuccess(payment.id, result.details, { id: order.userId, type: order.userId ? "buyer" : "system" });
    return { status: "succeeded" };
  }
  if (result.status === "failed") {
    await db.payment.update({ where: { id: payment.id }, data: { status: "failed", failureMessage: result.message } });
    await addOrderEvent(db, order.id, "payment.failed", `Payment failed: ${result.message}`);
    await cancelOrder(order.id, `Payment failed: ${result.message}`, { id: null, type: "system" }, { notify: false });
    return { status: "failed", message: result.message };
  }
  return { status: "pending" };
}

export type { Address };
