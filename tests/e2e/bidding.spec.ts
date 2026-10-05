import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/** A product the source sells by bidding stays a bidding product: current bid, bid form, no cart. Needs network for the photo. */
const PHOTO = "https://img.hipcomic.com/p/11d1ac51dafd6929b574aa6ad904dfa3-800.jpg";
const stamp = Date.now().toString().slice(-7);
const word = [...stamp].map((d) => "abcdefghij"[Number(d)]).join("");
const SERIES = `Bid Check ${word[0].toUpperCase()}${word.slice(1)}`; // letters only: digits would read as an issue number
const ID = `8${stamp}1`;
const SLUG = `bid-check-${word}-7-cgc-9-0`;

async function confirm(page: Page, row: ReturnType<Page["locator"]>, button: string, confirmLabel = "Confirm") {
  await row.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
}

test("a product sold by bidding shows the current bid and takes bids instead of going in a cart", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));
  await loginAdmin(page, E2E.superAdmin);
  await page.goto("/admin/imports");
  const csv = ["id,url,title,price,image,seller,series,publisher,year,type", `${ID},https://www.hipcomic.com/listing/bid-check/${ID},${SERIES} 7 CGC 9.0,$17.00,${PHOTO},seller-a,${SERIES},Marvel Comics,1975,auction`].join("\n");
  await page.locator('input[name="files"]').setInputFiles({ name: `bid-${stamp}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import to review queue" }).click();
  await expect(page.locator('[role="status"]').filter({ hasText: `bid-${stamp}.csv` })).toContainText(/1 rows: 1 new/, { timeout: 60_000 });

  // In the queue it is a bidding product at the current bid: no discount, no suggested price.
  await page.goto(`/admin/imports/queue?status=all&q=${encodeURIComponent(SERIES)}`);
  const row = page.getByRole("table").first().locator("tr", { hasText: `#${ID}` });
  await expect(row).toContainText(/pending review/i);
  await expect(row).toContainText("$17.00");
  await expect(row).toContainText(/bidding: current bid/i);
  await confirm(page, row, "Approve");
  await expect(row).toContainText(/ready to release/i, { timeout: 60_000 });
  await confirm(page, row, "Release", "Release");
  await expect(row).toContainText(/released/i, { timeout: 60_000 });

  // The storefront: current bid, a bid form, and no way to put it in a cart.
  await page.context().clearCookies();
  await page.goto(`/store/${SLUG}`);
  await expectHealthy(page);
  const main = page.locator("main");
  await expect(main).toContainText(/current bid/i);
  await expect(main).toContainText("$17.00");
  await expect(main).toContainText(/open for bids/i);
  // (related products further down keep their own buttons; the product itself has none)
  await expect(page.locator("#bid").getByRole("button", { name: /add to cart|buy now/i })).toHaveCount(0);
  const form = page.getByTestId("bid-form");
  await expect(form).toContainText(/minimum bid: \$18\.00/i);
  await form.locator('[name="name"]').fill("Bid Tester");
  await form.locator('[name="email"]').fill("bid-tester@example.com");
  await form.locator('[name="amount"]').fill("17.50");
  await form.getByRole("button", { name: "Place bid" }).click();
  await expect(form).toContainText(/at least \$18\.00/i);
  await form.locator('[name="amount"]').fill("20");
  await form.getByRole("button", { name: "Place bid" }).click();
  await expect(page.getByTestId("bid-received")).toContainText(/\$20\.00 has been received/i, { timeout: 30_000 });
  await expect(page.getByTestId("bid-received")).toContainText(/nothing has been charged/i);
  await page.reload();
  await expect(main).toContainText("$20.00");
  await expect(main).toContainText(/1 bid here/i);
  // Not in the Merchant Center feed (it has no fixed price).
  expect(await (await page.request.get("/google-shopping-feed.xml")).text()).not.toContain(`IMP-${ID}`);

  // The admin sees the bid and accepts it; bidding closes.
  await loginAdmin(page, E2E.superAdmin);
  await page.goto(`/admin/bids?q=${encodeURIComponent(SERIES)}`);
  const bid = page.getByRole("table").first().locator("tr", { hasText: "bid-tester@example.com" });
  await expect(bid).toContainText("$20.00");
  await expect(bid).toContainText(/highest bid/i);
  await confirm(page, bid, "Accept", "Accept bid");
  await page.goto(`/admin/bids?status=accepted&q=${encodeURIComponent(SERIES)}`);
  await expect(page.getByRole("table").first()).toContainText(/accepted/i);
  await page.goto(`/store/${SLUG}`);
  await expect(page.locator("main")).toContainText(/bidding closed/i);
  await expect(page.getByTestId("bid-form")).toHaveCount(0);
});
