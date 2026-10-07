import "server-only";
import { db } from "@/lib/db";
import { isString, parseJsonArray } from "@/lib/json";
import { displayName, normPhrase } from "@/lib/seo/intel/entities";
import { findDuplicate, type ExistingPage } from "@/lib/content/dedupe";
import { MIN_RELEVANCE, categoryFor, formatFor, hasDemand, isQuestion, mergeByUrl, scoreOpportunity, type Candidate } from "@/lib/content/opportunity";
import { loadCandidates, loadPlanContext } from "@/lib/content/plan";

/**
 * The topic backlog: every content opportunity SEO Intelligence currently supports, stored as
 * queued tasks of the content pipeline (the same `ContentTask` table the daily plan writes to).
 *
 *   SEO Intelligence clusters → one topic per planned page → deduplicated → scored → queued
 *
 * No AI is involved and nothing is invented: a topic exists only because a keyword cluster in
 * SEO Intelligence recommends a page for it. A keyword the site already answers becomes an
 * "improve this page" entry on that page instead of a second article.
 *
 * It runs in small steps and remembers where it was (Setting `content.backlog.state`), so a run
 * that stops at topic 18,500 continues from 18,501. It only ever adds or refreshes queued rows:
 * articles, drafts and tasks that are planned or in progress are never touched or deleted.
 */
export const BACKLOG_DAY = "backlog";
const STATE_KEY = "content.backlog.state";

export type BacklogState = {
  /** candidates already handled in the current pass */
  cursor: number;
  /** candidates in the current pass */
  total: number;
  startedAt: string;
  finishedAt: string | null;
  added: number;
  refreshed: number;
  updates: number;
  duplicates: number;
  notRelevant: number;
  /** clusters SEO Intelligence held when the pass started */
  clusters: number;
};

const freshState = (): BacklogState => ({ cursor: 0, total: 0, startedAt: new Date().toISOString(), finishedAt: null, added: 0, refreshed: 0, updates: 0, duplicates: 0, notRelevant: 0, clusters: 0 });

export async function backlogState(): Promise<BacklogState | null> {
  const row = await db.setting.findUnique({ where: { key: STATE_KEY } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as BacklogState;
  } catch {
    return null;
  }
}
const saveState = (s: BacklogState) => db.setting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value: JSON.stringify(s) }, update: { value: JSON.stringify(s) } });

const SUFFIX: Record<string, (d: string) => string> = {
  "values-market": (d) => `${d}: What Decides the Price and How to Check It`,
  "investment-analysis": (d) => `${d}: Scarcity, Demand and Risk for Collectors`,
  "grading-guides": (d) => `${d} Explained: What Collectors Should Know`,
  "cgc-cbcs": (d) => `${d} Explained: What Collectors Should Know`,
  "buying-guides": (d) => `${d}: A Buyer's Guide`,
  "selling-guides": (d) => `${d}: How to Sell and What to Prepare`,
  "collector-tips": (d) => `${d}: A Practical Guide for Collectors`,
  "comic-history": (d) => `${d}: History and the Comics That Matter`,
  "creator-stories": (d) => `${d}: The Work Collectors Look For`,
  "auction-marketplace": (d) => `${d}: What Collectors Should Know`,
};

/**
 * A working title for a topic, built from the keyword and the page plan. It contains no facts:
 * the writer replaces it with a headline particular to the subject.
 */
export function topicTitle(c: Pick<Candidate, "keyword" | "planTitle">, category: string, format: string): string {
  const d = displayName(normPhrase(c.keyword));
  const plan = c.planTitle.trim();
  // The page plan already gives issue, first-appearance, era, series and comparison pages a full title.
  if (plan && normPhrase(plan) !== normPhrase(c.keyword)) return plan;
  if (isQuestion(c.keyword)) {
    const q = d.replace(/\?+$/, "");
    return /^how to\b/i.test(q) ? `${q}: A Collector's Guide` : `${q}?`;
  }
  if (format === "list") return `${d}: The Books Collectors Look For`;
  return (SUFFIX[category] ?? ((x: string) => `${x}: A Collector's Guide`))(d);
}

/** High, medium or low from the opportunity score; "unmeasured" while the keyword has no demand figure yet. */
export function priorityFor(c: Pick<Candidate, "volume" | "impressions">, score: number): "high" | "medium" | "low" | "unmeasured" {
  if (!hasDemand(c)) return "unmeasured";
  return score >= 70 ? "high" : score >= 50 ? "medium" : "low";
}

/** Everything SEO Intelligence recommends a page for, one entry per planned page, in a stable order. */
async function allCandidates(): Promise<{ candidates: Candidate[]; pages: ExistingPage[]; clusters: number }> {
  const ctx = await loadPlanContext({ includeQueued: true });
  const raw = await loadCandidates(ctx, { includeTitlePages: true });
  const candidates = mergeByUrl(raw).sort((a, b) => a.norm.localeCompare(b.norm));
  return { candidates, pages: ctx.pages, clusters: raw.length };
}

export type BacklogStep = { done: boolean; state: BacklogState };

/**
 * One step of building or refreshing the backlog. Call it until `done`. A finished pass is
 * started again by `restart` (the daily job does this), which picks up whatever SEO
 * Intelligence has learnt since.
 */
export async function syncBacklog(opts: { budgetMs?: number; maxItems?: number; restart?: boolean } = {}): Promise<BacklogStep> {
  const deadline = Date.now() + (opts.budgetMs ?? 12_000);
  let state = await backlogState();
  if (!state || (state.finishedAt && opts.restart)) state = freshState();
  if (state.finishedAt) return { done: true, state };

  const { candidates, pages, clusters } = await allCandidates();
  state.total = candidates.length;
  state.clusters = clusters;
  const queued = new Map((await db.contentTask.findMany({ where: { day: BACKLOG_DAY }, select: { id: true, norm: true, status: true, score: true, volume: true, difficulty: true, priority: true, secondaryJson: true, kind: true } })).map((t) => [t.norm, t]));
  // Topics the pipeline has already taken (planned, written, published or declined on another day) are not queued twice.
  const taken = new Set((await db.contentTask.findMany({ where: { day: { not: BACKLOG_DAY }, kind: { not: "news" } }, select: { norm: true } })).map((t) => t.norm));

  let handled = 0;
  while (state.cursor < candidates.length && Date.now() < deadline && handled < (opts.maxItems ?? Infinity)) {
    const c = candidates[state.cursor];
    state.cursor += 1;
    handled += 1;
    if (c.relevance < MIN_RELEVANCE || c.intent === "navigational") {
      state.notRelevant += 1;
      continue;
    }
    const scored = scoreOpportunity(c);
    const category = categoryFor(c);
    const format = formatFor(c, category);
    const priority = priorityFor(c, scored.score);
    const secondary = [...new Set([...c.secondary, ...c.supporting])].filter((k) => normPhrase(k) !== c.norm).slice(0, 20);
    const source = `SEO Intelligence cluster ${c.clusterKey ?? c.norm}${c.sources?.length ? ` (keyword from: ${c.sources.join(", ")})` : ""}`;

    const mine = queued.get(c.norm);
    if (mine) {
      // Already queued: keep it, with today's figures. Rows the owner removed or the pipeline took are left as they are.
      if (mine.status === "queued" && mine.kind === "new" && (mine.score !== scored.score || mine.volume !== c.volume || mine.difficulty !== c.difficulty || mine.priority !== priority)) {
        await db.contentTask.update({ where: { id: mine.id }, data: { score: scored.score, scoreJson: JSON.stringify(scored.parts), volume: c.volume, difficulty: c.difficulty, priority, reason: scored.reason, secondaryJson: JSON.stringify(secondary) } });
        state.refreshed += 1;
      }
      continue;
    }
    if (taken.has(c.norm)) {
      state.duplicates += 1;
      continue;
    }
    const title = topicTitle(c, category, format);
    const dup = findDuplicate({ keyword: c.keyword, title, url: c.recommendedUrl, also: c.secondary }, pages);
    if (dup && dup.kind === "article") {
      // The site already answers this keyword: one "improve this page" entry per page collects such keywords.
      const norm = `update ${dup.url}`;
      const existing = queued.get(norm);
      const article = await db.article.findUnique({ where: { slug: dup.url.replace("/guides/", "") }, select: { id: true } });
      if (existing) {
        const list = [...new Set([...parseJsonArray(existing.secondaryJson, isString), c.keyword])].slice(0, 40);
        if (existing.status === "queued") await db.contentTask.update({ where: { id: existing.id }, data: { secondaryJson: JSON.stringify(list), score: Math.max(existing.score, scored.score), volume: Math.max(existing.volume ?? 0, c.volume ?? 0) || null } });
        existing.secondaryJson = JSON.stringify(list);
        existing.score = Math.max(existing.score, scored.score);
      } else {
        const row = await db.contentTask.create({ data: { day: BACKLOG_DAY, kind: "update", status: "queued", keyword: c.keyword, norm, title: `Improve: ${dup.title}`, secondaryJson: "[]", clusterKey: c.clusterKey, intent: c.intent, volume: c.volume, difficulty: c.difficulty, score: scored.score, scoreJson: JSON.stringify(scored.parts), category, format, priority, source, reason: `The site already has ${dup.url} for this keyword (${dup.why}). Improve that page instead of adding another.`, articleId: article?.id ?? null } });
        queued.set(norm, { id: row.id, norm, status: "queued", score: scored.score, volume: c.volume, difficulty: c.difficulty, priority, secondaryJson: "[]", kind: "update" });
        state.updates += 1;
      }
      continue;
    }
    if (dup) {
      state.duplicates += 1;
      continue;
    }
    const row = await db.contentTask.create({ data: { day: BACKLOG_DAY, kind: "new", status: "queued", keyword: c.keyword, norm: c.norm, title, secondaryJson: JSON.stringify(secondary), clusterKey: c.clusterKey, intent: c.intent, volume: c.volume, difficulty: c.difficulty, score: scored.score, scoreJson: JSON.stringify(scored.parts), category, format, priority, source, reason: scored.reason } });
    queued.set(c.norm, { id: row.id, norm: c.norm, status: "queued", score: scored.score, volume: c.volume, difficulty: c.difficulty, priority, secondaryJson: "[]", kind: "new" });
    // Later candidates are compared with this topic too, so the backlog never holds two takes on one subject.
    pages.push({ url: c.recommendedUrl, title, kind: "task", keywords: [c.norm, ...c.secondary.map(normPhrase)] });
    state.added += 1;
  }
  if (state.cursor >= candidates.length) state.finishedAt = new Date().toISOString();
  await saveState(state);
  return { done: Boolean(state.finishedAt), state };
}

export type BacklogSummary = { queued: number; updates: number; taken: number; removed: number; eligibleNow: number; byFormat: Record<string, number>; byCategory: Record<string, number>; byPriority: Record<string, number>; state: BacklogState | null };

/** Counts for the dashboard. */
export async function backlogSummary(minScore: number): Promise<BacklogSummary> {
  const where = { day: BACKLOG_DAY, kind: "new", status: "queued" };
  const [queued, updates, removed, taken, eligibleNow, byFormat, byCategory, byPriority, state] = await Promise.all([
    db.contentTask.count({ where }),
    db.contentTask.count({ where: { day: BACKLOG_DAY, kind: "update", status: "queued" } }),
    db.contentTask.count({ where: { day: BACKLOG_DAY, status: "skipped" } }),
    db.contentTask.count({ where: { day: { not: BACKLOG_DAY }, kind: "new" } }),
    db.contentTask.count({ where: { ...where, priority: { not: "unmeasured" }, score: { gte: minScore } } }),
    db.contentTask.groupBy({ by: ["format"], where, _count: { _all: true } }),
    db.contentTask.groupBy({ by: ["category"], where, _count: { _all: true } }),
    db.contentTask.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    backlogState(),
  ]);
  const tally = (rows: { _count: { _all: number } }[], key: (r: never) => string) => Object.fromEntries(rows.map((r) => [key(r as never), r._count._all]));
  return { queued, updates, taken, removed, eligibleNow, byFormat: tally(byFormat, (r: { format: string }) => r.format), byCategory: tally(byCategory, (r: { category: string }) => r.category), byPriority: tally(byPriority, (r: { priority: string }) => r.priority), state };
}
