import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/**
 * Import → review queue → approve → release → sync, end to end.
 * The photo is fetched from the source's public image host when the product is approved, so this
 * test needs network access (the same request the real flow makes).
 */
const PHOTO = "https://img.hipcomic.com/p/11d1ac51dafd6929b574aa6ad904dfa3-800.jpg";
const stamp = Date.now().toString().slice(-7);
// Letters only: a number in the series name would read as an issue number.
const word = [...stamp].map((d) => "abcdefghij"[Number(d)]).join("");
const SERIES = `Import Check ${word[0].toUpperCase()}${word.slice(1)}`;
const ID = { good: `9${stamp}1`, twin: `9${stamp}2`, bad: `9${stamp}3` };
const SLUG = `import-check-${word}-12-cgc-9-4`;

const csv = (price: string, availability = "available") =>
  [
    "id,url,title,price,image,seller,series,publisher,year,availability",
    `${ID.good},https://www.hipcomic.com/listing/import-check/${ID.good},${SERIES} 12 CGC 9.4,${price},${PHOTO},seller-a,${SERIES},Marvel Comics,1975,${availability}`,
    `${ID.twin},https://www.hipcomic.com/listing/import-check/${ID.twin},${SERIES} 12 CGC 9.4,${price},${PHOTO},seller-a,${SERIES},Marvel Comics,1975,available`,
    `${ID.bad},https://www.hipcomic.com/listing/import-check/${ID.bad},${SERIES} lot of old comics,,${PHOTO},seller-b,,,,available`,
  ].join("\n");

async function upload(page: Page, name: string, body: string) {
  await page.goto("/admin/imports");
  await page.locator('input[name="files"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body) });
  await page.getByRole("button", { name: "Import to review queue" }).click();
  await expect(page.locator('[role="status"], [role="alert"]').filter({ hasText: name })).toBeVisible({ timeout: 60_000 });
}

async function confirm(page: Page, row: ReturnType<Page["locator"]>, button: string, confirmLabel = "Confirm") {
  await row.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
}

test.describe("HipComic import review queue", () => {
  test.setTimeout(240_000);

  test("imports wait for review, release publishes at source × 0.75, and a sync updates price and availability", async ({ page }) => {
    await loginAdmin(page, E2E.superAdmin);
    await page.goto("/admin/imports");
    await expectHealthy(page);
    for (const label of ["Products discovered", "Pending review", "Approved", "Waiting for release", "Released", "Duplicates", "Errors"]) await expect(page.locator("main")).toContainText(new RegExp(label, "i"));
    await expect(page.locator("main")).toContainText(/Last synchronisation/i);

    // 1. Import: one good product, its twin (same seller, title and photo) and one without a price (a price is required, so it cannot be queued).
    await upload(page, `e2e-${stamp}.csv`, csv("$100.00"));
    await expect(page.locator('[role="status"]').first()).toContainText(/3 rows: 3 new/);
    await expect(page.locator('[role="status"]').first()).toContainText(/nothing was published/i);

    await page.goto(`/admin/imports/queue?status=all&q=${encodeURIComponent(SERIES)}`);
    const table = page.getByRole("table").first();
    const good = table.locator("tr", { hasText: `#${ID.good}` });
    const twin = table.locator("tr", { hasText: `#${ID.twin}` });
    const bad = table.locator("tr", { hasText: `#${ID.bad}` });
    await expect(good).toContainText(/pending review/i);
    await expect(good).toContainText("$75.00");
    await expect(good).toContainText(/source \$100\.00/);
    await expect(good).toContainText(/unique/i);
    await expect(twin).toContainText(/duplicate/i);
    await expect(twin).toContainText(/same seller, title and photo/i);
    await expect(bad).toContainText(/error/i);

    // Not public yet.
    expect((await page.request.get(`/store/${SLUG}`)).status()).toBe(404);

    // 2. Approve → Ready to Release (photo stored); still not public.
    await confirm(page, good, "Approve");
    await expect(good).toContainText(/ready to release/i, { timeout: 60_000 });
    expect((await page.request.get(`/store/${SLUG}`)).status()).toBe(404);

    // 3. Edit before release: SEO title, then it must be approved again.
    await good.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/admin\/imports\/[a-z0-9]+$/);
    await expectHealthy(page);
    await expect(page.locator("main")).toContainText(/Primary keyword/);
    await expect(page.locator("main")).toContainText(/Source price/);
    await page.locator('input[name="seoTitle"]').fill(`${SERIES} #12 CGC 9.4 (1975) — Bronze Age Comic for Sale`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('[role="status"]').filter({ hasText: /Saved/ })).toBeVisible({ timeout: 30_000 });
    await page.goto(`/admin/imports/queue?status=all&q=${encodeURIComponent(SERIES)}`);
    await expect(good).toContainText(/pending review/i);
    await confirm(page, good, "Approve");
    await expect(good).toContainText(/ready to release/i, { timeout: 60_000 });

    // 4. Release → public, as the store's own product at the marked-up price only.
    await confirm(page, good, "Release", "Release");
    await expect(good).toContainText(/released/i, { timeout: 60_000 });
    const res = await page.request.get(`/store/${SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("$75");
    expect(html).not.toMatch(/\$100(\.00)?\b/);
    expect(html.toLowerCase()).not.toContain("hipcomic");
    expect(html).toContain(`${SERIES} #12 CGC 9.4 (1975) — Bronze Age Comic for Sale`);
    expect(html).toContain(`IMP-${ID.good}`);

    // 5. Sync: the source price rises → the selling price follows; nothing is added twice.
    await upload(page, `e2e-${stamp}-b.csv`, csv("$120.00"));
    await expect(page.locator('[role="status"]').first()).toContainText(/0 new/);
    await expect(page.locator('[role="status"]').first()).toContainText(/price changes/);
    const html2 = await (await page.request.get(`/store/${SLUG}`)).text();
    expect(html2).toContain("$90");
    expect(html2).not.toContain("$75");

    // 6. Sync: sold at the source → our listing stops selling.
    await upload(page, `e2e-${stamp}-c.csv`, csv("$120.00", "sold"));
    const html3 = await (await page.request.get(`/store/${SLUG}`)).text();
    expect(html3).toMatch(/sold out|out of stock/i);

    // The log keeps every run.
    await page.goto("/admin/imports");
    await expect(page.getByRole("table").first()).toContainText(`e2e-${stamp}-c.csv`);
  });
});
