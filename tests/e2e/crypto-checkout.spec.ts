import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin, loginUser } from "./helpers";

/**
 * Crypto checkout, through the real pages: every coin and network pair must show its own
 * address and only that one, with the amount, the QR code and the warning; and nothing in the
 * browser can make an order paid. Needs network access for live exchange rates.
 */
const EVM = "0x7DA32E72a89ee85529cf28530998236a21a9D8a9";
const COMBOS: { coin: string; coinLabel: string; network: string; networkLabel: string; address: string; single?: boolean; needsHash?: boolean }[] = [
  { coin: "USDT", coinLabel: "Tether (USDT)", network: "BSC", networkLabel: "BNB Smart Chain (BEP-20)", address: EVM },
  { coin: "USDT", coinLabel: "Tether (USDT)", network: "ETHEREUM", networkLabel: "Ethereum (ERC-20)", address: EVM },
  { coin: "USDT", coinLabel: "Tether (USDT)", network: "SOLANA", networkLabel: "Solana", address: "DURksVqkbWDUjRp4oRkTrvvG3P4XipMF3KB4Mnm2Mmt8" },
  { coin: "USDT", coinLabel: "Tether (USDT)", network: "TRON", networkLabel: "Tron (TRC-20)", address: "TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwG" },
  { coin: "BTC", coinLabel: "Bitcoin (BTC)", network: "BITCOIN", networkLabel: "Bitcoin", address: "bc1qnhxkhlks4vefy8j287hu5evhxmz5v5395gxkhh", single: true },
  { coin: "BNB", coinLabel: "BNB", network: "BSC", networkLabel: "BNB Smart Chain (BEP-20)", address: EVM, single: true, needsHash: true },
  { coin: "ETH", coinLabel: "Ethereum (ETH)", network: "ETHEREUM", networkLabel: "Ethereum", address: EVM, single: true, needsHash: true },
  { coin: "LTC", coinLabel: "Litecoin (LTC)", network: "LITECOIN", networkLabel: "Litecoin", address: "LT3hnd2TafAShboJxdJwB1bh4G5TUCcqxP" },
  { coin: "LTC", coinLabel: "Litecoin (LTC)", network: "BSC", networkLabel: "LTC on BSC (BEP-20 token)", address: EVM },
];
const ALL_ADDRESSES = [...new Set(COMBOS.map((c) => c.address))];
const WARNING = "Only send the selected cryptocurrency using the selected network. Sending through another network may result in permanent loss.";

const db = new PrismaClient();
let stockBefore = 0;
const placed: string[] = [];

test.beforeAll(async () => {
  const product = await db.product.findUniqueOrThrow({ where: { sku: E2E.productSku } });
  stockBefore = product.stock;
  // One listing is bought once per pair below; the checkout also limits attempts per address.
  await db.product.update({ where: { id: product.id }, data: { stock: 40 } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "checkout:" } } });
  await db.setting.upsert({ where: { key: "payments.crypto.enabled" }, create: { key: "payments.crypto.enabled", value: "true" }, update: { value: "true" } });
});

test.afterAll(async () => {
  const orders = await db.order.findMany({ where: { number: { in: placed } }, select: { id: true } });
  for (const { id } of orders) {
    await db.cryptoPayment.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.orderEvent.deleteMany({ where: { orderId: id } });
    await db.inventoryAdjustment.deleteMany({ where: { orderId: id } });
    await db.orderItem.deleteMany({ where: { orderId: id } });
    await db.order.delete({ where: { id } }).catch(() => {});
  }
  await db.product.update({ where: { sku: E2E.productSku }, data: { stock: stockBefore } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "checkout:" } } });
  await db.$disconnect();
});

async function fillField(page: Page, name: string, value: string) {
  const el = page.locator(`[name="${name}"]`).first();
  if ((await el.evaluate((n) => n.tagName)) === "SELECT") await el.selectOption(value);
  else await el.fill(value);
}

/** Cart → checkout with the address filled and "Cryptocurrency" chosen. */
async function toCryptoCheckout(page: Page) {
  await page.goto(`/store/${E2E.productSlug}`);
  await page.getByRole("button", { name: /add to cart/i }).first().click();
  await expect(page.getByRole("button", { name: /added to cart/i })).toBeVisible();
  await page.goto("/checkout");
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
  const crypto = page.locator('input[name="payment"][value="crypto"]');
  await expect(crypto).toBeVisible({ timeout: 20_000 });
  await crypto.check();
  await expect(page.getByTestId("crypto-form")).toBeVisible();
}

async function placeCryptoOrder(page: Page, combo: (typeof COMBOS)[number]) {
  await toCryptoCheckout(page);
  const form = page.getByTestId("crypto-form");
  const submit = page.getByRole("button", { name: /place order|choose a coin/i });
  // Nothing is chosen for the buyer.
  await expect(submit).toBeDisabled();
  await form.locator('[name="crypto-coin"]').selectOption(combo.coin);
  if (combo.single) {
    await expect(form.locator('[name="crypto-network"]')).toHaveCount(0);
    await expect(form.getByTestId("crypto-single-network")).toHaveText(combo.networkLabel);
  } else {
    // A coin with several networks waits for a deliberate choice.
    await expect(submit).toBeDisabled();
    await form.locator('[name="crypto-network"]').selectOption(combo.network);
  }
  await expect(form.getByTestId("crypto-estimate")).toContainText(combo.networkLabel);
  await expect(form.getByTestId("crypto-estimate")).toContainText(new RegExp(`[\\d,.]+ ${combo.coin}`));
  await expect(form).toContainText(WARNING);
  // The address is not shown before the order exists: the amount that identifies the payment is fixed with it.
  for (const a of ALL_ADDRESSES) await expect(form).not.toContainText(a);
  await expect(submit).toBeEnabled();
  await expect(submit).toHaveText(`Place order and pay with ${combo.coin}`);
  await submit.click();
  await page.waitForURL(/\/checkout\/complete\?order=RCC-/, { timeout: 60_000 });
  const number = new URL(page.url()).searchParams.get("order")!;
  placed.push(number);
  return number;
}

test("each coin and network shows its own address, amount, QR code and warning", async ({ page, context }) => {
  test.setTimeout(12 * 60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));
  await loginUser(page, E2E.buyer);

  for (const combo of COMBOS) {
    await test.step(`${combo.coin} on ${combo.network}`, async () => {
      const number = await placeCryptoOrder(page, combo);
      await expectHealthy(page);
      const panel = page.getByTestId("crypto-pay");
      await expect(panel).toHaveAttribute("data-coin", combo.coin);
      await expect(panel).toHaveAttribute("data-network", combo.network);
      await expect(panel).toHaveAttribute("data-status", "waiting");
      // The address for exactly this pair, and no other address anywhere on the page.
      await expect(panel.getByTestId("crypto-address")).toHaveText(combo.address);
      const main = await page.locator("main").innerText();
      for (const other of ALL_ADDRESSES.filter((a) => a !== combo.address)) expect(main, `${combo.coin}/${combo.network} must not show ${other}`).not.toContain(other);
      await expect(panel.getByTestId("crypto-network")).toHaveText(combo.networkLabel);
      await expect(panel.getByTestId("crypto-usd")).toHaveText(/^\$[\d,]+\.\d{2} USD$/);
      await expect(panel.getByTestId("crypto-amount")).toHaveText(new RegExp(`^[\\d,]+\\.\\d{4,8} ${combo.coin}$`));
      await expect(panel.getByTestId("crypto-countdown")).toHaveText(/^(2\d|30):\d\d$/);
      await expect(panel.getByTestId("crypto-warning")).toHaveText(WARNING);
      await expect(panel.getByTestId("crypto-qr").locator("svg")).toBeVisible();
      if (combo.coin === "LTC" && combo.network === "BSC") await expect(panel).toContainText(/not native Litecoin/);
      // Copy Address copies that address.
      await panel.getByTestId("crypto-copy-address").click();
      await expect(panel.getByTestId("crypto-copy-address")).toHaveText("Address copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(combo.address);
      // Networks that cannot be watched without an indexer ask for the transaction hash up front.
      const hashBox = panel.getByTestId("crypto-hash-box");
      if (combo.needsHash) await expect(hashBox).toHaveAttribute("open", "");
      else await expect(hashBox).not.toHaveAttribute("open", "");
      // What the page shows is what the server stored for the order.
      const row = await db.cryptoPayment.findFirstOrThrow({ where: { order: { number } } });
      expect({ coin: row.coin, network: row.network, address: row.address, status: row.status }).toEqual({ coin: combo.coin, network: combo.network, address: combo.address, status: "waiting" });
      expect(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 30 * 60_000)).toBeLessThan(5_000);
      const order = await db.order.findUniqueOrThrow({ where: { number }, select: { status: true, paymentStatus: true } });
      expect(order).toEqual({ status: "pending_payment", paymentStatus: "unpaid" });
    });
  }
  // Every pair got its own unique amount record, one per order.
  expect(await db.cryptoPayment.count({ where: { order: { number: { in: placed } } } })).toBe(COMBOS.length);
});

test("nothing the buyer does in the browser marks a crypto order paid", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  await page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));
  await loginUser(page, E2E.buyer);
  const combo = COMBOS.find((c) => c.coin === "BTC")!;
  const number = await placeCryptoOrder(page, combo);
  const panel = page.getByTestId("crypto-pay");
  // There is no "I've paid" control at all.
  await expect(page.getByRole("button", { name: /paid|i.?ve sent|confirm payment/i })).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText(/send your btc payment/i);
  // A malformed hash is refused before any lookup; a well-formed one that is not on chain is refused after it.
  const box = panel.getByTestId("crypto-hash-box");
  await box.locator("summary").click();
  await box.locator('[name="txhash"]').fill("i-paid-trust-me");
  await box.getByRole("button", { name: "Verify transaction" }).click();
  await expect(panel.getByTestId("crypto-message")).toContainText(/does not look like a Bitcoin transaction hash/i);
  await box.locator('[name="txhash"]').fill("0".repeat(63) + "1");
  await box.getByRole("button", { name: "Verify transaction" }).click();
  await expect(panel.getByTestId("crypto-message")).toContainText(/could not find|could not reach/i, { timeout: 40_000 });
  await expect(panel).toHaveAttribute("data-status", "waiting");
  await page.reload();
  await expect(page.getByTestId("crypto-pay")).toHaveAttribute("data-status", "waiting");
  const order = await db.order.findUniqueOrThrow({ where: { number }, select: { status: true, paymentStatus: true } });
  expect(order).toEqual({ status: "pending_payment", paymentStatus: "unpaid" });
  // The buyer's order page links back to the payment page.
  await page.goto(`/account/orders/${number}`);
  await expect(page.getByRole("link", { name: "Open the payment page" })).toBeVisible();

  // Staff see what was quoted and where it must arrive. Accepting by hand needs a note on record.
  await page.context().clearCookies();
  await loginAdmin(page, E2E.superAdmin);
  // The suite's admin sign-ins share one allowance of two-factor attempts per ten minutes: give this one back.
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  const id = (await db.order.findUniqueOrThrow({ where: { number }, select: { id: true } })).id;
  await page.goto(`/admin/orders/${id}`);
  await expectHealthy(page);
  const body = page.locator("body");
  await expect(body).toContainText("Crypto payment");
  await expect(body).toContainText(combo.address);
  await expect(body).toContainText(/waiting for payment/i);
  await expect(body).toContainText(/0 of 2 required/);
  await expect(page.getByRole("button", { name: "Check the blockchain now" })).toBeVisible();
  await page.getByRole("button", { name: "Accept and mark paid by hand" }).click();
  const dialog = page.locator("dialog[open]");
  // Without a note the confirmation cannot even be sent.
  await expect(dialog.getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(await db.order.findUniqueOrThrow({ where: { number }, select: { paymentStatus: true } })).toEqual({ paymentStatus: "unpaid" });
});
