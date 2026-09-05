/* Dynamic probe: security checks + console/network health + mobile/desktop screenshots. Run from the repo root. */
import { chromium } from "playwright";
import * as OTPAuth from "otpauth";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = process.argv[2];
const E2E = { password: "E2E-Password-2026!", totp: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", admin: "e2e-admin@example.com", buyer: "e2e-buyer@example.com", seller: "e2e-seller@example.com" };
const totp = () => new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(E2E.totp) }).generate();
const results = [];
const log = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function ctxWithLogin(email, admin = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${admin ? "admin/login" : "account/login"}`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", E2E.password);
  await page.click("button[type=submit]");
  if (admin) {
    await page.waitForURL(/\/admin\/login\/verify/, { timeout: 20000 });
    await page.fill("input[name=code]", totp());
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.startsWith("/admin/login"), { timeout: 20000 });
  } else {
    await page.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 20000 });
  }
  await page.close();
  return ctx;
}

// ---- 1. Open redirect when already signed in
{
  const ctx = await ctxWithLogin(E2E.buyer);
  const res = await ctx.request.get(`${BASE}/account/login?next=//evil.example/x`, { maxRedirects: 0 });
  const loc = res.headers()["location"] ?? "";
  log("signed-in /account/login?next=//evil is not an open redirect", !loc.startsWith("//") && !loc.includes("evil.example"), `${res.status()} loc=${loc}`);
  const res2 = await ctx.request.get(`${BASE}/account/register?next=//evil.example/x`, { maxRedirects: 0 });
  const loc2 = res2.headers()["location"] ?? "";
  log("signed-in /account/register?next=//evil is not an open redirect", !loc2.startsWith("//") && !loc2.includes("evil.example"), `${res2.status()} loc=${loc2}`);
  const exp = await ctx.request.get(`${BASE}/api/admin/export/orders`, { maxRedirects: 0 });
  log("buyer blocked from admin CSV export", exp.status() === 403 || exp.status() === 401, String(exp.status()));
  await ctx.close();
}

// ---- 2. Guest checks
{
  const ctx = await browser.newContext();
  const r = await ctx.request.get(`${BASE}/admin/setup`);
  log("setup page closed (admin exists)", r.status() === 404, String(r.status()));
  const s = await ctx.request.get(`${BASE}/api/auth/session`);
  log("guest session DTO is null", (await s.json()).user === null, "");
  const m = await ctx.request.get(`${BASE}/api/media/does-not-exist`);
  log("unknown media 404", m.status() === 404, String(m.status()));
  const j = await ctx.request.post(`${BASE}/api/jobs/run`);
  log("jobs endpoint needs a secret", j.status() === 401, String(j.status()));
  const w = await ctx.request.post(`${BASE}/api/webhooks/stripe`, { data: "{}", headers: { "content-type": "application/json" } });
  log("unsigned stripe webhook rejected", w.status() === 400, String(w.status()));
  const rb = await ctx.request.get(`${BASE}/robots.txt`);
  const rbTxt = await rb.text();
  log("robots.txt served", rb.status() === 200, rbTxt.split("\n").slice(0, 6).join(" | "));
  const sm = await ctx.request.get(`${BASE}/sitemap.xml`);
  const smTxt = await sm.text();
  log("sitemap.xml served", sm.status() === 200, `${(smTxt.match(/<url>/g) || []).length} urls`);
  await ctx.close();
}

// ---- 3. Page health + screenshots
const pages = {
  guest: ["/", "/store", "/store/e2e-test-comic-1", "/cart", "/checkout", "/account/login", "/account/register", "/account/reset", "/track-order", "/services", "/services/grading-submission", "/about", "/contact", "/faq", "/policies/shipping", "/support", "/appeal", "/sellers/e2e-seller-shop", "/nope-404"],
  buyer: ["/account", "/account/orders", "/account/profile", "/account/addresses", "/account/security", "/account/notifications", "/account/support", "/account/payments", "/account/reviews", "/account/seller"],
  seller: ["/dashboard", "/dashboard/listings", "/dashboard/listings/new", "/dashboard/orders", "/dashboard/balance", "/dashboard/returns", "/dashboard/disputes", "/dashboard/reviews", "/dashboard/performance", "/dashboard/settings"],
  admin: ["/admin", "/admin/orders", "/admin/products", "/admin/users", "/admin/sellers", "/admin/finance", "/admin/finance/payouts", "/admin/settings/general", "/admin/settings/commerce", "/admin/support", "/admin/moderation", "/admin/reports", "/admin/system", "/admin/admins", "/admin/audit", "/admin/promotions", "/admin/shipping", "/admin/notifications"],
};
const health = [];
async function visit(ctx, path, label, viewports) {
  for (const vp of viewports) {
    const page = await ctx.newPage();
    await page.setViewportSize(vp);
    const consoleErrors = [];
    const failed = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 160)));
    page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
    page.on("response", (r) => {
      if (r.status() >= 500) failed.push(`${r.status()} ${r.url().slice(0, 100)}`);
    });
    let status = 0;
    try {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
      status = res?.status() ?? 0;
    } catch (e) {
      failed.push("nav: " + String(e).slice(0, 120));
    }
    await page.waitForTimeout(400);
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    const boundary = /Application error|Something went wrong|Unhandled Runtime Error|Internal Server Error/i.test(body);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1).catch(() => false);
    const name = `${label}_${path.replace(/[^a-z0-9]+/gi, "_") || "home"}_${vp.width}`;
    await page.screenshot({ path: `${OUT}/shots/${name}.png`, fullPage: vp.width < 500 }).catch(() => {});
    health.push({ label, path, width: vp.width, status, boundary, hscroll, consoleErrors: [...new Set(consoleErrors)].slice(0, 5), failed: [...new Set(failed)].slice(0, 5), url: page.url() });
    await page.close();
  }
}
const vps = [{ width: 390, height: 844 }, { width: 1366, height: 900 }];
{
  const ctx = await browser.newContext();
  for (const p of pages.guest) await visit(ctx, p, "guest", vps);
  await ctx.close();
}
{
  const ctx = await ctxWithLogin(E2E.buyer);
  for (const p of pages.buyer) await visit(ctx, p, "buyer", vps);
  await ctx.close();
}
{
  const ctx = await ctxWithLogin(E2E.seller);
  for (const p of pages.seller) await visit(ctx, p, "seller", vps);
  await ctx.close();
}
{
  const ctx = await ctxWithLogin(E2E.admin, true);
  for (const p of pages.admin) await visit(ctx, p, "admin", vps);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/health.json`, JSON.stringify({ results, health }, null, 1));
const bad = health.filter((h) => h.boundary || h.hscroll || h.consoleErrors.length || h.failed.length || h.status >= 500 || (h.status === 404 && !h.path.includes("nope")));
console.log(`\n${health.length} page loads; ${bad.length} with issues`);
for (const h of bad) console.log(`  ${h.label} ${h.path} @${h.width}: status=${h.status} boundary=${h.boundary} hscroll=${h.hscroll} console=${JSON.stringify(h.consoleErrors)} failed=${JSON.stringify(h.failed)}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
