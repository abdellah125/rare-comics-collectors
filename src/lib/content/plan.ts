import "server-only";
import { db } from "@/lib/db";
import { publishedWhere } from "@/lib/catalog/products";
import { isString, parseJsonArray } from "@/lib/json";
import { CHARACTER_FACTS } from "@/lib/guides/characters";
import { services } from "@/lib/services";
import { getSettings } from "@/lib/settings";
import { buildContext } from "@/lib/seo/context";
import { normPhrase } from "@/lib/seo/intel/entities";
import { articleTokens } from "@/lib/seo/intel/strategy";
import { slugify } from "@/lib/validation";
import { findDuplicate, type ExistingPage } from "@/lib/content/dedupe";
import { mergeByUrl, selectTopics, type Candidate, type Selected } from "@/lib/content/opportunity";
import { NEWS_BEATS, PRIMARY_NEWS_DOMAINS, SECONDARY_NEWS_DOMAINS, type Brief, type BriefLink } from "@/lib/content/prompt";

/**
 * Planning: reads what SEO Intelligence has stored (keyword clusters with their page plan,
 * volumes, difficulty, Search Console positions), drops what the site already covers, scores
 * the rest and turns the best into writing tasks with a brief. It calls no paid API: fresh
 * figures arrive through the SEO Intelligence jobs and are simply read here.
 */
const CONTENT_PAGE_TYPES = ["Educational article", "Buying guide", "Issue guide", "Comparison article", "FAQ"];
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** The share of the daily target used while the system is new: 10, then 25, then 50, then all of it. */
export function rampTarget(target: number, daysRunning: number, ramp: boolean): number {
  if (!ramp) return target;
  const cap = daysRunning <= 0 ? 10 : daysRunning === 1 ? 25 : daysRunning === 2 ? 50 : target;
  return Math.min(target, cap);
}

const tokensIn = (haystack: Set<string>, needle: Set<string>) => {
  if (needle.size === 0) return false;
  for (const t of needle) if (!haystack.has(t)) return false;
  return true;
};

type ArticleRow = { id: string; slug: string; title: string; answer: string; topic: string; origin: string; status: string; primaryKeyword: string | null; secondaryJson: string; charactersJson: string; titlesJson: string; tagsJson: string };

export type PlanContext = {
  /** headlines of machine-written articles and of topics already planned, newest first */
  recentTitles: { title: string; category: string }[];
  articles: (ArticleRow & { tokens: Set<string> })[];
  pages: ExistingPage[];
  links: { collections: BriefLink[]; publishers: BriefLink[]; characters: BriefLink[]; services: BriefLink[]; productsBySeries: Map<string, BriefLink[]> };
  validPaths: Set<string>;
};

/** Everything the site already has, read once per planning run. */
export async function loadPlanContext(): Promise<PlanContext> {
  const since = new Date(Date.now() - 21 * 86_400_000);
  const [rows, tasks, ctx, products] = await Promise.all([
    db.article.findMany({ where: { status: { not: "rejected" } }, select: { id: true, slug: true, title: true, answer: true, topic: true, origin: true, status: true, primaryKeyword: true, secondaryJson: true, charactersJson: true, titlesJson: true, tagsJson: true } }),
    db.contentTask.findMany({ where: { createdAt: { gte: since }, status: { in: ["planned", "writing", "written", "checking", "review"] } }, select: { keyword: true, norm: true } }),
    buildContext(),
    db.product.findMany({ where: publishedWhere, select: { slug: true, title: true, issue: true, grader: true, grade: true }, take: 6000 }),
  ]);
  const articles = rows.map((a) => ({ ...a, tokens: articleTokens(`${a.title} ${a.slug.replace(/-/g, " ")} ${parseJsonArray(a.charactersJson, isString).join(" ")} ${parseJsonArray(a.titlesJson, isString).join(" ")}`) }));
  const pages: ExistingPage[] = [
    ...articles.map((a) => ({ url: `/guides/${a.slug}`, title: a.title, kind: "article" as const, keywords: [a.primaryKeyword ? normPhrase(a.primaryKeyword) : "", ...parseJsonArray(a.secondaryJson, isString).map(normPhrase)].filter(Boolean) })),
    ...tasks.map((t) => ({ url: "", title: t.keyword, kind: "task" as const, keywords: [t.norm] })),
  ];
  const productsBySeries = new Map<string, BriefLink[]>();
  for (const p of products) {
    const key = normPhrase(p.title);
    const list = productsBySeries.get(key) ?? [];
    if (list.length < 4) list.push({ url: `/store/${p.slug}`, label: `${p.title} ${p.issue} ${p.grader === "Raw" ? "raw" : `${p.grader} ${p.grade}`} for sale`, kind: "product" });
    productsBySeries.set(key, list);
  }
  const links = {
    collections: ctx.inventory.collections.map((c) => ({ url: `/collections/${c.slug}`, label: `${c.era} comics for sale`, kind: "collection" as const })),
    publishers: ctx.inventory.publishers.filter((p) => p.slug && p.name !== "Unknown").map((p) => ({ url: `/publishers/${p.slug}`, label: `${p.name} comics for sale`, kind: "publisher" as const })),
    characters: ctx.inventory.characters.map((c) => ({ url: `/characters/${c.slug}`, label: `${c.name}: first appearance, key issues and copies for sale`, kind: "character" as const })),
    services: services.map((s) => ({ url: `/services/${s.slug}`, label: s.name, kind: "service" as const })),
    productsBySeries,
  };
  const validPaths = new Set<string>(["/store", "/guides", "/collections", "/publishers", "/characters", "/services", "/contact", ...articles.filter((a) => a.status === "published").map((a) => `/guides/${a.slug}`), ...links.collections.map((l) => l.url), ...links.publishers.map((l) => l.url), ...links.characters.map((l) => l.url), ...links.services.map((l) => l.url), ...products.map((p) => `/store/${p.slug}`)]);
  const recentTitles = (await db.article.findMany({ where: { origin: "auto", status: { not: "rejected" } }, orderBy: { createdAt: "desc" }, take: 150, select: { title: true, category: true } }));
  return { recentTitles, articles, pages, links, validPaths };
}

/** Published guides about the same subject, most related first. */
function relatedArticles(ctx: PlanContext, subject: string, take = 8) {
  const want = articleTokens(subject);
  if (want.size === 0) return [];
  return ctx.articles
    .filter((a) => a.status === "published")
    .map((a) => {
      let hit = 0;
      for (const t of want) if (a.tokens.has(t)) hit += 1;
      return { a, share: hit / want.size };
    })
    .filter((x) => x.share >= 0.5)
    .sort((x, y) => y.share - x.share)
    .slice(0, take)
    .map((x) => x.a);
}

/** What the writer is given: keywords, verified facts, and the only addresses it may link to. */
export function buildBrief(ctx: PlanContext, s: Selected, today: string): Brief {
  const subjectNorm = normPhrase(`${s.label} ${s.keyword}`);
  const related = relatedArticles(ctx, `${s.label} ${s.keyword}`);
  const facts: string[] = [];
  for (const f of CHARACTER_FACTS) {
    const name = normPhrase(f.name.replace(/\(.*?\)/g, ""));
    if (name.length >= 4 && ` ${subjectNorm} `.includes(` ${name} `)) facts.push(`${f.name} first appeared in ${f.firstTitle} ${f.firstIssue} (cover date ${f.firstDate}), published by ${f.publisher}; created by ${f.creators}.${f.note ? ` ${f.note}` : ""}`);
  }
  // Only articles a person wrote and checked count as facts; machine-written ones are linked, not relied on.
  for (const a of related.filter((r) => r.origin !== "auto").slice(0, 6)) facts.push(`From the site's guide "${a.title}": ${a.answer}`);
  facts.push("CGC (Certified Guaranty Company) and CBCS (Comic Book Certification Service) are third-party grading companies; both grade on a 0.5 to 10.0 scale and seal the book in a tamper-evident holder.");

  const links: BriefLink[] = [];
  const add = (l: BriefLink) => {
    if (ctx.validPaths.has(l.url) && !links.some((x) => x.url === l.url) && links.length < 16) links.push(l);
  };
  for (const a of related.slice(0, 7)) add({ url: `/guides/${a.slug}`, label: a.title, kind: "guide" });
  for (const l of s.planLinks) if (l.url.startsWith("/store/")) add({ url: l.url, label: `${l.label} for sale`, kind: "product" });
  for (const [series, list] of ctx.links.productsBySeries) if (series.length >= 4 && ` ${subjectNorm} `.includes(` ${series} `)) for (const l of list.slice(0, 3)) add(l);
  for (const c of ctx.links.characters) if (` ${subjectNorm} `.includes(` ${normPhrase(c.label.split(":")[0])} `)) add(c);
  for (const c of ctx.links.collections) if (subjectNorm.includes(normPhrase(c.label.replace(" comics for sale", "")))) add(c);
  for (const p of ctx.links.publishers) if (` ${subjectNorm} `.includes(` ${normPhrase(p.label.replace(/ comics for sale$/i, "").replace(/\bcomics\b/gi, ""))} `)) add(p);
  const serviceFor: [RegExp, string][] = [[/\b(grade|grading|graded|cgc|cbcs|slab)\b/, "/services/grading-submission"], [/\b(worth|value|price|apprais\w*)\b/, "/services/appraisal-and-valuation"], [/\b(sell|selling|consign\w*)\b/, "/services/consignment-and-brokerage"], [/\b(press\w*|clean\w*)\b/, "/services/pressing-and-cleaning"], [/\b(restor\w*|trim\w*)\b/, "/services/restoration-detection"], [/\b(stor\w+|vault)\b/, "/services/vault-storage"]];
  for (const [re, url] of serviceFor) if (re.test(subjectNorm)) { const sv = ctx.links.services.find((x) => x.url === url); if (sv) add(sv); }
  add({ url: "/store", label: "All graded comics for sale", kind: "hub" });
  add({ url: "/guides", label: "All collector guides", kind: "hub" });
  for (const url of ["/services/appraisal-and-valuation", "/services/grading-submission"]) { const sv = ctx.links.services.find((x) => x.url === url); if (sv) add(sv); }

  return { kind: "new", keyword: s.keyword, secondary: s.secondary, supporting: s.supporting, intent: s.intent, category: s.category, format: s.format, subject: s.label, planTitle: s.planTitle, outline: s.planTopics, facts, links, covered: related.map((a) => a.title), today, planUrl: s.recommendedUrl, recentTitles: ctx.recentTitles.filter((r) => r.category === s.category).map((r) => r.title).slice(0, 25) };
}

/** Topics SEO Intelligence recommends a guide for and the site does not have yet. */
export async function loadCandidates(ctx: PlanContext): Promise<Candidate[]> {
  const clusters = await db.seoCluster.findMany({ where: { urlExists: false, recommendedUrl: { startsWith: "/guides/" }, pageType: { in: CONTENT_PAGE_TYPES } }, select: { key: true, label: true, entityType: true, bucket: true, intent: true, specificJson: true, primaryPhrase: true, secondaryJson: true, supportingJson: true, volume: true, difficulty: true, pageType: true, recommendedUrl: true, title: true, h1: true, topicsJson: true, linksJson: true } });
  const norms = clusters.map((c) => normPhrase(c.primaryPhrase));
  const keywords = new Map<string, { relevance: number; impressions: number | null; position: number | null; competitorsJson: string; volume: number | null; difficulty: number | null }>();
  for (let i = 0; i < norms.length; i += 2000) {
    for (const k of await db.seoKeyword.findMany({ where: { norm: { in: norms.slice(i, i + 2000) } }, select: { norm: true, relevance: true, impressions: true, position: true, competitorsJson: true, volume: true, difficulty: true } })) keywords.set(k.norm, k);
  }
  const published = ctx.articles.filter((a) => a.status === "published");
  return clusters.map((c) => {
    const norm = normPhrase(c.primaryPhrase);
    const k = keywords.get(norm);
    const labelTokens = articleTokens(c.label);
    const planLinks = (() => { try { return (JSON.parse(c.linksJson) as { label: string; url: string }[]).filter((l) => typeof l?.url === "string" && typeof l?.label === "string"); } catch { return []; } })();
    const seriesKey = normPhrase(c.label.replace(/\s+#?\d+[a-z]?$/i, ""));
    return {
      keyword: c.primaryPhrase,
      norm,
      clusterKey: c.key,
      label: c.label,
      entityType: c.entityType,
      bucket: c.bucket,
      intent: c.intent,
      specifics: parseJsonArray(c.specificJson, isString),
      volume: c.volume ?? k?.volume ?? null,
      difficulty: c.difficulty ?? k?.difficulty ?? null,
      relevance: k?.relevance ?? 0,
      impressions: k?.impressions ?? null,
      position: k?.position ?? null,
      secondary: parseJsonArray(c.secondaryJson, isString),
      supporting: parseJsonArray(c.supportingJson, isString),
      pageType: c.pageType,
      recommendedUrl: c.recommendedUrl,
      planTitle: c.title,
      planH1: c.h1,
      planTopics: parseJsonArray(c.topicsJson, isString),
      planLinks,
      supportArticles: published.filter((a) => tokensIn(a.tokens, labelTokens)).length,
      productCount: planLinks.filter((l) => l.url.startsWith("/store/")).length || (ctx.links.productsBySeries.get(seriesKey)?.length ?? 0),
      competitorGap: Boolean(k && k.position === null && k.competitorsJson !== "[]"),
    } satisfies Candidate;
  });
}

export type PlanResult = { day: string; target: number; considered: number; eligible: number; created: number; duplicates: { keyword: string; existing: string; why: string }[]; news: number; summary: string };

/**
 * Chooses the day's topics and stores them as tasks. Runs at most once to completion per day:
 * a second call only tops the day up to its target.
 */
export async function planDay(opts: { day?: string; limit?: number } = {}): Promise<PlanResult> {
  const settings = await getSettings();
  const day = opts.day ?? dayKey();
  const first = await db.contentTask.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const daysRunning = first ? Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${dayKey(first.createdAt)}T00:00:00Z`)) / 86_400_000) : 0;
  const target = Math.min(opts.limit ?? Infinity, rampTarget(settings["content.dailyTarget"], daysRunning, settings["content.rampUp"]));
  const already = await db.contentTask.count({ where: { day, status: { not: "skipped" } } });
  const newsWanted = Math.min(settings["content.newsPerDay"], Math.max(0, Math.round(target * 0.15)), NEWS_BEATS.length);
  // The same question asked of many comics ("<issue> cgc", "<issue> value") is limited per day, so a day is never a run of one template.
  const perPattern = new Map<string, number>();
  const patternOf = (s: Selected) => {
    const subject = new Set(normPhrase(s.label).split(" "));
    return normPhrase(s.keyword).split(" ").filter((w) => !subject.has(w) && !/^\d/.test(w)).join(" ") || "(subject only)";
  };
  const newsHave = await db.contentTask.count({ where: { day, kind: "news" } });
  const room = Math.max(0, target - already);
  if (room === 0) return { day, target, considered: 0, eligible: 0, created: 0, duplicates: [], news: 0, summary: `The plan for ${day} is already complete (${already} of ${target}).` };

  const ctx = await loadPlanContext();
  const candidates = mergeByUrl(await loadCandidates(ctx));
  const newsToAdd = Math.min(Math.max(0, newsWanted - newsHave), room);
  const evergreenRoom = room - newsToAdd;
  // More than needed are selected, because some will turn out to be covered already.
  const picked = selectTopics(candidates, { target: evergreenRoom * 2 + 10, minScore: settings["content.minScore"] });
  const duplicates: PlanResult["duplicates"] = [];
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  for (const s of picked) {
    if (created >= evergreenRoom) break;
    const pattern = `${s.entityType}:${patternOf(s)}`;
    if ((perPattern.get(pattern) ?? 0) >= 2) continue;
    const dup = findDuplicate({ keyword: s.keyword, title: s.planTitle, url: s.recommendedUrl, also: s.secondary }, ctx.pages);
    if (dup) {
      duplicates.push({ keyword: s.keyword, existing: dup.url || dup.title, why: dup.why });
      continue;
    }
    const brief = buildBrief(ctx, s, today);
    try {
      await db.contentTask.create({ data: { day, kind: "new", keyword: s.keyword, norm: s.norm, clusterKey: s.clusterKey, intent: s.intent, volume: s.volume, difficulty: s.difficulty, score: s.score, scoreJson: JSON.stringify(s.parts), category: s.category, format: s.format, reason: s.reason, briefJson: JSON.stringify(brief) } });
    } catch {
      continue; // already planned today
    }
    perPattern.set(pattern, (perPattern.get(pattern) ?? 0) + 1);
    // Later picks are compared with this one too, so one day never carries two takes on a subject.
    ctx.pages.push({ url: s.recommendedUrl, title: s.planTitle, kind: "task", keywords: [s.norm, ...s.secondary.map(normPhrase)] });
    created += 1;
  }

  // News: a few beats a day, in rotation. Each is researched with web search when it is written.
  let news = 0;
  if (newsToAdd > 0) {
    const recent = await db.article.findMany({ where: { format: "news", createdAt: { gte: new Date(Date.now() - 45 * 86_400_000) } }, select: { title: true }, orderBy: { createdAt: "desc" }, take: 60 });
    const dayIndex = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
    const evergreen = ["/guides", "/store", "/services/grading-submission", "/services/appraisal-and-valuation", "/services/consignment-and-brokerage"];
    const links: BriefLink[] = [...ctx.links.services.filter((l) => evergreen.includes(l.url)), { url: "/store", label: "All graded comics for sale", kind: "hub" }, { url: "/guides", label: "All collector guides", kind: "hub" }, ...ctx.articles.filter((a) => a.status === "published" && ["grading", "values"].includes(a.topic)).slice(0, 8).map((a) => ({ url: `/guides/${a.slug}`, label: a.title, kind: "guide" as const }))];
    for (let i = 0; i < newsToAdd; i++) {
      const beat = NEWS_BEATS[(dayIndex + newsHave + i) % NEWS_BEATS.length];
      const keyword = `news: ${beat.split(":")[0].slice(0, 70)}`;
      const brief: Brief = { kind: "news", keyword: "comic book news", secondary: [], supporting: [], intent: "informational", category: /auction|sales/.test(beat) ? "auction-marketplace" : /convention|events/.test(beat) ? "releases-events" : "comic-news", format: "news", subject: beat, planTitle: "", outline: [], facts: [], links, covered: [], today, beat, recentNews: recent.map((r) => r.title), allowedDomains: [...PRIMARY_NEWS_DOMAINS, ...SECONDARY_NEWS_DOMAINS] };
      try {
        await db.contentTask.create({ data: { day, kind: "news", keyword, norm: normPhrase(`${keyword} ${day}`), intent: "informational", score: 60, category: brief.category, format: "news", reason: "Fresh content: one verified news item from this beat, found with web search and cited.", briefJson: JSON.stringify(brief) } });
        news += 1;
      } catch {
        // this beat is already planned today
      }
    }
  }
  const eligible = picked.length;
  const summary = `${day}: ${created} topic(s) and ${news} news beat(s) planned of a target of ${target}. ${candidates.length} recommendations considered, ${eligible} met the score and relevance bar, ${duplicates.length} dropped as already covered.${created < evergreenRoom ? " Fewer topics than the target qualified, so fewer will be written." : ""}`;
  return { day, target, considered: candidates.length, eligible, created, duplicates: duplicates.slice(0, 50), news, summary };
}

export { slugify };
