import { expect, test, type Page } from "@playwright/test";
import { expectHealthy } from "./helpers";

const WA = /^https:\/\/wa\.me\/14185066697\?text=/;
/** The welcome popup opens after a few seconds and would sit over what these tests click. */
const quiet = (page: Page) => page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));
const text = (href: string | null) => decodeURIComponent((href ?? "").split("?text=")[1] ?? "");

test.describe("WhatsApp and chat", () => {
  test("WhatsApp is in the header, the footer and a floating button, with a message for the page", async ({ page }) => {
    await quiet(page);
    await page.goto("/");
    await expectHealthy(page);
    for (const id of ["header-whatsapp", "footer-whatsapp", "whatsapp-float"]) {
      const link = page.getByTestId(id);
      await expect(link).toHaveAttribute("href", WA);
      await expect(link).toHaveAttribute("target", "_blank");
    }
    await page.goto("/services/appraisal-and-valuation");
    expect(text(await page.getByTestId("whatsapp-button").first().getAttribute("href"))).toMatch(/free appraisal/);
    expect(text(await page.getByTestId("whatsapp-float").getAttribute("href"))).toMatch(/free appraisal/);
    await page.goto("/services/grading-submission");
    expect(text(await page.getByTestId("whatsapp-button").first().getAttribute("href"))).toMatch(/grading/);
    await page.goto("/contact");
    await expect(page.getByTestId("whatsapp-button").first()).toHaveAttribute("href", WA);
    await expect(page.locator("main")).toContainText("+1 418-506-6697");
  });

  test("the chat panel shows the opening status and takes a message", async ({ page }) => {
    await quiet(page);
    await page.goto("/about");
    await page.getByTestId("chat-launcher").click();
    const panel = page.locator("#chat-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("chat-status")).toContainText(/We're (open now|closed right now)/);
    await expect(page.getByTestId("chat-whatsapp")).toHaveAttribute("href", WA);
    await expect(panel.locator('a[href^="mailto:"]')).toBeVisible();
    await page.getByTestId("chat-write").click();
    await panel.locator('[name="name"]').fill("Chat Tester");
    await panel.locator('[name="email"]').fill("chat-tester@example.com");
    await panel.locator('[name="body"]').fill("Do you have Amazing Spider-Man 300 in 9.8?");
    await panel.getByRole("button", { name: "Send message" }).click();
    await expect(panel).toContainText(/Message received/, { timeout: 30_000 });
    await expect(panel).toContainText(/TCK-/);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });
});

test.describe("languages", () => {
  test("a language URL is translated, canonical for itself and linked to the others", async ({ page }) => {
    await quiet(page);
    await page.goto("/fr");
    await expectHealthy(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("navigation", { name: "Primary" }).or(page.locator("header nav").first())).toContainText("Boutique");
    await expect(page.locator("h1")).toContainText("Achetez des comics gradés.");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/fr$/);
    for (const lang of ["en", "es", "fr", "de", "x-default"]) await expect(page.locator(`link[rel="alternate"][hreflang="${lang}"]`)).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute("href", /\/de$/);
    // A page that is not translated in full stays canonical to its English URL and lists no alternates.
    await page.goto("/fr/services");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/services$/);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });

  test("the switcher moves between language versions and back to English", async ({ page }) => {
    await quiet(page);
    await page.goto("/store");
    await expect(page.locator("h1")).toContainText("Graded comics for sale");
    const select = page.locator("footer").getByTestId("language-select");
    await select.selectOption("de");
    await page.waitForURL(/\/de\/store$/);
    await expect(page.locator("h1")).toContainText("Gegradete Comics kaufen");
    await expect(page.getByRole("button", { name: /In den Warenkorb/ }).first()).toBeVisible();
    // The choice is remembered on pages without a language URL.
    await page.goto("/cart");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.goto("/de/store");
    await page.locator("footer").getByTestId("language-select").selectOption("en");
    await page.waitForURL((url) => url.pathname === "/store");
    await expect(page.locator("h1")).toContainText("Graded comics for sale");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("by country", () => {
  test("a first visit from Germany is in German and in euros; a crawler from there is not", async ({ browser }) => {
    const german = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "DE" }, locale: "de-DE" });
    const page = await german.newPage();
    await quiet(page);
    await page.goto("/store");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("h1")).toContainText("Gegradete Comics kaufen");
    await expect(page.locator("article").first()).toContainText("€");
    await expect(page.locator("footer select").first()).toHaveValue("EUR");
    // Their own choice wins over the country.
    await page.locator("footer select").first().selectOption("USD");
    await expect(page.locator("article").first()).toContainText("$", { timeout: 20_000 });
    await german.close();

    const bot = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "DE" }, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
    const crawl = await bot.newPage();
    await crawl.goto("/store");
    await expect(crawl.locator("html")).toHaveAttribute("lang", "en");
    await expect(crawl.locator("article").first()).toContainText("$");
    await bot.close();
  });

  test("a visitor from the UK sees pounds in English, and an unlisted country sees dollars", async ({ browser }) => {
    const uk = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "GB" } });
    const page = await uk.newPage();
    await page.goto("/store");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("article").first()).toContainText("£");
    await uk.close();
    const br = await browser.newContext({ extraHTTPHeaders: { "x-vercel-ip-country": "BR" } });
    const page2 = await br.newPage();
    await page2.goto("/store");
    await expect(page2.locator("article").first()).toContainText("$");
    await expect(page2.locator("footer select").first()).toHaveValue("USD");
    await br.close();
  });
});
