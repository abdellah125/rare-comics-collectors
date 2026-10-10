import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/** Admin › Jobs & system: counts, recurring-job health, abandoned-job recovery, retry with history, job details, runner auth. */
const db = new PrismaClient();
const stamp = Date.now().toString(36);
let abandonedId = "";
let failedId = "";

test.beforeAll(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  const old = new Date(Date.now() - 2 * 3_600_000);
  // A job whose worker is gone: still "running", lease long expired. Its type has no effect worth worrying about.
  abandonedId = (await db.job.create({ data: { type: "recompute_seller_stats", payloadJson: JSON.stringify({ sellerId: `e2e-none-${stamp}` }), status: "running", lockedAt: old, startedAt: old, heartbeatAt: old, leaseUntil: new Date(old.getTime() + 90_000), lockedBy: "e2e-dead-worker", attempts: 1, maxAttempts: 5, runAt: new Date(Date.now() + 3_600_000) } })).id;
  // A failed job whose payload holds things the dashboard must not show in full.
  failedId = (await db.job.create({ data: { type: "indexnow_ping", payloadJson: JSON.stringify({ paths: [`/e2e-${stamp}`], contact: "someone@example.com", apiToken: `tok-${stamp}` }), status: "failed", attempts: 3, maxAttempts: 3, runAt: new Date(Date.now() + 3_600_000), lastError: `e2e failure ${stamp}`, lastErrorAt: new Date() } })).id;
  await db.jobAttempt.create({ data: { jobId: failedId, type: "indexnow_ping", attempt: 3, worker: "e2e", outcome: "failed", errorKind: "transient", error: `e2e failure ${stamp}`, finishedAt: new Date(), durationMs: 1200 } });
});

test.afterAll(async () => {
  await db.jobAttempt.deleteMany({ where: { jobId: { in: [abandonedId, failedId] } } });
  await db.job.deleteMany({ where: { OR: [{ id: { in: [abandonedId, failedId] } }, { payloadJson: { contains: stamp } }] } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  await db.$disconnect();
});

test("the job runner refuses calls without the secret", async ({ request }) => {
  expect((await request.get("/api/jobs/run")).status()).toBe(401);
  expect((await request.post("/api/jobs/run", { headers: { authorization: "Bearer wrong-secret" } })).status()).toBe(401);
  const body = await (await request.get("/api/jobs/run", { headers: { authorization: "Bearer " } })).text();
  expect(body).not.toMatch(/secret|stack/i);
});

test("jobs & system shows counts and health, recovers abandoned jobs, retries with history and redacts payloads", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAdmin(page, E2E.superAdmin);
  await page.goto("/admin/system");
  await expectHealthy(page);
  await expect(page.locator("h1")).toHaveText("Jobs & system");
  const counts = page.getByTestId("job-counts");
  for (const label of ["Pending", "Due now", "Retrying", "Running", "Abandoned", "Failed", "Completed", "Cancelled"]) await expect(counts).toContainText(label);
  const health = page.getByTestId("recurring-health");
  for (const t of ["expire_unpaid_orders", "crypto_check", "content_tick", "indexnow_sync", "cleanup_expired"]) await expect(health).toContainText(t);
  await expect(health).toContainText(/every 15 min/);
  await expect(page.getByRole("button", { name: "Clear resolved failures" })).toHaveCount(0); // history is not deleted
  await expect(page.getByTestId("failed-breakdown")).toContainText("kept as history");

  // The abandoned job is recovered: either by the local worker's own drain or from the dashboard.
  await page.goto("/admin/system?status=abandoned");
  const row = page.getByRole("table").first().locator("tr", { hasText: "recompute_seller_stats" }).first();
  if (await row.isVisible().catch(() => false)) {
    await expect(row).toContainText("abandoned");
    await row.getByRole("button", { name: "Retry" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Confirm", exact: true }).click();
  }
  await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: abandonedId } })).lastError ?? "", { timeout: 60_000 }).toContain("stopped reporting");
  const recovered = await db.job.findUniqueOrThrow({ where: { id: abandonedId } });
  expect(recovered.lockedBy).not.toBe("e2e-dead-worker");
  expect(await db.jobAttempt.count({ where: { jobId: abandonedId, outcome: "abandoned" } })).toBe(1);

  // Job details: state, attempt history, payload with secrets and email masked.
  await page.goto(`/admin/system/jobs/${failedId}`);
  await expectHealthy(page);
  await expect(page.locator("main")).toContainText(`e2e failure ${stamp}`);
  await expect(page.getByTestId("job-attempts")).toContainText("failed");
  const payload = page.getByTestId("job-payload");
  await expect(payload).toContainText(`/e2e-${stamp}`);
  await expect(payload).toContainText("[redacted]");
  await expect(payload).not.toContainText(`tok-${stamp}`);
  await expect(payload).not.toContainText("someone@example.com");

  // Retry keeps the failure history.
  await page.getByRole("button", { name: "Retry" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(async () => (await db.job.findUniqueOrThrow({ where: { id: failedId } })).status, { timeout: 30_000 }).not.toBe("failed");
  const retried = await db.job.findUniqueOrThrow({ where: { id: failedId } });
  expect(retried.attempts).toBeGreaterThanOrEqual(3);
  expect(retried.maxAttempts).toBeGreaterThan(3);
  expect(await db.jobAttempt.count({ where: { jobId: failedId, error: `e2e failure ${stamp}` } })).toBe(1);
});
