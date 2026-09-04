import "server-only";
import { db } from "@/lib/db";
import { enqueueJob, registerJobHandler } from "@/lib/jobs/queue";
import { deliverEmail, queueTemplateEmail } from "@/lib/mail";
import { refreshExchangeRates } from "@/lib/currency";
import { autoCompleteOrders, expireUnpaidOrders, recomputeSellerStats } from "@/lib/orders/lifecycle";
import { scheduleDuePayouts } from "@/lib/finance/payouts";
import { getSettings } from "@/lib/settings";

let registered = false;

/** Wires every job type to its implementation. Safe to call repeatedly. */
export function registerJobHandlers() {
  if (registered) return;
  registered = true;

  registerJobHandler("send_email", async (payload) => {
    const id = typeof payload.emailLogId === "string" ? payload.emailLogId : null;
    if (!id) throw new Error("send_email payload missing emailLogId");
    await deliverEmail(id);
  });

  registerJobHandler("fetch_exchange_rates", async () => {
    const settings = await getSettings();
    if (settings["system.exchangeRatesAuto"]) await refreshExchangeRates();
    await enqueueJob("fetch_exchange_rates", {}, { runAt: new Date(Date.now() + 6 * 3_600_000), dedupe: true });
  });

  registerJobHandler("expire_unpaid_orders", async () => {
    await expireUnpaidOrders();
    await enqueueJob("expire_unpaid_orders", {}, { runAt: new Date(Date.now() + 15 * 60_000), dedupe: true });
  });

  registerJobHandler("auto_complete_orders", async () => {
    await autoCompleteOrders();
    await enqueueJob("auto_complete_orders", {}, { runAt: new Date(Date.now() + 6 * 3_600_000), dedupe: true });
  });

  registerJobHandler("schedule_payouts", async () => {
    await scheduleDuePayouts();
    await enqueueJob("schedule_payouts", {}, { runAt: new Date(Date.now() + 24 * 3_600_000), dedupe: true });
  });

  registerJobHandler("cleanup_expired", async () => {
    const now = new Date();
    await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }, { revokedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } }] } });
    await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.loginChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.job.deleteMany({ where: { status: "done", completedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
    await enqueueJob("cleanup_expired", {}, { runAt: new Date(Date.now() + 12 * 3_600_000), dedupe: true });
  });

  registerJobHandler("recompute_seller_stats", async (payload) => {
    const sellerId = typeof payload.sellerId === "string" ? payload.sellerId : null;
    if (sellerId) await recomputeSellerStats(sellerId);
    else {
      const sellers = await db.sellerProfile.findMany({ select: { id: true } });
      for (const s of sellers) await recomputeSellerStats(s.id);
    }
  });

  registerJobHandler("broadcast_email", async (payload) => {
    const audience = typeof payload.audience === "string" ? payload.audience : "all";
    const subject = String(payload.subject ?? "");
    const message = String(payload.message ?? "");
    const cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
    const where = {
      status: "active",
      deletedAt: null,
      ...(audience === "sellers" ? { isSeller: true } : audience === "buyers" ? { isSeller: false, roleId: null } : audience === "admins" ? { roleId: { not: null } } : {}),
      ...(audience === "marketing" ? { marketingOptIn: true } : {}),
    };
    const batch = await db.user.findMany({ where, orderBy: { id: "asc" }, take: 200, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), select: { id: true, email: true, name: true } });
    for (const u of batch) await queueTemplateEmail("broadcast", u.email, { name: u.name, subject, message }, { userId: u.id, meta: { broadcast: true } });
    if (batch.length === 200) {
      await enqueueJob("broadcast_email", { ...payload, cursor: batch[batch.length - 1].id });
    }
  });

  registerJobHandler("retry_webhook", async (payload) => {
    const id = typeof payload.webhookEventId === "string" ? payload.webhookEventId : null;
    if (!id) return;
    const { reprocessWebhookEvent } = await import("@/lib/payments/webhooks");
    await reprocessWebhookEvent(id);
  });
}

/** Ensures the recurring maintenance jobs exist (called on server start and by the cron endpoint). */
export async function ensureRecurringJobs() {
  const settings = await getSettings();
  if (!settings["system.jobsEnabled"]) return;
  await enqueueJob("expire_unpaid_orders", {}, { dedupe: true });
  await enqueueJob("auto_complete_orders", {}, { dedupe: true });
  await enqueueJob("schedule_payouts", {}, { dedupe: true });
  await enqueueJob("cleanup_expired", {}, { dedupe: true });
  await enqueueJob("fetch_exchange_rates", {}, { dedupe: true });
}
