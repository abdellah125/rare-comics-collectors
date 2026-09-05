import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { loginUser } from "./helpers";

/** Regression coverage for the issues found in the production audit. */
const db = new PrismaClient();

async function setSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
}
async function clearSetting(key: string) {
  await db.setting.deleteMany({ where: { key } });
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await db.$disconnect();
});

test("signed-in visitors are never bounced to another host", async ({ page }) => {
  await loginUser(page, E2E.buyer);
  for (const path of ["/account/login?next=//evil.example/x", "/account/register?next=//evil.example/x", "/account/login?next=/\\evil.example"]) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    const location = res.headers()["location"] ?? "";
    expect(location, path).not.toMatch(/evil\.example/);
    expect(location.startsWith("//"), path).toBe(false);
  }
});

test("cancelling at the payment provider releases the reservation, but only for the order's owner", async ({ page, browser }) => {
  await loginUser(page, E2E.buyer);
  const buyer = await db.user.findUniqueOrThrow({ where: { email: E2E.buyer } });
  const product = await db.product.findUniqueOrThrow({ where: { sku: E2E.productSku } });
  const stock0 = product.stock;
  await db.product.update({ where: { id: product.id }, data: { stock: { decrement: 1 } } });
  const number = `RCC-E2E-${Date.now().toString(36).toUpperCase()}`;
  const order = await db.order.create({
    data: {
      number,
      userId: buyer.id,
      email: buyer.email,
      subtotal: product.price,
      total: product.price,
      presentmentTotal: product.price,
      countryCode: "US",
      items: { create: [{ productId: product.id, sellerId: product.sellerId, kind: "comic", title: product.title, slug: product.slug, unitPrice: product.price, qty: 1, subtotal: product.price }] },
      payments: { create: [{ provider: "paypal", method: "paypal", amount: product.price, currency: "USD", presentmentAmount: product.price, providerRef: `e2e_${number}` }] },
    },
  });
  try {
    // A stranger with the order number cannot cancel it.
    const strangerCtx = await browser.newContext();
    const stranger = await strangerCtx.newPage();
    await stranger.goto(`/checkout/return?order=${number}&provider=paypal&cancelled=1`);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending_payment");
    await strangerCtx.close();

    // The owner can, and the stock comes back.
    await page.goto(`/checkout/return?order=${number}&provider=paypal&cancelled=1`);
    expect(page.url()).toContain(`/checkout?cancelled=${number}`);
    await expect(page.getByText(/was cancelled/i)).toBeVisible();
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("cancelled");
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(stock0);
  } finally {
    await db.orderEvent.deleteMany({ where: { orderId: order.id } });
    await db.inventoryAdjustment.deleteMany({ where: { orderId: order.id } });
    await db.payment.deleteMany({ where: { orderId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } }).catch(() => {});
    await db.product.update({ where: { id: product.id }, data: { stock: stock0 } });
  }
});

test("admin settings reach the storefront", async ({ page }) => {
  await setSetting("marketplace.homepageHeadline", "E2E headline propagation");
  await setSetting("commerce.freeShippingThreshold", 12345);
  await setSetting("commerce.returnWindowDays", 21);
  try {
    await page.goto("/");
    await expect(page.locator("h1").first()).toContainText("E2E headline propagation");
    await expect(page.getByText(/Free over \$123\.45/).first()).toBeVisible();
    await expect(page.getByText(/21-day inspection window/).first()).toBeVisible();
    await page.goto(`/store/${E2E.productSlug}`);
    await expect(page.getByText(/21-day inspection/).first()).toBeVisible();
    await page.goto("/policies/shipping");
    await expect(page.getByText(/free on orders over \$123\.45/i).first()).toBeVisible();
  } finally {
    await clearSetting("marketplace.homepageHeadline");
    await clearSetting("commerce.freeShippingThreshold");
    await clearSetting("commerce.returnWindowDays");
  }
});

test("guest order tracking can be switched off", async ({ page }) => {
  await setSetting("features.guestTracking", false);
  try {
    await page.goto("/track-order");
    await expect(page.getByText(/Sign in to track your orders/)).toBeVisible();
  } finally {
    await clearSetting("features.guestTracking");
  }
  await page.goto("/track-order");
  await expect(page.getByRole("button", { name: /^track$/i })).toBeVisible();
});

test("sitemap and robots cover the catalogue and hide private areas", async ({ request }) => {
  const sm = await request.get("/sitemap.xml");
  const xml = await sm.text();
  expect(sm.status()).toBe(200);
  expect(xml).toContain(`/store/${E2E.productSlug}`);
  expect(xml).toContain("/sellers/e2e-seller");
  expect(xml).not.toContain("/admin");
  expect(xml).not.toContain("/checkout");
  const rb = await request.get("/robots.txt");
  const txt = await rb.text();
  expect(txt).toMatch(/Disallow: \/admin/);
  expect(txt).toMatch(/Disallow: \/account/);
  expect(txt).toMatch(/Disallow: \/dashboard/);
  expect(txt).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("the provider return handler proves ownership before showing a confirmation", async ({ page }) => {
  const buyer = await db.user.findUniqueOrThrow({ where: { email: E2E.buyer } });
  const number = `RCC-E2E-${Date.now().toString(36).toUpperCase()}X`;
  const order = await db.order.create({
    data: { number, userId: buyer.id, email: buyer.email, subtotal: 5000, total: 5000, presentmentTotal: 5000, countryCode: "US", status: "paid", paymentStatus: "paid", payments: { create: [{ provider: "test", method: "test", status: "succeeded", amount: 5000, currency: "USD", presentmentAmount: 5000 }] } },
  });
  try {
    // No session and no signed cookie: the confirmation page must not reveal the order.
    const res = await page.goto(`/checkout/complete?order=${number}`);
    expect(res?.status()).toBe(200);
    expect(page.url()).toContain("/track-order");
  } finally {
    await db.payment.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
});
