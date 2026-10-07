import "server-only";
import type { ContentTask } from "@prisma/client";
import { db } from "@/lib/db";
import { isString, parseJsonArray } from "@/lib/json";
import { getSettings } from "@/lib/settings";
import { pingIndexNow } from "@/lib/indexnow";
import { normPhrase } from "@/lib/seo/intel/entities";
import { CHECKER_MODEL, WRITER_MODEL, batchResults, contentAiConfigured, createBatch, getBatch, logAiUsage, message, searchEvidence, type MessageParams, type MessageResult } from "@/lib/content/anthropic";
import { FORMATS, categoryBySlug, isFormat, type ContentFormat } from "@/lib/content/categories";
import { PRIMARY_NEWS_DOMAINS, SECONDARY_NEWS_DOMAINS, applyVerdict, checkerSystem, checkerUser, claimLevelFor, cleanSlug, newsSystem, newsUser, parseDraft, parseVerdict, writerSystem, writerUser, type Brief, type Verdict } from "@/lib/content/prompt";
import { checkQuality, type Draft, type QualityContext, type QualityReport } from "@/lib/content/quality";
import { dayKey, planDay } from "@/lib/content/plan";

/**
 * The content pipeline after planning: write → quality gate → fact check → publish or hold.
 *
 *   planned → writing → written → checking → done
 *                 ↘ failed / skipped (with the reason kept on the task)
 *
 * Writing and checking go out as batches and are collected when they finish, so each step here
 * is short and can be repeated safely: every function picks up whatever is waiting and stops
 * when its time is up.
 */
const STANDARD_LINKS = ["/store", "/guides", "/collections", "/publishers", "/characters", "/services", "/contact"];

type Stored = { draft: Draft; report: Omit<QualityReport, "body">; facts: string[]; allowedLinks: string[]; allowedSources: string[]; sourceText: string; /** news: the cited page itself could be fetched and given to the fact-checker */ sourceRead?: boolean };

const briefOf = (t: Pick<ContentTask, "briefJson">) => JSON.parse(t.briefJson) as Brief;
const formatOf = (t: Pick<ContentTask, "format">): ContentFormat => (isFormat(t.format) ? t.format : "article");

function writeParams(t: ContentTask): MessageParams {
  const brief = briefOf(t);
  if (t.kind === "news") return { model: WRITER_MODEL, max_tokens: 3000, system: newsSystem(), messages: [{ role: "user", content: newsUser(brief) }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_domains: [...PRIMARY_NEWS_DOMAINS, ...SECONDARY_NEWS_DOMAINS] }] };
  return { model: WRITER_MODEL, max_tokens: FORMATS[formatOf(t)].maxTokens, system: writerSystem(), messages: [{ role: "user", content: writerUser(brief) }] };
}

function checkParams(stored: Stored): MessageParams {
  return { model: CHECKER_MODEL, max_tokens: 2500, system: checkerSystem(), messages: [{ role: "user", content: checkerUser(stored.draft, stored.facts, stored.sourceText || undefined) }] };
}

async function qualityContext(t: ContentTask, brief: Brief, extra: { sources: string[]; factsText: string }): Promise<QualityContext> {
  const related = brief.links.filter((l) => l.kind === "guide").map((l) => l.url.replace("/guides/", ""));
  // Headlines of other machine-written pieces, including drafts from the same batch that are not articles yet.
  const [recentArticles, siblingTasks] = await Promise.all([
    db.article.findMany({ where: { origin: "auto", status: { not: "rejected" }, ...(t.articleId ? { id: { not: t.articleId } } : {}) }, orderBy: { createdAt: "desc" }, take: 150, select: { title: true } }),
    db.contentTask.findMany({ where: { id: { not: t.id }, status: { in: ["written", "checking"] }, draftJson: { not: null } }, orderBy: { updatedAt: "desc" }, take: 120, select: { draftJson: true } }),
  ]);
  const siblingTitles = siblingTasks.flatMap((s) => { try { return [(JSON.parse(s.draftJson!) as Stored).draft.title]; } catch { return []; } });
  const [titles, bodies, sameCategory] = await Promise.all([
    db.article.findMany({ where: { status: { not: "rejected" }, ...(t.articleId ? { id: { not: t.articleId } } : {}) }, select: { title: true } }),
    related.length ? db.article.findMany({ where: { slug: { in: related } }, select: { slug: true, body: true } }) : Promise.resolve([]),
    db.article.findMany({ where: { category: t.category, origin: "auto", status: { not: "rejected" }, ...(t.articleId ? { id: { not: t.articleId } } : {}) }, orderBy: { createdAt: "desc" }, take: 12, select: { slug: true, body: true } }),
  ]);
  return { format: formatOf(t), allowedLinks: new Set([...STANDARD_LINKS, ...brief.links.map((l) => l.url)]), allowedSources: new Set(extra.sources), factsText: `${brief.facts.join("\n")}\n${extra.factsText}`, existingTitles: [...titles.map((a) => a.title), ...siblingTitles], subject: brief.subject, recentTitles: [...recentArticles.map((a) => a.title), ...siblingTitles], corpus: [...bodies, ...sameCategory] };
}

/**
 * The text of a page a news item cites, fetched by this server so the fact-checker reads the
 * source itself and not the writer's account of it. Empty when the page cannot be read.
 */
export async function fetchSourceText(url: string, hint: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "RareComicsCollectors-FactCheck/1.0 (+https://www.rarecomicscollectors.com/contact)", accept: "text/html" }, signal: AbortSignal.timeout(8_000), redirect: "follow", cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return "";
    const html = (await res.text()).slice(0, 600_000);
    const text = html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&[a-z0-9#]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Start near the first distinctive word of the headline, so the excerpt is the story and not the menu.
    const word = hint.split(/\s+/).find((w) => w.length >= 6 && text.includes(w));
    const at = word ? Math.max(0, text.indexOf(word) - 300) : 0;
    return text.slice(at, at + 7_000);
  } catch {
    return "";
  }
}

const usageOf = (r: MessageResult) => ({ in: r.usage.input_tokens ?? 0, out: r.usage.output_tokens ?? 0, searches: r.usage.server_tool_use?.web_search_requests ?? 0 });

/** Step 2: the writer's reply arrives. Parse it, run the quality gate, keep the draft or the reason it failed. */
export async function handleWritten(t: ContentTask, result: MessageResult): Promise<"written" | "failed" | "skipped"> {
  const brief = briefOf(t);
  await logAiUsage(t.kind === "news" ? "content.news" : "content.write", `${t.format}: ${t.keyword}`, result.usage);
  const usage = JSON.stringify({ write: usageOf(result) });
  const parsed = parseDraft(result.text);
  if (!parsed.ok) {
    await db.contentTask.update({ where: { id: t.id }, data: { status: parsed.skipped ? "skipped" : "failed", error: parsed.reason.slice(0, 500), usageJson: usage } });
    return parsed.skipped ? "skipped" : "failed";
  }
  const draft = parsed.draft;
  let sources: string[] = [];
  let sourceText = "";
  let sourceRead = false;
  if (t.kind === "news") {
    const evidence = searchEvidence(result.blocks);
    // Only pages the search really returned can be cited; anything else the writer listed is dropped.
    sources = evidence.urls;
    draft.sources = draft.sources.filter((s) => s.url && sources.includes(s.url));
    draft.claimLevel = claimLevelFor(draft.claimLevel, draft.sources.map((s) => s.url!));
    const pages = await Promise.all(draft.sources.slice(0, 2).map(async (s) => ({ url: s.url!, text: await fetchSourceText(s.url!, draft.title) })));
    const read = pages.filter((p) => p.text.length > 400);
    sourceText = [...read.map((p) => `SOURCE PAGE ${p.url} (text as fetched by the server):\n${p.text}`), ...evidence.cited.map((c) => `PASSAGE CITED from ${c.url}: ${c.text}`)].join("\n\n").slice(0, 18_000);
    sourceRead = read.length > 0;
  } else {
    draft.sources = [];
    draft.claimLevel = undefined;
  }
  if (!draft.primaryKeyword) draft.primaryKeyword = brief.keyword;
  const ctx = await qualityContext(t, brief, { sources, factsText: sourceText });
  const report = checkQuality(draft, ctx);
  draft.body = report.body;
  const { body: _body, ...summary } = report;
  void _body;
  if (report.blocked) {
    const why = report.checks.filter((c) => !c.ok && c.severity === "block").map((c) => `${c.label}: ${c.detail}`).join("; ");
    await db.contentTask.update({ where: { id: t.id }, data: { status: "failed", error: `Quality gate: ${why}`.slice(0, 500), draftJson: JSON.stringify({ draft, report: summary }), usageJson: usage } });
    return "failed";
  }
  const stored: Stored = { draft, report: summary, facts: brief.facts, allowedLinks: [...ctx.allowedLinks], allowedSources: sources, sourceText, sourceRead };
  await db.contentTask.update({ where: { id: t.id }, data: { status: "written", draftJson: JSON.stringify(stored), usageJson: usage, error: null } });
  return "written";
}

async function uniqueSlug(wanted: string, exceptId?: string | null): Promise<string> {
  const base = cleanSlug(wanted) || "guide";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 74)}-${i + 1}`;
    const taken = await db.article.findUnique({ where: { slug }, select: { id: true } });
    if (!taken || taken.id === exceptId) return slug;
  }
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}

/** The next publishing time: articles go out one at a time through the day, not all at once. */
async function nextSlot(dailyTarget: number): Promise<Date> {
  const gapMs = Math.min(60, Math.max(5, Math.round((24 * 60) / Math.max(1, dailyTarget)))) * 60_000;
  const last = await db.article.findFirst({ where: { origin: "auto", status: "published", publishedAt: { gt: new Date() } }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } });
  return new Date(Math.max(Date.now(), last?.publishedAt?.getTime() ?? 0) + (last ? gapMs : 0));
}

/** Step 4: the fact-checker's verdict arrives. Remove what it flagged, decide publish / review / reject, store the article. */
export async function handleChecked(t: ContentTask, result: MessageResult | null): Promise<"done" | "failed"> {
  if (!t.draftJson) return "failed";
  const stored = JSON.parse(t.draftJson) as Stored;
  const brief = briefOf(t);
  const settings = await getSettings();
  if (result) await logAiUsage("content.check", `${t.format}: ${t.keyword}`, result.usage);
  const verdict: Verdict | null = result ? parseVerdict(result.text) : null;
  const usage = JSON.stringify({ ...(JSON.parse(t.usageJson || "{}") as object), ...(result ? { check: usageOf(result) } : {}) });

  // News the checker could not verify because the source page could not be read is held for a
  // person (who can open the source), not thrown away.
  const unverifiable = t.kind === "news" && !stored.sourceRead;
  if (verdict?.verdict === "reject" && !unverifiable) {
    await db.contentTask.update({ where: { id: t.id }, data: { status: "failed", error: `Rejected by the fact check: ${verdict.summary}`.slice(0, 500), verdictJson: JSON.stringify(verdict), usageJson: usage } });
    return "failed";
  }
  const fixed = verdict && !(unverifiable && verdict.verdict === "reject") ? applyVerdict(stored.draft, verdict) : { draft: stored.draft, removed: [], unresolved: [] };
  const draft = fixed.draft;
  const ctx = await qualityContext(t, brief, { sources: stored.allowedSources, factsText: stored.sourceText });
  const report = checkQuality(draft, ctx);
  draft.body = report.body;
  if (report.blocked) {
    const why = report.checks.filter((c) => !c.ok && c.severity === "block").map((c) => `${c.label}: ${c.detail}`).join("; ");
    await db.contentTask.update({ where: { id: t.id }, data: { status: "failed", error: `After the fact check removed ${fixed.removed.length} sentence(s) the article no longer passed: ${why}`.slice(0, 500), verdictJson: JSON.stringify(verdict), usageJson: usage } });
    return "failed";
  }

  // Why a person has to look, if anything.
  const reasons: string[] = [];
  if (!verdict) reasons.push("the fact check could not be read");
  if (unverifiable) reasons.push(`the source page could not be fetched for checking, so the facts are unverified${verdict ? `: ${verdict.summary}` : ""}`);
  if (fixed.unresolved.length) reasons.push(`${fixed.unresolved.length} flagged statement(s) could not be removed automatically: ${fixed.unresolved.slice(0, 3).map((i) => i.problem).join("; ")}`);
  if (fixed.removed.filter((i) => i.severity === "high").length > 3) reasons.push("the fact check removed more than three wrong statements");
  for (const c of report.checks.filter((c) => !c.ok && c.severity === "review")) reasons.push(`${c.label}: ${c.detail}`);
  if (t.kind === "news") {
    if (draft.claimLevel === "rumor") reasons.push("the item is not confirmed by a source");
    if (draft.claimLevel === "reported" && !settings["content.publishReportedNews"]) reasons.push("reported by a single outlet, not confirmed by an official source");
  }
  if (!settings["content.autoPublish"]) reasons.push("automatic publishing is switched off");
  if (report.score < settings["content.minQuality"]) reasons.push(`quality score ${report.score} is under ${settings["content.minQuality"]}`);
  const publish = reasons.length === 0;

  const category = categoryBySlug(t.category);
  const slug = await uniqueSlug(draft.slug, t.articleId);
  const relatedSlugs = brief.links.filter((l) => l.kind === "guide").map((l) => l.url.replace("/guides/", "")).slice(0, 8);
  const { body: _b, ...summary } = report;
  void _b;
  const data = {
    title: draft.title,
    answer: draft.answer,
    body: draft.body,
    topic: category?.topic ?? "collecting",
    category: t.category,
    format: t.format,
    origin: "auto",
    tagsJson: JSON.stringify(draft.tags),
    charactersJson: JSON.stringify(draft.characters),
    titlesJson: JSON.stringify(draft.titles),
    publishersJson: JSON.stringify(draft.publishers),
    faqJson: JSON.stringify(draft.faq),
    relatedJson: JSON.stringify(relatedSlugs),
    sourcesJson: JSON.stringify(draft.sources),
    primaryKeyword: draft.primaryKeyword || t.keyword,
    secondaryJson: JSON.stringify([...new Set([...draft.secondaryKeywords, ...brief.secondary.slice(0, 6)])].slice(0, 12)),
    semanticJson: JSON.stringify(draft.semanticKeywords),
    intent: t.intent,
    seoTitle: draft.seoTitle,
    metaDescription: draft.metaDescription,
    ogTitle: draft.ogTitle,
    ogDescription: draft.ogDescription,
    imageAlt: draft.imageAlt,
    wordCount: report.words,
    seoScore: report.score,
    qualityJson: JSON.stringify({ ...summary, factCheck: verdict ? { verdict: verdict.verdict, summary: verdict.summary, removed: fixed.removed, unresolved: fixed.unresolved } : null, writer: WRITER_MODEL, checker: CHECKER_MODEL }),
    searchVolume: t.volume,
    keywordDifficulty: t.difficulty,
    opportunityScore: t.score,
    clusterKey: t.clusterKey,
    claimLevel: t.kind === "news" ? (draft.claimLevel ?? "reported") : null,
    eventDate: draft.eventDate ? new Date(`${draft.eventDate}T12:00:00Z`) : null,
    reviewNote: publish ? null : reasons.join(" · ").slice(0, 900),
    status: publish ? "published" : "pending_review",
    publishedAt: publish ? await nextSlot(settings["content.dailyTarget"]) : null,
    indexedAt: null,
  };
  const article = t.articleId ? await db.article.update({ where: { id: t.articleId }, data: { ...data, slug } }) : await db.article.create({ data: { ...data, slug } });
  await db.contentTask.update({ where: { id: t.id }, data: { status: "done", articleId: article.id, verdictJson: JSON.stringify(verdict), usageJson: usage, error: null } });
  // Every keyword cluster planned for this address now has its page (also while it waits for review,
  // so the topic is not planned a second time). Rejecting the article releases them again.
  if (t.clusterKey) await db.seoCluster.updateMany({ where: { OR: [{ key: t.clusterKey }, ...(brief.planUrl ? [{ recommendedUrl: brief.planUrl }] : [])] }, data: { urlExists: true, currentUrl: `/guides/${slug}` } }).catch(() => {});
  return "done";
}

/* ------------------------------------------------------------ batch steps */

/** Step 1: send the planned topics to the writer as one batch. */
export async function submitPlanned(limit = 100): Promise<number> {
  const tasks = await db.contentTask.findMany({ where: { status: "planned", attempts: { lt: 3 } }, orderBy: [{ score: "desc" }], take: limit });
  if (tasks.length === 0) return 0;
  const batchId = await createBatch(tasks.map((t) => ({ custom_id: t.id, params: writeParams(t) })));
  await db.contentTask.updateMany({ where: { id: { in: tasks.map((t) => t.id) }, status: "planned" }, data: { status: "writing", batchId, attempts: { increment: 1 } } });
  return tasks.length;
}

/** Step 3: send the drafts that passed the quality gate to the fact-checker. */
export async function submitChecks(limit = 100): Promise<number> {
  const tasks = await db.contentTask.findMany({ where: { status: "written", draftJson: { not: null } }, take: limit });
  if (tasks.length === 0) return 0;
  const checkBatchId = await createBatch(tasks.map((t) => ({ custom_id: t.id, params: checkParams(JSON.parse(t.draftJson!) as Stored) })));
  await db.contentTask.updateMany({ where: { id: { in: tasks.map((t) => t.id) }, status: "written" }, data: { status: "checking", checkBatchId } });
  return tasks.length;
}

/** Collects finished batches of one phase until the deadline. Returns how many tasks moved on. */
async function collectPhase(phase: "writing" | "checking", deadline: number): Promise<number> {
  const field = phase === "writing" ? "batchId" : "checkBatchId";
  const open = await db.contentTask.groupBy({ by: [field], where: { status: phase, [field]: { not: null } } });
  let moved = 0;
  for (const row of open) {
    if (Date.now() > deadline) break;
    const id = row[field] as string;
    const state = await getBatch(id);
    if (!state.ended || !state.resultsUrl) continue;
    const results = await batchResults(state.resultsUrl);
    const tasks = await db.contentTask.findMany({ where: { status: phase, [field]: id } });
    for (const t of tasks) {
      if (Date.now() > deadline) break;
      const r = results.get(t.id);
      try {
        if (phase === "writing") {
          if (!r || !r.ok) await db.contentTask.update({ where: { id: t.id }, data: r ? { status: t.attempts < 3 ? "planned" : "failed", batchId: null, error: `The writer returned an error: ${r.error}`.slice(0, 500) } : { status: "failed", error: "The batch finished without a result for this topic." } });
          else await handleWritten(t, r.result);
        } else await handleChecked(t, r && r.ok ? r.result : null);
        moved += 1;
      } catch (err) {
        await db.contentTask.update({ where: { id: t.id }, data: { status: "failed", error: (err instanceof Error ? err.message : "error").slice(0, 500) } }).catch(() => {});
      }
    }
  }
  return moved;
}

/** Step 5: articles whose time has come are announced to search engines and linked from older related guides. */
export async function publishDue(limit = 25): Promise<number> {
  const due = await db.article.findMany({ where: { status: "published", publishedAt: { lte: new Date() }, indexedAt: null }, orderBy: { publishedAt: "asc" }, take: limit, select: { id: true, slug: true, category: true, topic: true, relatedJson: true } });
  if (due.length === 0) return 0;
  const paths = new Set<string>(["/guides"]);
  for (const a of due) {
    paths.add(`/guides/${a.slug}`);
    if (a.category) paths.add(`/guides/category/${a.category}`);
    paths.add(`/guides/topics/${a.topic}`);
    // Older guides on the same subject get a link to the new one ("Keep reading"), up to eight each.
    const related = parseJsonArray(a.relatedJson, isString).slice(0, 4);
    for (const older of related.length ? await db.article.findMany({ where: { slug: { in: related }, status: "published" }, select: { id: true, relatedJson: true } }) : []) {
      const list = parseJsonArray(older.relatedJson, isString);
      if (list.includes(a.slug) || list.length >= 8) continue;
      await db.article.update({ where: { id: older.id }, data: { relatedJson: JSON.stringify([a.slug, ...list]) } });
    }
  }
  await pingIndexNow([...paths]);
  await db.article.updateMany({ where: { id: { in: due.map((a) => a.id) } }, data: { indexedAt: new Date() } });
  return due.length;
}

export type TickResult = { planned: number; submitted: number; written: number; checksSubmitted: number; finished: number; published: number; note: string };

/**
 * One turn of the pipeline, safe to call every few minutes: plan the day if it has not been
 * planned, then move everything one step along. Stops when its time budget is used.
 */
export async function contentTick(budgetMs = 15_000): Promise<TickResult> {
  const out: TickResult = { planned: 0, submitted: 0, written: 0, checksSubmitted: 0, finished: 0, published: 0, note: "" };
  const settings = await getSettings();
  const deadline = Date.now() + budgetMs;
  out.published = await publishDue();
  if (!settings["content.enabled"]) return { ...out, note: "The content pipeline is switched off." };
  if (!contentAiConfigured()) return { ...out, note: "ANTHROPIC_API_KEY is not set on the server, so nothing can be written." };
  const day = dayKey();
  if ((await db.contentTask.count({ where: { day } })) === 0) {
    const plan = await planDay({ day });
    await db.seoRun.create({ data: { kind: "content_plan", status: "ok", summary: plan.summary.slice(0, 400), detailJson: JSON.stringify(plan), finishedAt: new Date() } }).catch(() => {});
    out.planned = plan.created + plan.news;
    // Planning reads a lot; the rest waits for the next turn.
    return { ...out, note: plan.summary };
  }
  try {
    out.submitted = await submitPlanned();
    if (Date.now() < deadline) out.written = await collectPhase("writing", deadline);
    if (Date.now() < deadline) out.checksSubmitted = await submitChecks();
    if (Date.now() < deadline) out.finished = await collectPhase("checking", deadline);
  } catch (err) {
    // The AI service refusing (no credit, a bad key, an outage) stops this turn only. The reason is
    // kept for the dashboard, at most once an hour, and the next turn tries again.
    const message = (err instanceof Error ? err.message : "error").slice(0, 380);
    const recent = await db.seoRun.findFirst({ where: { kind: "content_error", startedAt: { gte: new Date(Date.now() - 3_600_000) } }, select: { id: true } });
    if (!recent) await db.seoRun.create({ data: { kind: "content_error", status: "error", summary: message, finishedAt: new Date() } }).catch(() => {});
    out.note = `The AI service could not be used: ${message}`;
  }
  // Tasks stuck in a batch that never came back (the service keeps results for a limited time) are released.
  await db.contentTask.updateMany({ where: { status: { in: ["writing", "checking"] }, updatedAt: { lt: new Date(Date.now() - 36 * 3_600_000) } }, data: { status: "failed", error: "The batch did not return within 36 hours." } });
  return out;
}

/** Writes and checks one task immediately, without a batch. For a single regeneration and for tests. */
export async function runTaskNow(id: string): Promise<{ status: string; articleId: string | null; error: string | null }> {
  let t = await db.contentTask.findUniqueOrThrow({ where: { id } });
  if (t.status === "planned") {
    await db.contentTask.update({ where: { id }, data: { status: "writing", attempts: { increment: 1 } } });
    try {
      await handleWritten(t, await message(writeParams(t)));
    } catch (err) {
      await db.contentTask.update({ where: { id }, data: { status: "failed", error: (err instanceof Error ? err.message : "error").slice(0, 500) } });
      throw err;
    }
    t = await db.contentTask.findUniqueOrThrow({ where: { id } });
  }
  if (t.status === "written" && t.draftJson) {
    await db.contentTask.update({ where: { id }, data: { status: "checking" } });
    await handleChecked(t, await message(checkParams(JSON.parse(t.draftJson) as Stored)));
    t = await db.contentTask.findUniqueOrThrow({ where: { id } });
  }
  return { status: t.status, articleId: t.articleId, error: t.error };
}

/** A new attempt at an article: same brief, the result replaces the article it came from. */
export async function requeueArticle(articleId: string): Promise<string | null> {
  const prev = await db.contentTask.findFirst({ where: { articleId }, orderBy: { createdAt: "desc" } });
  if (!prev) return null;
  const day = dayKey();
  const again = await db.contentTask.create({ data: { day, kind: prev.kind, keyword: prev.keyword, norm: normPhrase(`${prev.norm} retry ${Date.now().toString(36)}`), clusterKey: prev.clusterKey, intent: prev.intent, volume: prev.volume, difficulty: prev.difficulty, score: prev.score, scoreJson: prev.scoreJson, category: prev.category, format: prev.format, reason: `Regenerated. ${prev.reason}`.slice(0, 400), briefJson: prev.briefJson, articleId } });
  return again.id;
}
