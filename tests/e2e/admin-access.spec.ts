import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin, loginUser } from "./helpers";

const ADMIN_ROUTES = [
  "/admin",
  "/admin/reports",
  "/admin/reports?range=ytd",
  "/admin/orders",
  "/admin/payments",
  "/admin/payments?tab=refunds",
  "/admin/returns",
  "/admin/disputes",
  "/admin/disputes/chargebacks",
  "/admin/shipping",
  "/admin/shipping/carriers",
  "/admin/shipping/countries",
  "/admin/products",
  "/admin/products/new",
  "/admin/products/import",
  "/admin/catalog",
  "/admin/reviews",
  "/admin/promotions",
  "/admin/promotions/campaigns",
  "/admin/promotions/featured",
  "/admin/users",
  "/admin/sellers",
  "/admin/finance",
  "/admin/finance/payouts",
  "/admin/finance/payments",
  "/admin/finance/currencies",
  "/admin/finance/taxes",
  "/admin/support",
  "/admin/moderation",
  "/admin/moderation/violations",
  "/admin/moderation/appeals",
  "/admin/notifications",
  "/admin/notifications/announcements",
  "/admin/notifications/broadcast",
  "/admin/notifications/email-log",
  "/admin/settings/general",
  "/admin/settings/commerce",
  "/admin/settings/sellers",
  "/admin/settings/buyers",
  "/admin/settings/notifications",
  "/admin/settings/security",
  "/admin/settings/system",
  "/admin/settings/localization",
  "/admin/admins",
  "/admin/audit",
  "/admin/audit?tab=security",
  "/admin/audit?tab=sessions",
  "/admin/system",
  "/admin/system/webhooks",
  "/admin/search?q=e2e",
];

test.describe("admin access control", () => {
  test("anonymous visitors are sent to the admin login", async ({ page }) => {
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/login/);
    const res = await page.request.get("/api/admin/export/orders");
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.headers()["content-type"]).toContain("application/json");
  });

  test("a buyer account cannot open the admin panel", async ({ page }) => {
    await loginUser(page, E2E.buyer);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    const res = await page.request.get("/api/admin/export/users");
    expect(res.status()).toBeGreaterThanOrEqual(401);
  });

  test("a support agent is limited to their permissions", async ({ page }) => {
    await loginAdmin(page, E2E.supportAdmin);
    await page.goto("/admin/support");
    await expectHealthy(page);
    await expect(page.getByRole("heading", { name: /support tickets/i })).toBeVisible();
    for (const denied of ["/admin/settings/general", "/admin/finance", "/admin/admins", "/admin/products/new"]) {
      await page.goto(denied);
      await expect(page).toHaveURL(/\/admin\/denied/);
    }
    const res = await page.request.get("/api/admin/export/orders");
    expect(res.status()).toBe(403);
  });

  test("a super admin can open every section without errors", async ({ page }) => {
    test.setTimeout(15 * 60_000); // first visit compiles each route in dev
    await loginAdmin(page, E2E.superAdmin);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon|hydrat|third-party|ERR_/.test(msg.text())) consoleErrors.push(msg.text());
    });
    for (const route of ADMIN_ROUTES) {
      const res = await page.goto(route);
      expect(res?.status(), route).toBeLessThan(400);
      await expect(page, route).not.toHaveURL(/\/admin\/(login|denied)/);
      await expect(page.locator("h1").first(), route).toBeVisible();
      await expectHealthy(page);
    }
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("detail pages and CSV exports work for a super admin", async ({ page }) => {
    await loginAdmin(page, E2E.superAdmin);
    await page.goto(`/admin/users?q=${encodeURIComponent(E2E.buyer)}`);
    await page.getByRole("link", { name: /E2E Buyer/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/users\/[a-z0-9]+/);
    await expectHealthy(page);
    await page.goto("/admin/sellers?q=E2E");
    await page.getByRole("link", { name: /E2E Seller Shop/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/sellers\/[a-z0-9]+/);
    await expectHealthy(page);
    await page.goto(`/admin/products?q=${E2E.productSku}`);
    await page.getByRole("link", { name: /E2E Test Comic/ }).first().click();
    await expect(page).toHaveURL(/\/admin\/products\/[a-z0-9]+/);
    await expectHealthy(page);
    for (const report of ["orders", "products", "users", "sales_by_day", "audit"]) {
      const res = await page.request.get(`/api/admin/export/${report}?range=30d`);
      expect(res.status(), report).toBe(200);
      expect(res.headers()["content-type"], report).toContain("text/csv");
    }
    const bogus = await page.request.get("/api/admin/export/nope");
    expect(bogus.status()).toBe(404);
  });

  test("settings changes are enforced server-side and audited", async ({ page }) => {
    await loginAdmin(page, E2E.superAdmin);
    await page.goto("/admin/settings/commerce");
    const field = page.locator('input[name="commerce.maxOrderItems"]');
    const original = await field.inputValue();
    await field.fill("42");
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible();
    await page.reload();
    await expect(page.locator('input[name="commerce.maxOrderItems"]')).toHaveValue("42");
    await page.goto("/admin/audit?action=settings.commerce");
    await expect(page.getByText(/commerce.maxOrderItems/).first()).toBeVisible();
    await page.goto("/admin/settings/commerce");
    await page.locator('input[name="commerce.maxOrderItems"]').fill(original);
    await page.getByRole("button", { name: /save settings/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible();
  });
});

test("first-run setup is closed once an administrator exists", async ({ request }) => {
  const page = await request.get("/admin/setup");
  expect(page.status()).toBe(404);
  const post = await request.post("/api/admin/setup", {
    data: { name: "Intruder", email: "intruder@example.com", password: "Password123456", confirm: "Password123456" },
  });
  expect(post.status()).toBe(404);
});
