import { expect, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { E2E } from "./fixtures";

export function totpCode(secret = E2E.totpSecret): string {
  return new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();
}

/** Admin sign-in: password, then the TOTP challenge. */
export async function loginAdmin(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/login\/verify/);
  await page.locator('input[name="code"]').fill(totpCode());
  await page.getByRole("button", { name: /verify|continue|sign in/i }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.startsWith("/admin/login"));
}

/** Storefront sign-in for buyers and sellers (no 2FA on the fixtures). */
export async function loginUser(page: Page, email: string) {
  await page.goto("/account/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/account/login"));
}

/** Fails the test if a Next.js error boundary or the admin error page rendered. */
export async function expectHealthy(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/Application error|Something went wrong|Internal Server Error|Unhandled Runtime Error/i);
}
