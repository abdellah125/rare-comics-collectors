import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin, loginUser } from "./helpers";

async function fillField(page: Page, name: string, value: string) {
  const el = page.locator(`[name="${name}"]`).first();
  if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(value);
  else await el.fill(value);
}

test.describe("checkout → admin refund", () => {
  test("a buyer can pay with the test provider and an admin can refund it", async ({ page }) => {
    // 1. Buyer adds the deterministic listing and checks out.
    await loginUser(page, E2E.buyer);
    await page.goto(`/store/${E2E.productSlug}`);
    await expectHealthy(page);
    // The cart lives in localStorage on the client; make sure the add registered (hydration) before leaving the page.
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await expect(page.getByRole("button", { name: /added to cart/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /your cart/i })).toBeVisible();
    await page.getByRole("link", { name: /checkout/i }).first().click();
    await page.waitForURL(/\/checkout/);
    await expectHealthy(page);
    await fillField(page, "shippingCountry", "US");
    await fillField(page, "shippingFirstName", "E2E");
    await fillField(page, "shippingLastName", "Buyer");
    await fillField(page, "shippingLine1", "1 Test Street");
    await fillField(page, "shippingCity", "Austin");
    await fillField(page, "shippingRegion", "TX");
    await fillField(page, "shippingPostal", "78701");
    const phone = page.locator('[name="phone"]').first();
    if (await phone.count()) await phone.fill("5125550100");
    const shipping = page.locator('input[name="shipping"]').first();
    await expect(shipping).toBeVisible({ timeout: 20_000 });
    if (!(await shipping.isChecked())) await shipping.check();
    const testProvider = page.locator('input[name="payment"][value="test"]');
    await expect(testProvider).toBeVisible();
    await testProvider.check();
    await page.getByRole("button", { name: /place order/i }).click();
    await page.waitForURL(/\/checkout\/complete\?order=RCC-/, { timeout: 45_000 });
    const orderNumber = new URL(page.url()).searchParams.get("order")!;
    expect(orderNumber).toMatch(/^RCC-\d{4}-\d{6}$/);
    await expectHealthy(page);
    await page.goto(`/account/orders/${orderNumber}`);
    await expect(page.getByText(orderNumber).first()).toBeVisible();

    // 2. Admin finds the order, refunds it in full.
    await page.context().clearCookies();
    await loginAdmin(page, E2E.superAdmin);
    await page.goto(`/admin/orders?q=${orderNumber}`);
    await page.getByRole("link", { name: orderNumber }).first().click();
    await expect(page).toHaveURL(/\/admin\/orders\/[a-z0-9]+/);
    await expectHealthy(page);
    await expect(page.getByText(/paid/i).first()).toBeVisible();
    const amount = page.locator('input[name="amount"]').first();
    await expect(amount).toBeVisible();
    const max = await amount.getAttribute("max");
    await amount.fill(max ?? "50.00");
    await page.locator('select[name="reason"]').first().selectOption("requested_by_customer");
    await page.locator('input[name="note"]').first().fill("e2e full refund");
    // The refund button asks for confirmation through window.confirm.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /issue refund/i }).click();
    // A full refund leaves nothing refundable, so the page re-renders without the form.
    await expect(page.getByRole("button", { name: /issue refund/i })).toHaveCount(0, { timeout: 30_000 });
    await page.reload();
    await expect(page.locator("body")).toContainText(/refunded/i);

    // 3. The audit log and the buyer's account reflect it.
    await page.goto("/admin/audit?q=refund");
    await expect(page.locator("table")).toContainText(/refund/i);
    await expect(page.locator("table")).toContainText(orderNumber);
    await page.context().clearCookies();
    await loginUser(page, E2E.buyer);
    await page.goto(`/account/orders/${orderNumber}`);
    await expect(page.locator("body")).toContainText(/refund/i);
  });
});
