/**
 * Data-integrity checks that run the real domain code against the local database.
 *
 *   npx tsx --conditions=react-server tests/integration/lifecycle.ts
 *
 * Needs the main seed plus the e2e seed (product E2E-001 and the e2e-* accounts).
 * Every order it creates is removed again at the end.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = new PrismaClient();
  const { markOrderPaid, markOrderPaymentFailed, cancelOrder, expireUnpaidOrders } = await import("@/lib/orders/lifecycle");
  const { issueRefund, RefundError } = await import("@/lib/payments/payment-service");
  const { createPayoutForSeller } = await import("@/lib/finance/ledger");
  const { shippingOptionsFor } = await import("@/lib/commerce/pricing");
  const { saveSettings } = await import("@/lib/settings");

  const buyer = await db.user.findUniqueOrThrow({ where: { email: "e2e-buyer@example.com" } });
  const product = await db.product.findUniqueOrThrow({ where: { sku: "E2E-001" } });
  const sellerId = product.sellerId;
  if (!sellerId) throw new Error("E2E product has no seller");
  const stock0 = product.stock;
  const created: string[] = [];

  async function makeOrder(qty: number, extra: { couponId?: string; provider?: string } = {}) {
    const number = `RCC-IT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
    const total = product.price * qty;
    await db.product.update({ where: { id: product.id }, data: { stock: { decrement: qty } } });
    const order = await db.order.create({
      data: {
        number,
        userId: buyer.id,
        email: buyer.email,
        subtotal: total,
        total,
        presentmentTotal: total,
        countryCode: "US",
        couponId: extra.couponId ?? null,
        items: {
          create: [
            {
              productId: product.id,
              sellerId,
              kind: "comic",
              title: `${product.title} ${product.issue}`,
              slug: product.slug,
              sku: product.sku,
              unitPrice: product.price,
              qty,
              subtotal: total,
              commissionBps: 1000,
              commissionAmount: Math.round(total / 10),
              sellerNet: total - Math.round(total / 10),
            },
          ],
        },
        payments: { create: [{ provider: extra.provider ?? "test", method: "test", status: "pending", amount: total, currency: "USD", presentmentAmount: total, providerRef: `it_${number}` }] },
      },
      include: { items: true, payments: true },
    });
    created.push(order.id);
    return order;
  }
  const stockNow = async () => (await db.product.findUniqueOrThrow({ where: { id: product.id }, select: { stock: true } })).stock;

  // 1. Concurrent "paid" transitions credit the seller ledger exactly once.
  {
    const o = await makeOrder(1);
    await db.payment.update({ where: { id: o.payments[0].id }, data: { status: "succeeded" } });
    const outcomes = await Promise.all([1, 2, 3].map(() => markOrderPaid(o.id, { id: o.payments[0].id, provider: "test" })));
    const entries = await db.ledgerEntry.count({ where: { orderId: o.id } });
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    check("concurrent markOrderPaid credits the ledger once", entries === 2 && outcomes.filter(Boolean).length === 1, `entries=${entries} winners=${outcomes.filter(Boolean).length}`);
    check("order becomes paid", after.status === "paid" && after.paymentStatus === "paid", after.status);
  }

  // 2. A failed payment releases the reservation exactly once.
  {
    const before = await stockNow();
    const o = await makeOrder(2);
    check("reservation reduced stock", (await stockNow()) === before - 2, "");
    await markOrderPaymentFailed(o.id, "card declined");
    await markOrderPaymentFailed(o.id, "card declined again");
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    check("failed payment releases stock exactly once", (await stockNow()) === before, `stock=${await stockNow()} expected=${before}`);
    check("failed order status", after.status === "failed" && after.paymentStatus === "failed", `${after.status}/${after.paymentStatus}`);
  }

  // 3. Money arriving after cancellation is recorded without reselling released stock.
  {
    const before = await stockNow();
    const o = await makeOrder(1);
    await cancelOrder(o.id, "buyer changed mind", { id: buyer.id, type: "buyer" }, { notify: false });
    check("cancel releases stock", (await stockNow()) === before, "");
    const ok = await markOrderPaid(o.id, { id: o.payments[0].id, provider: "test" });
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    const events = await db.orderEvent.findMany({ where: { orderId: o.id }, select: { type: true } });
    check("late payment keeps the order cancelled", ok && after.status === "cancelled" && after.paymentStatus === "paid", `${after.status}/${after.paymentStatus}`);
    check("late payment is flagged for a refund", events.some((e) => e.type === "payment.late"), events.map((e) => e.type).join(","));
    check("late payment credits no seller ledger", (await db.ledgerEntry.count({ where: { orderId: o.id } })) === 0, "");
    check("stock stays released after the late payment", (await stockNow()) === before, "");
  }

  // 4. Cancelling an unpaid coupon order returns the coupon use.
  {
    const coupon = await db.coupon.upsert({ where: { code: "IT-COUPON" }, create: { code: "IT-COUPON", type: "fixed", value: 500, usesCount: 1 }, update: { usesCount: 1 } });
    const o = await makeOrder(1, { couponId: coupon.id });
    await db.couponRedemption.create({ data: { couponId: coupon.id, orderId: o.id, userId: buyer.id, amount: 500 } });
    await cancelOrder(o.id, "expired", { id: null, type: "job" }, { notify: false });
    const c = await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
    check("cancelled unpaid order releases the coupon use", c.usesCount === 0 && (await db.couponRedemption.count({ where: { orderId: o.id } })) === 0, `uses=${c.usesCount}`);
    await db.coupon.delete({ where: { id: coupon.id } });
  }

  // 5. Refunds can never exceed the payment, even when started at the same moment.
  {
    const o = await makeOrder(2);
    await db.payment.update({ where: { id: o.payments[0].id }, data: { status: "succeeded" } });
    await markOrderPaid(o.id, { id: o.payments[0].id, provider: "test" });
    const actor = { id: buyer.id, email: buyer.email, type: "admin" as const };
    const amount = Math.round(o.total * 0.6);
    const outcomes = await Promise.allSettled([1, 2, 3].map((i) => issueRefund({ orderId: o.id, amount, reason: "goodwill", actor, idempotencyKey: `it_${o.id}_${i}` })));
    const succeeded = outcomes.filter((r) => r.status === "fulfilled").length;
    const p = await db.payment.findUniqueOrThrow({ where: { id: o.payments[0].id } });
    check("concurrent refunds cannot exceed the payment", succeeded === 1 && p.refundedAmount === amount, `succeeded=${succeeded} refunded=${p.refundedAmount} of ${p.amount}`);
    const rejected = outcomes.find((r): r is PromiseRejectedResult => r.status === "rejected");
    check("an over-refund is a clear RefundError", Boolean(rejected && rejected.reason instanceof RefundError), rejected ? String(rejected.reason?.message) : "no rejection");
    await issueRefund({ orderId: o.id, amount: o.total - amount, reason: "goodwill", actor, idempotencyKey: `it_${o.id}_rest` });
    const p2 = await db.payment.findUniqueOrThrow({ where: { id: o.payments[0].id } });
    check("refunding the remainder closes the payment", p2.status === "refunded" && p2.refundedAmount === p2.amount, p2.status);
    const order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    check("fully refunded order status", order.status === "refunded" && order.paymentStatus === "refunded", `${order.status}/${order.paymentStatus}`);
    const ledger = await db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { orderId: o.id } });
    check("seller ledger nets to zero after a full refund", (ledger._sum.amount ?? 0) === 0, `net=${ledger._sum.amount}`);
  }

  // 6. Two payout sweeps for the same seller can't double-pay.
  {
    const o = await makeOrder(1);
    await db.payment.update({ where: { id: o.payments[0].id }, data: { status: "succeeded" } });
    await markOrderPaid(o.id, { id: o.payments[0].id, provider: "test" });
    await db.ledgerEntry.updateMany({ where: { sellerId, payoutId: null }, data: { availableAt: new Date(Date.now() - 1000) } });
    const open = await db.payout.findMany({ where: { sellerId, status: { in: ["pending", "scheduled", "processing"] } }, select: { id: true } });
    for (const p of open) {
      await db.ledgerEntry.deleteMany({ where: { payoutId: p.id, type: "payout" } });
      await db.ledgerEntry.updateMany({ where: { payoutId: p.id }, data: { payoutId: null } });
      await db.payout.delete({ where: { id: p.id } });
    }
    const available = (await db.ledgerEntry.aggregate({ _sum: { amount: true }, where: { sellerId, payoutId: null } }))._sum.amount ?? 0;
    const sweeps = await Promise.all([createPayoutForSeller(sellerId, {}), createPayoutForSeller(sellerId, {})]);
    const payouts = sweeps.filter((p): p is { id: string; amount: number } => Boolean(p));
    const sum = payouts.reduce((n, p) => n + p.amount, 0);
    check("concurrent payout sweeps create one payout for the balance", payouts.length === 1 && sum === available, `payouts=${payouts.length} sum=${sum} available=${available}`);
    for (const p of payouts) {
      await db.ledgerEntry.deleteMany({ where: { payoutId: p.id, type: "payout" } });
      await db.ledgerEntry.updateMany({ where: { payoutId: p.id }, data: { payoutId: null } });
      await db.payout.delete({ where: { id: p.id } });
    }
  }

  // 7. Card reservations expire after commerce.reservationMinutes; bank transfers keep the longer window.
  {
    const before = await stockNow();
    const card = await makeOrder(1);
    const wire = await makeOrder(1, { provider: "bank_transfer" });
    await db.order.updateMany({ where: { id: { in: [card.id, wire.id] } }, data: { placedAt: new Date(Date.now() - 2 * 3_600_000) } });
    await expireUnpaidOrders();
    const cardAfter = await db.order.findUniqueOrThrow({ where: { id: card.id } });
    const wireAfter = await db.order.findUniqueOrThrow({ where: { id: wire.id } });
    check("a stale card reservation expires and releases its stock", cardAfter.status === "cancelled", cardAfter.status);
    check("a bank transfer order keeps its longer payment window", wireAfter.status === "pending_payment", wireAfter.status);
    await cancelOrder(wire.id, "cleanup", { id: null, type: "system" }, { notify: false });
    check("stock restored after both cancellations", (await stockNow()) === before, "");
  }

  // 8. The marketplace-wide free-shipping threshold really applies at checkout.
  {
    const previous = (await db.setting.findUnique({ where: { key: "commerce.freeShippingThreshold" } }))?.value ?? null;
    await saveSettings({ "commerce.freeShippingThreshold": 1000 });
    const withThreshold = await shippingOptionsFor("US", 5000);
    const standard = withThreshold.find((o) => /standard/i.test(o.name));
    check("global threshold makes the cheapest paid method free", Boolean(standard) && standard?.price === 0, JSON.stringify(withThreshold.map((o) => [o.name, o.price])));
    await saveSettings({ "commerce.freeShippingThreshold": 0 });
    const without = await shippingOptionsFor("US", 5000);
    const standard2 = without.find((o) => /standard/i.test(o.name));
    check("without a global threshold the method's own rule applies", Boolean(standard2) && (standard2?.price ?? 0) > 0, JSON.stringify(without.map((o) => [o.name, o.price])));
    if (previous === null) await db.setting.deleteMany({ where: { key: "commerce.freeShippingThreshold" } });
    else await db.setting.update({ where: { key: "commerce.freeShippingThreshold" }, data: { value: previous } });
  }

  // Cleanup: remove everything this script created and restore the product.
  for (const id of created) {
    await db.ledgerEntry.deleteMany({ where: { orderId: id } });
    await db.refund.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.orderEvent.deleteMany({ where: { orderId: id } });
    await db.inventoryAdjustment.deleteMany({ where: { orderId: id } });
    await db.couponRedemption.deleteMany({ where: { orderId: id } });
    await db.orderItem.deleteMany({ where: { orderId: id } });
    await db.order.delete({ where: { id } }).catch(() => {});
  }
  await db.product.update({ where: { id: product.id }, data: { stock: stock0, soldCount: product.soldCount } });
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: "RCC-IT-" } }, { body: { contains: "RCC-IT-" } }] } });
  await db.emailLog.deleteMany({ where: { subject: { contains: "RCC-IT-" } } });
  await db.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
