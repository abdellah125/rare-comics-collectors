import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginUser } from "./helpers";

test.describe("buyer / seller boundaries", () => {
  test("guests are redirected away from the account area", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/account\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test("a buyer cannot open the seller dashboard", async ({ page }) => {
    await loginUser(page, E2E.buyer);
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/^\/dashboard$/);
    expect(page.url()).not.toMatch(/\/dashboard\/?$/);
    await page.goto("/account");
    await expectHealthy(page);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("a buyer cannot read another customer's order or a random ticket", async ({ page }) => {
    await loginUser(page, E2E.buyer);
    const res = await page.goto("/account/orders/RCC-2026-000001");
    expect([404, 200]).toContain(res?.status() ?? 0);
    // The not-found boundary streams in after the shell; poll instead of reading the body once.
    await expect(page.locator("body")).toContainText(/not found|couldn.t find|404/i);
    const ticket = await page.goto("/account/support/TCK-999999");
    expect(ticket?.status()).toBe(404);
  });

  test("a seller sees their dashboard but not admin or other sellers' data", async ({ page }) => {
    await loginUser(page, E2E.seller);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expectHealthy(page);
    await page.goto("/dashboard/listings");
    await expect(page.getByText("E2E Test Comic").first()).toBeVisible();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    const res = await page.goto("/dashboard/orders/RCC-2026-000001");
    expect(res?.status()).toBe(404);
  });
});
