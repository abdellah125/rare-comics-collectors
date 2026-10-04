import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin, loginUser } from "./helpers";

async function fillField(page: Page, name: string, value: string) {
  const el = page.locator(`[name="${name}"]`).first();
  if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(value);
  else await el.fill(value);
}

const money = (text: string | null) => Number((text ?? "").replace(/[^\d.]/g, ""));

test.describe("PayPal invoice request", () => {
  test("PayPal at checkout files an invoice request for the discounted total, and only an admin makes it paid", async ({ page }) => {
    // 1. Cart → discount → PayPal → details → request.
    await loginUser(page, E2E.buyer);
    await page.goto(`/store/${E2E.productSlug}`);
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await expect(page.getByRole("button", { name: /added to cart/i })).toBeVisible();
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
    const shipping = page.locator('input[name="shipping"]').first();
    await expect(shipping).toBeVisible({ timeout: 20_000 });
    if (!(await shipping.isChecked())) await shipping.check();

    const submit = page.getByRole("button", { name: /place order|request paypal invoice/i });
    await expect(submit).toContainText(/\d/);
    const before = money(await submit.textContent());
    await page.getByLabel("Coupon code").fill(E2E.coupon);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/discount/i).first()).toBeVisible();
    await expect.poll(async () => money(await submit.textContent())).toBeLessThan(before);

    await page.locator('input[name="payment"][value="paypal"]').check();
    const form = page.getByTestId("paypal-invoice-form");
    await expect(form).toBeVisible();
    await expect(form).toContainText(/you will not be charged now/i);
    await expect(form).toContainText(/paypal invoice/i);
    await expect(form).toContainText(/discount of .* already applied/i);
    await expect(page.getByTestId("invoice-shipping")).toContainText("1 Test Street");
    // Prefilled from the details above; the buyer can change them.
    await expect(page.locator('[name="invoice-name"]')).toHaveValue("E2E Buyer");
    await page.locator('[name="invoice-paypal-email"]').fill("buyer-paypal@example.com");

    // WhatsApp number is required: a bad one is refused and no order is created.
    await page.locator('[name="invoice-whatsapp"]').fill("12");
    await submit.click();
    await expect(page.getByText(/whatsapp number with its country code/i)).toBeVisible();
    expect(page.url()).not.toContain("/checkout/complete");

    await page.locator('[name="invoice-whatsapp"]').fill("+1 418 555 0100");
    await expect(submit).toHaveText(/request paypal invoice/i);
    const invoiced = money(await submit.textContent());
    expect(invoiced).toBeLessThan(before);
    await submit.click();
    // No redirect to PayPal: straight to the confirmation.
    await page.waitForURL(/\/checkout\/complete\?order=RCC-/, { timeout: 45_000 });
    const orderNumber = new URL(page.url()).searchParams.get("order")!;
    await expectHealthy(page);
    const main = page.locator("main");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/request received/i);
    await expect(main).toContainText(/we will contact you and send a paypal invoice/i);
    await expect(main).toContainText("buyer-paypal@example.com");
    await expect(main).toContainText(/nothing has been charged/i);
    await expect(main).toContainText(/not yet paid/i);
    await expect(main).not.toContainText(/order placed|thank you\. a confirmation/i);
    await expect(main).toContainText(invoiced.toFixed(2));
    const wa = page.getByTestId("invoice-whatsapp");
    await expect(wa).toContainText("+1 418-506-6697");
    await expect(wa.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("href", "https://wa.me/14185066697");
    await page.goto(`/account/orders/${orderNumber}`);
    await expect(page.locator("body")).toContainText(/paypal invoice requested/i);

    // 2. Admin: notified, sees the details and the discounted amount, walks the statuses.
    await page.context().clearCookies();
    await loginAdmin(page, E2E.superAdmin);
    await page.goto("/admin/orders?invoice=requested");
    await expect(page.getByRole("table").first()).toContainText(orderNumber);
    await page.getByRole("link", { name: orderNumber }).first().click();
    await expect(page).toHaveURL(/\/admin\/orders\/[a-z0-9]+/);
    await expectHealthy(page);
    const body = page.locator("body");
    await expect(body).toContainText(/paypal invoice requested/i);
    await expect(body).toContainText("buyer-paypal@example.com");
    await expect(body).toContainText("+1 418 555 0100");
    await expect(body).toContainText(/amount to invoice/i);
    await expect(body).toContainText(invoiced.toFixed(2));
    await expect(body).toContainText(new RegExp(`after discount of .*code ${E2E.coupon}`, "i"));
    await expect(body).toContainText(/payment: unpaid/i);
    // Nothing offers to "check with PayPal": there is no gateway payment behind an invoice request.
    await expect(page.getByRole("button", { name: /check with paypal/i })).toHaveCount(0);

    const confirm = async (button: string, reason?: string) => {
      await page.getByRole("button", { name: button, exact: true }).click();
      const dialog = page.locator("dialog[open]");
      await expect(dialog).toBeVisible();
      if (reason) await dialog.locator("textarea").fill(reason);
      await dialog.getByRole("button", { name: "Confirm" }).click();
      await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    };
    await confirm("Invoice Pending");
    await expect(body).toContainText(/invoice status\s*invoice pending/i, { timeout: 30_000 });
    await confirm("Invoice Sent", "INV2-TEST-0001");
    await expect(body).toContainText(/invoice status\s*invoice sent/i, { timeout: 30_000 });
    await expect(body).toContainText("INV2-TEST-0001");
    await expect(body).toContainText(/payment: unpaid/i);
    await confirm("Paid", "PAYPAL-TXN-TEST-1");
    await expect(body).toContainText(/payment: paid/i, { timeout: 30_000 });
    await expect(body).toContainText(/invoice status\s*paid/i);

    // 3. Only now does the buyer see a paid order.
    await page.context().clearCookies();
    await loginUser(page, E2E.buyer);
    await page.goto(`/checkout/complete?order=${orderNumber}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/order placed/i);
  });

  test("an admin can cancel an invoice request, which returns the stock and never shows as paid", async ({ page }) => {
    await loginUser(page, E2E.buyer);
    await page.goto(`/store/${E2E.productSlug}`);
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await expect(page.getByRole("button", { name: /added to cart/i })).toBeVisible();
    await page.getByRole("link", { name: /checkout/i }).first().click();
    await page.waitForURL(/\/checkout/);
    await fillField(page, "shippingCountry", "US");
    await fillField(page, "shippingFirstName", "E2E");
    await fillField(page, "shippingLastName", "Buyer");
    await fillField(page, "shippingLine1", "1 Test Street");
    await fillField(page, "shippingCity", "Austin");
    await fillField(page, "shippingRegion", "TX");
    await fillField(page, "shippingPostal", "78701");
    const shipping = page.locator('input[name="shipping"]').first();
    await expect(shipping).toBeVisible({ timeout: 20_000 });
    if (!(await shipping.isChecked())) await shipping.check();
    await page.locator('input[name="payment"][value="paypal"]').check();
    await page.locator('[name="invoice-whatsapp"]').fill("+1 418 555 0100");
    await page.getByRole("button", { name: /request paypal invoice/i }).click();
    await page.waitForURL(/\/checkout\/complete\?order=RCC-/, { timeout: 45_000 });
    const orderNumber = new URL(page.url()).searchParams.get("order")!;

    await page.context().clearCookies();
    await loginAdmin(page, E2E.superAdmin);
    await page.goto(`/admin/orders?q=${orderNumber}`);
    await page.getByRole("link", { name: orderNumber }).first().click();
    await expect(page).toHaveURL(/\/admin\/orders\/[a-z0-9]+/);
    await page.getByRole("button", { name: "Cancelled", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator("textarea").fill("Buyer changed their mind");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    const body = page.locator("body");
    await expect(body).toContainText(/invoice status\s*cancelled/i, { timeout: 30_000 });
    await expect(body).toContainText(/payment: unpaid/i);
    await expect(page.getByRole("button", { name: "Paid", exact: true })).toHaveCount(0);
  });
});
