/**
 * Builds the topic backlog against the local database and checks how it behaves:
 * it works in steps and continues where it stopped, a second pass adds nothing, no two topics
 * share a keyword, and nothing that existed before is deleted or changed.
 *
 *   npx tsx --conditions=react-server tests/integration/content-backlog.ts
 *
 * No AI and no paid API is called. The backlog rows it creates are the real ones (the same job
 * builds them on the server), so they are left in place.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");

const results: { ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = new PrismaClient();
  const { syncBacklog, backlogSummary, BACKLOG_DAY } = await import("@/lib/content/backlog");
  const { planDay } = await import("@/lib/content/plan");
  const before = { articles: await db.article.count(), otherTasks: await db.contentTask.count({ where: { day: { not: BACKLOG_DAY } } }), newest: (await db.article.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt.getTime() };

  // A first pass, deliberately interrupted every 150 topics.
  let step = await syncBacklog({ restart: true, maxItems: 150 });
  const firstCursor = step.state.cursor;
  check("a step stops where it was told to", firstCursor === Math.min(150, step.state.total) && !step.done === step.state.total > 150, `cursor ${firstCursor} of ${step.state.total}`);
  let steps = 1;
  let last = firstCursor;
  let resumed = true;
  while (!step.done && steps < 400) {
    step = await syncBacklog({ maxItems: 150 });
    if (step.state.cursor <= last) resumed = false;
    last = step.state.cursor;
    steps += 1;
  }
  check("every later step continues from the previous position", resumed && step.done && step.state.cursor === step.state.total, `${steps} steps, ${step.state.total} candidates`);
  const s = step.state;
  console.log(`     pass: ${s.clusters} SEO Intelligence recommendations → ${s.total} pages planned; ${s.added} queued, ${s.updates} improve-existing entries, ${s.duplicates} duplicates dropped, ${s.notRelevant} not about collectible comics, ${s.refreshed} refreshed`);

  const rows = await db.contentTask.findMany({ where: { day: BACKLOG_DAY }, select: { norm: true, kind: true, status: true, title: true, keyword: true, intent: true, format: true, category: true, priority: true, source: true, secondaryJson: true, volume: true, difficulty: true, score: true } });
  const fresh = rows.filter((r) => r.kind === "new" && r.status === "queued");
  check("every queued topic carries the agreed fields", fresh.every((r) => r.title && r.keyword && r.intent && r.format && r.category && r.priority && r.source && r.secondaryJson.startsWith("[")), `${fresh.length} topics`);
  check("no two topics share a keyword or a title", new Set(fresh.map((r) => r.norm)).size === fresh.length && new Set(fresh.map((r) => r.title!.toLowerCase())).size === fresh.length, `${fresh.length - new Set(fresh.map((r) => r.title!.toLowerCase())).size} repeated titles`);
  const titles = await db.article.findMany({ select: { title: true } });
  check("no queued topic repeats an existing article's headline", !fresh.some((r) => titles.some((t) => t.title.toLowerCase() === r.title!.toLowerCase())), "");

  // A second pass over the same data adds nothing.
  const countBefore = rows.length;
  step = await syncBacklog({ restart: true, budgetMs: 120_000 });
  check("a second pass adds nothing", step.done && step.state.added === 0 && step.state.updates === 0 && (await db.contentTask.count({ where: { day: BACKLOG_DAY } })) === countBefore, `added ${step.state.added}, updates ${step.state.updates}`);

  const after = { articles: await db.article.count(), otherTasks: await db.contentTask.count({ where: { day: { not: BACKLOG_DAY } } }), newest: (await db.article.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }))?.updatedAt.getTime() };
  check("articles and pipeline tasks that existed are untouched", after.articles === before.articles && after.otherTasks === before.otherTasks && after.newest === before.newest, JSON.stringify(after));

  const sum = await backlogSummary(45);
  console.log(`\nBACKLOG: ${sum.queued} topics queued, ${sum.updates} improve-existing entries; ${sum.eligibleNow} have measured demand and a score of 45+ (the pipeline writes these first)`);
  console.log("by content type:", JSON.stringify(sum.byFormat));
  console.log("by category:", JSON.stringify(sum.byCategory));
  console.log("by priority:", JSON.stringify(sum.byPriority));
  for (const r of [...fresh].sort((a, b) => b.score - a.score).filter((_, i) => i % Math.max(1, Math.floor(fresh.length / 14)) === 0).slice(0, 14)) console.log(`  [${r.priority.padEnd(10)} ${String(r.score).padStart(3)}] ${r.format.padEnd(10)} ${r.category.padEnd(18)} ${r.keyword.padEnd(34).slice(0, 34)} → ${r.title}`);

  // The daily plan takes its topics out of this queue (no AI call here: planning only).
  if (process.argv.includes("--plan")) {
    const plan = await planDay({ limit: 5 });
    const moved = await db.contentTask.count({ where: { day: plan.day, status: "planned", source: { not: null } } });
    check("the daily plan moves queued topics into the day's work", plan.created === 0 || moved > 0, `${plan.created} planned, ${moved} came from the queue`);
  }
  await db.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
