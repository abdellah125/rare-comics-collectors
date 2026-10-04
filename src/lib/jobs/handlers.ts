import "server-only";
import { db } from "@/lib/db";
import { enqueueJob, registerJobHandler } from "@/lib/jobs/queue";
import { deliverEmail, queueTemplateEmail } from "@/lib/mail";
import { refreshExchangeRates } from "@/lib/currency";
import { autoCompleteOrders, expireUnpaidOrders, recomputeSellerStats } from "@/lib/orders/lifecycle";
import { scheduleDuePayouts } from "@/lib/finance/payouts";
import { getSettings } from "@/lib/settings";
import { sweepRateLimitBuckets } from "@/lib/rate-limit";

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
    await db.job.deleteMany({ where: { status: "completed", completedAt: { lt: new Date(now.getTime() - 14 * 86_400_000) } } });
    await sweepRateLimitBuckets();
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

  // Search engines that speak IndexNow (Bing, Yandex, Seznam, Naver) hear about changed pages immediately.
  registerJobHandler("indexnow_ping", async (payload) => {
    const { submitIndexNow } = await import("@/lib/indexnow");
    const paths = Array.isArray(payload.paths) ? payload.paths.filter((p): p is string => typeof p === "string") : [];
    const result = await submitIndexNow(paths);
    if (!result.ok) throw new Error(`IndexNow responded ${result.status}`);
  });

  // Weekly: the first run submits every sitemap URL, later runs only what changed since the previous one.
  registerJobHandler("indexnow_sync", async (payload) => {
    const { submitIndexNow, sitemapPaths } = await import("@/lib/indexnow");
    const since = typeof payload.since === "string" ? new Date(payload.since) : null;
    const result = await submitIndexNow(await sitemapPaths(since));
    await enqueueJob("indexnow_sync", { since: new Date().toISOString() }, { runAt: new Date(Date.now() + 7 * 24 * 3_600_000), dedupe: true });
    if (!result.ok) throw new Error(`IndexNow responded ${result.status}`);
  });

  // Legacy scheduled publishing. With catalog.autoRelease off (the default) it publishes nothing:
  // imported products go live only through the review queue's Release button.
  registerJobHandler("catalog_release", async () => {
    const { releaseDueListings, nextReleaseRun } = await import("@/lib/catalog/release-queue");
    await releaseDueListings();
    await enqueueJob("catalog_release", {}, { runAt: nextReleaseRun(), dedupe: true });
  });

  // Every 30 minutes: book gateway payments that the return leg or a webhook missed (PayPal captures, Stripe intents).
  registerJobHandler("reconcile_payments", async () => {
    const { reconcileRecentPayments } = await import("@/lib/payments/reconcile");
    await reconcileRecentPayments();
    await enqueueJob("reconcile_payments", {}, { runAt: new Date(Date.now() + 30 * 60_000), dedupe: true });
  });

  // Weekly, free: Search Console positions (the rank snapshot), new catalogue candidates, and a full re-analysis.
  // Two short phases so each fits in one serverless invocation: collect, then analyse.
  registerJobHandler("seo_sync", async (payload) => {
    const settings = await getSettings();
    const { stepAnalyse, stepCandidates, stepSearchConsole } = await import("@/lib/seo/pipeline");
    if (payload.phase === "analyse") {
      await stepAnalyse();
      await enqueueJob("seo_sync", {}, { runAt: new Date(Date.now() + 7 * 24 * 3_600_000), dedupe: true });
      return;
    }
    if (!settings["seo.autoSync"]) {
      await enqueueJob("seo_sync", {}, { runAt: new Date(Date.now() + 7 * 24 * 3_600_000), dedupe: true });
      return;
    }
    const { openSeoConfigured } = await import("@/lib/seo/openseo");
    await stepCandidates(null, { rebuild: false });
    if (openSeoConfigured()) await stepSearchConsole(null, { rebuild: false });
    await enqueueJob("seo_sync", { phase: "analyse" });
  });

  // One chunk of the site audit crawl; it re-queues itself until every page is in.
  registerJobHandler("seo_audit", async (payload) => {
    const { auditChunk } = await import("@/lib/seo/site-audit");
    await auditChunk(typeof payload.offset === "number" ? payload.offset : 0);
  });

  // Approved imports: store the photo and check the facts, a batch at a time, until none are left.
  registerJobHandler("import_prepare", async () => {
    const { prepareItems } = await import("@/lib/imports/pipeline");
    const result = await prepareItems({ limit: 20 });
    const left = await db.importItem.count({ where: { status: "approved" } });
    if (left > 0 && result.ready + result.errors + result.waiting > 0) await enqueueJob("import_prepare", {}, { runAt: new Date(Date.now() + (result.ready + result.errors > 0 ? 2_000 : 5 * 60_000)), maxAttempts: 3 });
  });

  // The page-by-page catalogue import: one page per run, then the wait the source asks for.
  registerJobHandler("import_crawl", async () => {
    const { advanceCrawl } = await import("@/lib/imports/crawl");
    const { IMPORT_SOURCE } = await import("@/lib/imports/status");
    const crawl = await advanceCrawl(IMPORT_SOURCE);
    if (crawl && crawl.status === "running") await enqueueJob("import_crawl", {}, { runAt: new Date(Math.max(Date.now() + 2_000, crawl.notBefore.getTime())), dedupe: true, maxAttempts: 3 });
  });

  // Re-checks items in Error against the current rules, a batch at a time, until every one has been looked at once.
  registerJobHandler("import_fix", async (payload) => {
    const { reprocessErrors } = await import("@/lib/imports/pipeline");
    const { IMPORT_SOURCE } = await import("@/lib/imports/status");
    // Second phase: details still Unknown are looked up from reference knowledge, a small batch at a time.
    if (payload.phase === "knowledge") {
      const { enrichUnknown } = await import("@/lib/imports/pipeline");
      const done = await enrichUnknown(IMPORT_SOURCE, 25);
      if (done.asked > 0 && done.remaining > 0) await enqueueJob("import_fix", { phase: "knowledge" }, { runAt: new Date(Date.now() + 3_000), maxAttempts: 3 });
      return;
    }
    const result = await reprocessErrors(IMPORT_SOURCE, { cursor: typeof payload.cursor === "string" ? payload.cursor : null, limit: 300 });
    if (result.nextCursor) await enqueueJob("import_fix", { cursor: result.nextCursor }, { runAt: new Date(Date.now() + 2_000), maxAttempts: 3 });
    else await enqueueJob("import_fix", { phase: "knowledge" }, { runAt: new Date(Date.now() + 2_000), maxAttempts: 3 });
  });

  // SEO recommendations for queue items the seed created without one.
  registerJobHandler("import_seo", async () => {
    const { analyseSeoPending } = await import("@/lib/imports/pipeline");
    const { remaining } = await analyseSeoPending(400);
    if (remaining > 0) await enqueueJob("import_seo", {}, { runAt: new Date(Date.now() + 2_000), maxAttempts: 3 });
  });

  // Periodic sync with the authorised feed, when one is configured. New products only ever enter
  // the review queue; a refusal by the source ends the run and is not worked around.
  registerJobHandler("import_sync", async () => {
    const settings = await getSettings();
    const hours = Math.max(1, settings["imports.syncHours"]);
    const next = () => enqueueJob("import_sync", {}, { runAt: new Date(Date.now() + hours * 3_600_000), dedupe: true });
    const feedUrl = settings["imports.feedUrl"].trim();
    if (!feedUrl) {
      await next();
      return;
    }
    const { fetchFeed, FeedAccessError } = await import("@/lib/imports/feed");
    const { runImport } = await import("@/lib/imports/pipeline");
    const { IMPORT_SOURCE } = await import("@/lib/imports/status");
    try {
      const feed = await fetchFeed(feedUrl);
      await runImport({ source: IMPORT_SOURCE, kind: "feed", fileName: feed.fileName, text: feed.text, snapshot: settings["imports.feedIsComplete"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.importRun.create({ data: { source: IMPORT_SOURCE, kind: "feed", fileName: feedUrl.slice(0, 200), status: "failed", message, logJson: JSON.stringify([{ level: "error", text: message }]), finishedAt: new Date() } });
      // Only a temporary failure is worth the queue's own retries.
      if (err instanceof FeedAccessError && !err.permanent) {
        await next();
        throw err;
      }
    }
    await next();
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
  await enqueueJob("indexnow_sync", {}, { dedupe: true });
  await enqueueJob("catalog_release", {}, { dedupe: true });
  await enqueueJob("reconcile_payments", {}, { dedupe: true });
  await enqueueJob("seo_sync", {}, { dedupe: true });
  await enqueueJob("import_sync", {}, { dedupe: true });
}
