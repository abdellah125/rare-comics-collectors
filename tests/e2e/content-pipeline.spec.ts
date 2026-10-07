import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./fixtures";
import { expectHealthy, loginAdmin } from "./helpers";

/**
 * The Guides section and the content dashboard, with articles placed in the database the way the
 * pipeline stores them (no AI service is called from these tests).
 */
const db = new PrismaClient();
const stamp = Date.now().toString(36);
const NEWS = `e2e-news-cgc-announcement-${stamp}`;
const PENDING = `e2e-pending-wolverine-guide-${stamp}`;
const LATER = `e2e-scheduled-guide-${stamp}`;
const body = (subject: string) => `${subject} is covered here for the test.\n\n## What happened\n\nThe grading company published the change on its own site. See [what a CGC label means](/guides/what-is-a-cgc-graded-comic).\n\n## What it means for collectors\n\nThis section is analysis. Browse [graded comics for sale](/store).`;
const base = { topic: "news", origin: "auto", tagsJson: "[]", charactersJson: "[]", titlesJson: "[]", publishersJson: "[]", relatedJson: "[]", wordCount: 60, seoScore: 92, searchVolume: 1300, keywordDifficulty: 14, opportunityScore: 81, intent: "informational", qualityJson: JSON.stringify({ score: 92, internalLinks: 2, writer: "test-writer", checks: [] }) };
let taskId = "";

test.beforeAll(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  await db.article.create({ data: { ...base, slug: NEWS, title: `E2E: CGC announces a label change ${stamp}`, answer: "CGC announced a change to its label on its own website, effective next month.", body: body("The announcement"), category: "comic-news", format: "news", primaryKeyword: "cgc label change", status: "published", publishedAt: new Date(Date.now() - 60_000), eventDate: new Date(), claimLevel: "confirmed", sourcesJson: JSON.stringify([{ label: "CGC: official announcement", url: "https://www.cgccomics.com/news/" }]), faqJson: "[]", seoTitle: `CGC Label Change Announced ${stamp}`, metaDescription: "CGC announced a change to its label. What changes, when it takes effect and what it means for collectors who buy and sell graded comic books.", imageAlt: "Header plate for a news update about CGC", indexedAt: new Date() } });
  const pending = await db.article.create({ data: { ...base, topic: "characters", slug: PENDING, title: `E2E: Wolverine collecting notes ${stamp}`, answer: "A test article that is waiting for review before it can be published on the site.", body: body("Wolverine"), category: "character-stories", format: "article", primaryKeyword: "wolverine key issues", status: "pending_review", reviewNote: "Prices, percentages and counts come from the supplied facts: not in the supplied facts: $5,000", faqJson: JSON.stringify([{ q: "Is this a test?", a: "Yes, this article exists only for the automated test." }, { q: "Will it be removed?", a: "Yes, the test removes it when it finishes." }]) } });
  await db.article.create({ data: { ...base, topic: "collecting", slug: LATER, title: `E2E: A guide scheduled for later ${stamp}`, answer: "A test article that is scheduled and must not be visible before its time comes.", body: body("Scheduling"), category: "collecting-guides", format: "guide", primaryKeyword: "scheduled guide", status: "published", publishedAt: new Date(Date.now() + 6 * 3_600_000), faqJson: "[]" } });
  const task = await db.contentTask.create({ data: { day: new Date().toISOString().slice(0, 10), kind: "new", status: "failed", keyword: `e2e failed topic ${stamp}`, norm: `e2e failed topic ${stamp}`, intent: "informational", volume: 320, difficulty: 9, score: 77, category: "key-issues", format: "article", reason: "informational intent; 320 searches a month.", error: "Quality gate: Headline is not one the site already has: same as an existing headline", articleId: pending.id } });
  taskId = task.id;
});

test.afterAll(async () => {
  await db.contentTask.deleteMany({ where: { OR: [{ id: taskId }, { keyword: { contains: stamp } }] } });
  await db.article.deleteMany({ where: { slug: { in: [NEWS, PENDING, LATER] } } });
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  await db.$disconnect();
});

const quiet = (page: Page) => page.addInitScript(() => window.sessionStorage.setItem("rcc_welcome_offer_dismissed", "1"));

test("the guides hub, categories, search, feeds and hub addresses", async ({ page }) => {
  test.setTimeout(120_000);
  await quiet(page);
  const res = await page.goto("/guides");
  await expectHealthy(page);
  // A page of sections, not the whole knowledge base.
  expect((await res!.body()).length).toBeLessThan(600_000);
  await expect(page.locator("h1")).toHaveText("Guides, news & stories");
  for (const heading of ["Featured guides", "Latest news", "Most popular guides", "Grading guides", "Browse by category", "Everything, newest first"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(page.locator("main article").filter({ hasText: `CGC announces a label change ${stamp}` }).first()).toContainText("Confirmed");
  // Not yet due, and not approved: neither is on the site.
  await expect(page.locator("main")).not.toContainText(`scheduled for later ${stamp}`);
  await expect(page.locator("main")).not.toContainText(`Wolverine collecting notes ${stamp}`);
  // Pagination is by address, 24 at a time.
  await page.getByRole("link", { name: "Older →" }).click();
  await page.waitForURL(/\/guides\?page=2/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(await page.locator("main article").count()).toBeLessThanOrEqual(24);

  // Search and category filter.
  await page.goto("/guides");
  await page.getByLabel("Search the guides").fill("label change");
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/q=label\+change/);
  await expect(page.locator("main")).toContainText(`CGC announces a label change ${stamp}`);
  await page.goto("/guides?category=comic-news");
  await expect(page.locator("#results-heading")).toContainText("in Comic News");

  // Category page with structured data.
  await page.goto("/guides/category/comic-news");
  await expect(page.locator("h1")).toHaveText("Comic News");
  await expect(page.locator("main")).toContainText(`CGC announces a label change ${stamp}`);
  const list = JSON.parse((await page.locator("#category-page").textContent())!) as { mainEntity: { itemListElement: unknown[] } };
  expect(list.mainEntity.itemListElement.length).toBeGreaterThan(0);
  expect((await page.request.get("/guides/category/not-a-category")).status()).toBe(404);

  // Hub addresses lead to the page that already is the hub.
  for (const [from, to] of [["/guides/cgc-grading", "/guides/category/cgc-cbcs"], ["/guides/comic-book-values", "/guides/category/values-market"], ["/guides/spider-man", "/characters/spider-man"]]) {
    const r = await page.request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(308);
    expect(r.headers().location, from).toBe(to);
  }

  // Feed and sitemaps.
  const feed = await (await page.request.get("/guides/feed.xml")).text();
  expect(feed).toContain(`/guides/${NEWS}`);
  expect(feed).not.toContain(LATER);
  expect(feed).not.toContain(PENDING);
  const news = await (await page.request.get("/sitemaps/news.xml")).text();
  expect(news).toContain(`/guides/${NEWS}`);
  expect(news).toContain("<news:publication_date>");
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain("/sitemaps/news.xml");
  expect(await (await page.request.get("/sitemaps/site.xml")).text()).toContain("/guides/category/comic-news");
});

test("a news article says how well it is supported, cites its source and carries valid structured data", async ({ page }) => {
  await quiet(page);
  await page.goto(`/guides/${NEWS}`);
  await expectHealthy(page);
  await expect(page).toHaveTitle(new RegExp(`CGC Label Change Announced ${stamp}`));
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /What changes, when it takes effect/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/guides/${NEWS}$`));
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", "Header plate for a news update about CGC");
  await expect(page.getByTestId("claim-note")).toContainText(/^Confirmed: the facts in this update are stated by the official or primary sources/);
  await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "CGC: official announcement" })).toHaveAttribute("href", "https://www.cgccomics.com/news/");
  await expect(page.locator("main")).toContainText(/Drafted with AI assistance/);
  await expect(page.getByRole("img", { name: "Header plate for a news update about CGC" })).toBeVisible();
  const ld = JSON.parse((await page.locator("#guide-article").textContent())!) as Record<string, unknown>;
  expect(ld["@type"]).toBe("NewsArticle");
  expect(ld.citation).toEqual(["https://www.cgccomics.com/news/"]);
  for (const k of ["headline", "datePublished", "dateModified", "author", "publisher", "image", "mainEntityOfPage"]) expect(ld[k], k).toBeTruthy();
  const crumbs = JSON.parse((await page.locator("#guide-breadcrumbs").textContent())!) as { itemListElement: { name: string }[] };
  expect(crumbs.itemListElement.map((c) => c.name)).toContain("Comic News");
  // Neither a scheduled nor an unapproved article has a page.
  expect((await page.request.get(`/guides/${LATER}`)).status()).toBe(404);
  expect((await page.request.get(`/guides/${PENDING}`)).status()).toBe(404);
  // Phone width: nothing wider than the screen.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/guides/${NEWS}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.goto("/guides");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the content dashboard lists articles with their figures and lets staff approve, schedule, unpublish and reject", async ({ page }) => {
  test.setTimeout(240_000);
  await loginAdmin(page, E2E.superAdmin);
  await db.rateLimitBucket.deleteMany({ where: { key: { startsWith: "2fa:" } } });
  await page.goto(`/admin/content?q=${stamp}`);
  await expectHealthy(page);
  await expect(page.locator("h1")).toHaveText("Content pipeline");
  const row = (text: string) => page.getByRole("table").first().locator("tr", { hasText: text });
  const pending = row(`Wolverine collecting notes ${stamp}`);
  await expect(pending).toContainText("wolverine key issues");
  await expect(pending).toContainText("1,300");
  await expect(pending).toContainText("14");
  await expect(pending).toContainText("informational");
  await expect(pending).toContainText("81");
  await expect(pending).toContainText("92");
  await expect(pending).toContainText(/pending review/i);
  await expect(pending).toContainText(/not in the supplied facts/);
  await expect(row(`scheduled for later ${stamp}`)).toContainText(/scheduled/i);
  await expect(row(`CGC announces a label change ${stamp}`)).toContainText(/Submitted/);

  const confirm = async (r: ReturnType<typeof row>, button: string, reason?: string) => {
    await r.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.locator("dialog[open]");
    if (reason !== undefined) await dialog.locator("textarea").fill(reason);
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  };

  // Approve: the article is on the site.
  await confirm(pending, "Approve");
  await expect(pending).toContainText(/published/i, { timeout: 30_000 });
  expect((await page.request.get(`/guides/${PENDING}`)).status()).toBe(200);
  // Unpublish: it is gone again.
  await confirm(pending, "Unpublish");
  await expect(pending).toContainText(/draft/i, { timeout: 30_000 });
  expect((await page.request.get(`/guides/${PENDING}`)).status()).toBe(404);
  // Schedule: a bad date is refused, a future one is kept and the article stays off the site.
  await pending.getByRole("button", { name: "Schedule", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("textarea").fill("tomorrow");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("body")).toContainText(/YYYY-MM-DD HH:MM/);
  const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16).replace("T", " ");
  await confirm(pending, "Schedule", future);
  await expect(pending).toContainText(/scheduled/i, { timeout: 30_000 });
  expect((await page.request.get(`/guides/${PENDING}`)).status()).toBe(404);
  // Reject, with the reason on record.
  await confirm(pending, "Reject", "Not accurate enough");
  await expect(pending).toContainText(/rejected/i, { timeout: 30_000 });
  await expect(pending).toContainText("Not accurate enough");
  expect((await db.article.findUniqueOrThrow({ where: { slug: PENDING } })).status).toBe("rejected");

  // Topics: why each was chosen and what went wrong, with a way to try again.
  await page.goto(`/admin/content?tab=topics&q=${stamp}`);
  const topic = page.getByRole("table").first().locator("tr", { hasText: `e2e failed topic ${stamp}` });
  await expect(topic).toContainText(/failed/i);
  await expect(topic).toContainText(/Quality gate/);
  await expect(topic.getByRole("button", { name: "Try again" })).toBeVisible();

  // Backlog: queued topics with their SEO figures; removing one keeps it out for good.
  const queued = await db.contentTask.create({ data: { day: "backlog", kind: "new", status: "queued", keyword: `e2e queued keyword ${stamp}`, norm: `e2e queued keyword ${stamp}`, title: `E2E Queued Topic ${stamp}: A Collector's Guide`, secondaryJson: JSON.stringify(["second phrase", "third phrase"]), intent: "commercial", volume: 880, difficulty: 21, score: 73, category: "buying-guides", format: "guide", priority: "high", source: "SEO Intelligence cluster e2e (keyword from: gsc)", reason: "commercial intent; 880 searches a month." } });
  await page.goto(`/admin/content?tab=backlog&q=${stamp}`);
  await expectHealthy(page);
  await expect(page.getByTestId("backlog-state")).toBeVisible();
  const item = page.getByRole("table").first().locator("tr", { hasText: `E2E Queued Topic ${stamp}` });
  for (const text of [`e2e queued keyword ${stamp}`, "second phrase, third phrase", "commercial", "Guide · Buying", "high", "880", "21", "SEO Intelligence cluster e2e", "Queued"]) await expect(item).toContainText(text);
  await confirm(item, "Remove");
  await expect(item).toHaveCount(0, { timeout: 30_000 });
  expect((await db.contentTask.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("skipped");

  // Settings: saved on the server and read back.
  await page.goto("/admin/content?tab=settings");
  const before = (await db.setting.findUnique({ where: { key: "content.dailyTarget" } }))?.value ?? null;
  await page.locator('[name="dailyTarget"]').fill("37");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("body")).toContainText("Saved.");
  expect((await db.setting.findUniqueOrThrow({ where: { key: "content.dailyTarget" } })).value).toBe("37");
  if (before === null) await db.setting.delete({ where: { key: "content.dailyTarget" } });
  else await db.setting.update({ where: { key: "content.dailyTarget" }, data: { value: before } });

  // The public cannot reach the dashboard or its actions.
  await page.context().clearCookies();
  await page.goto("/admin/content");
  await expect(page).toHaveURL(/\/admin\/login/);
});
