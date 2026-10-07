/**
 * Runs the content pipeline by hand against the local database, with the real AI service.
 *
 *   npx tsx --conditions=react-server tests/integration/content-run.ts plan [limit]
 *   npx tsx --conditions=react-server tests/integration/content-run.ts write <taskId|next> [count]
 *   npx tsx --conditions=react-server tests/integration/content-run.ts show <slug>
 *   npx tsx --conditions=react-server tests/integration/content-run.ts tick
 *
 * `write` uses direct requests (no batch), so an article comes back in about a minute. It
 * spends real API credit: a few cents per article, more for news (web search).
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  const db = new PrismaClient();
  if (cmd === "plan") {
    const { planDay } = await import("@/lib/content/plan");
    const r = await planDay({ limit: a ? Number(a) : undefined });
    console.log(r.summary);
    for (const d of r.duplicates.slice(0, 12)) console.log(`  covered: "${d.keyword}" → ${d.existing} (${d.why})`);
    const tasks = await db.contentTask.findMany({ where: { day: r.day }, orderBy: { score: "desc" } });
    for (const t of tasks) console.log(`  ${t.id} ${String(t.score).padStart(3)} ${t.format.padEnd(10)} ${t.category.padEnd(20)} vol=${t.volume ?? "-"} kd=${t.difficulty ?? "-"} | ${t.keyword} | ${t.reason}`);
  } else if (cmd === "write") {
    const { runTaskNow } = await import("@/lib/content/engine");
    const ids = a && a !== "next" && a !== "news" ? [a] : (await db.contentTask.findMany({ where: { status: "planned", ...(a === "news" ? { kind: "news" } : { kind: "new" }) }, orderBy: { score: "desc" }, take: Number(b ?? 1) })).map((t) => t.id);
    for (const id of ids) {
      const t0 = Date.now();
      const r = await runTaskNow(id);
      const task = await db.contentTask.findUniqueOrThrow({ where: { id } });
      console.log(`\n== ${task.keyword} → ${r.status} in ${Math.round((Date.now() - t0) / 1000)}s ${r.error ?? ""} usage ${task.usageJson}`);
      if (r.articleId) {
        const art = await db.article.findUniqueOrThrow({ where: { id: r.articleId } });
        console.log(`   /guides/${art.slug} [${art.status}] "${art.title}" ${art.wordCount} words, quality ${art.seoScore}${art.claimLevel ? `, ${art.claimLevel}` : ""}${art.reviewNote ? `\n   held: ${art.reviewNote}` : ""}`);
      }
    }
  } else if (cmd === "show") {
    const art = await db.article.findUniqueOrThrow({ where: { slug: a } });
    console.log(`# ${art.title}\nseoTitle: ${art.seoTitle}\nmeta: ${art.metaDescription}\nkeyword: ${art.primaryKeyword} | secondary ${art.secondaryJson}\nanswer: ${art.answer}\nsources: ${art.sourcesJson}\nfaq: ${art.faqJson}\n\n${art.body}\n\nQUALITY ${art.qualityJson}`);
  } else if (cmd === "tick") {
    const { contentTick } = await import("@/lib/content/engine");
    console.log(await contentTick(60_000));
  } else console.log("plan | write | show | tick");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
