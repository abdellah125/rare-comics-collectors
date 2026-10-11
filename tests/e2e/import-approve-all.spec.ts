import { expect, test } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/** The "Approve all pending" button explains what it does before anything happens; cancelling changes nothing. */
test("approve all pending shows the count and what happens next", async ({ page }) => {
  await loginAdmin(page, E2E.superAdmin);
  await page.goto("/admin/imports/queue");
  await expectHealthy(page);
  const button = page.getByRole("button", { name: /^Approve all [\d,]+ pending$/ });
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("Approving does not publish anything");
  await expect(dialog.getByRole("button", { name: "Approve all", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(button).toBeVisible();
});
