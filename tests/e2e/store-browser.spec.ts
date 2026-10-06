import { expect, test, type Page } from "@playwright/test";
import { expectHealthy } from "./helpers";

/**
 * The store searches on the server: the page carries the cards it shows, not the catalogue,
 * and every filter lives in the address.
 */
const quiet = (page: Page) => page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));
const total = async (page: Page) => Number((await page.locator('p[aria-live="polite"]').innerText()).match(/of ([\d,]+)/)?.[1].replace(/,/g, "") ?? -1);

test("the store page stays small and filters through the address", async ({ page }) => {
  test.setTimeout(120_000);
  await quiet(page);
  const response = await page.goto("/store");
  // The whole catalogue used to ride along in the page (megabytes); now only the first cards do.
  expect((await response!.body()).length).toBeLessThan(700_000);
  await expectHealthy(page);
  await expect(page.locator("main article")).toHaveCount(24);
  const all = await total(page);
  expect(all).toBeGreaterThan(24);

  // Typing searches after a short pause, without losing what was typed.
  const search = page.getByRole("searchbox", { name: "Search inventory" });
  await search.pressSequentially("e2e test comic", { delay: 30 });
  await page.waitForURL(/[?&]q=e2e\+test\+comic/);
  await expect(search).toHaveValue("e2e test comic");
  await expect(page.locator("main article").first()).toContainText(/E2E Test Comic/i);
  expect(await total(page)).toBeLessThan(all);

  // Clearing brings everything back.
  await page.getByRole("button", { name: "clear filters" }).click();
  await page.waitForURL((u) => u.pathname === "/store" && u.search === "");
  await expect(search).toHaveValue("");
  await expect.poll(() => total(page)).toBe(all);

  // Show more adds a page of cards; sorting reorders them by price.
  await page.getByRole("button", { name: /^Show \d+ more$/ }).click();
  await expect(page.locator("main article")).toHaveCount(48, { timeout: 30_000 });
  await page.getByLabel("Sort inventory").selectOption("price-asc");
  await page.waitForURL(/sort=price-asc/);
  await expect(page.locator("main article")).toHaveCount(24, { timeout: 30_000 });

  // A search with no match says so, and a link from elsewhere on the site sets the box.
  await page.goto("/store?q=zzzzqqqq");
  await expect(page.getByText("No books match those filters")).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search inventory" })).toHaveValue("zzzzqqqq");
});

test("a filter chip narrows the list and can be combined with a search", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await quiet(page);
  await page.goto("/store");
  const all = await total(page);
  const sidebar = page.locator("aside");
  const chip = sidebar.getByRole("button", { name: "CGC", exact: true });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.waitForURL(/grader=CGC/);
  await expect.poll(() => total(page)).toBeLessThan(all);
  const cgc = await total(page);
  await sidebar.getByRole("button", { name: "Under $250" }).click();
  await page.waitForURL(/price=0/);
  await expect.poll(() => total(page)).toBeLessThanOrEqual(cgc);
  // The address alone reproduces the view.
  await page.reload();
  await expect(page.locator("aside").getByRole("button", { name: "CGC", exact: true })).toHaveAttribute("aria-pressed", "true");
});
