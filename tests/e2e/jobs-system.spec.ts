import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/** Admin › Jobs & system: recurring-job health, stuck jobs and failure housekeeping. */
const db = new PrismaClient();
const stamp = Date.now().toString(36);
let stuckId = "";
let resolvedId = "";

test.beforeAll(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  const old = new Date(Date.now() - 2 * 3_600_000);
  // A job whose function was cut off: still "running", lock long expired. Its type has no handler effect worth worrying about.
  stuckId = (await db.job.create({ data: { type: "recompute_seller_stats", payloadJson: JSON.stringify({ sellerId: `e2e-none-${stamp}` }), status: "running", lockedAt: old, attempts: 1, maxAttempts: 5, runAt: new Date(Date.now() + 3_600_000) } })).id;
  // (runAt in the future keeps the local in-process worker from reclaiming it before the test looks at it)
  // A failure followed by a later success of the same type: resolved.
  resolvedId = (await db.job.create({ data: { type: "indexnow_ping", payloadJson: JSON.stringify({ paths: [`/e2e-${stamp}`] }), status: "failed", attempts: 3, maxAttempts: 3, runAt: new Date(Date.now() - 3 * 86_400_000), lastError: `e2e failure ${stamp}` } })).id;
  await db.job.create({ data: { type: "indexnow_ping", payloadJson: "{}", status: "completed", completedAt: new Date(), runAt: new Date() } });
});

test.afterAll(async () => {
  await db.job.deleteMany({ where: { OR: [{ id: { in: [stuckId, resolvedId] } }, { payloadJson: { contains: stamp } }] } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  await db.$disconnect();
});

test("jobs & system shows recurring-job health, releases stuck jobs and clears resolved failures", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAdmin(page, E2E.superAdmin);
  await page.goto("/admin/system");
  await expectHealthy(page);
  await expect(page.locator("h1")).toHaveText("Jobs & system");
  // Every recurring job is listed with its schedule.
  const health = page.getByTestId("recurring-health");
  for (const t of ["expire_unpaid_orders", "crypto_check", "content_tick", "content_backlog", "seo_sync", "import_sync", "indexnow_sync", "cleanup_expired"]) await expect(health).toContainText(t);
  await expect(health).toContainText(/every 15 min/);
  // The type filter offers every registered job type.
  await expect(page.locator('select[name="type"] option[value="content_tick"]')).toHaveCount(1);
  await expect(page.locator('select[name="type"] option[value="import_auto_release"]')).toHaveCount(1);

  // The stuck job is flagged and can be released.
  await page.goto("/admin/system?status=stuck");
  const stuck = page.getByRole("table").first().locator("tr", { hasText: "recompute_seller_stats" }).first();
  await expect(stuck).toContainText("stuck");
  await stuck.getByRole("button", { name: "Release" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: stuckId } })).lockedAt).toBeNull();

  // A failure that a later success superseded is cleared; nothing else is.
  await page.goto("/admin/system?status=failed");
  await expect(page.getByRole("table").first()).toContainText(`e2e failure ${stamp}`);
  await page.getByRole("button", { name: "Clear resolved failures" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText(/later successful run/);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(async () => db.job.findUnique({ where: { id: resolvedId } }), { timeout: 30_000 }).toBeNull();
  await expect(page.locator("main")).not.toContainText(`e2e failure ${stamp}`, { timeout: 30_000 });
});
