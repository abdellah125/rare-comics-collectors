import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { buildContext, candidatePhrases, type SeoContext } from "@/lib/seo/context";
import { analysePhrase, normPhrase } from "@/lib/seo/intel/entities";
import { intentValue } from "@/lib/seo/intel/intent";
import { priorityFor, scoreKeyword } from "@/lib/seo/intel/score";
import { COST, OpenSeoError, callTool, whoami } from "@/lib/seo/openseo";
import { rebuildStrategy } from "@/lib/seo/rebuild";

/**
 * The pipeline steps. Each one is a single bounded unit of work (it fits in one serverless
 * invocation), records itself as a SeoRun with what it did and what it cost, and leaves every
 * keyword it touched classified and scored. Steps that cost credits say so in their name here
 * and on the dashboard; the Search Console steps and the analysis are free.
 */

export type Competitor = { domain: string; position: number; url: string; title: string };
export type KeywordInput = {
  phrase: string;
  source: string;
  volume?: number | null;
  difficulty?: number | null;
  cpc?: number | null;
  competition?: number | null;
  providerIntent?: string | null;
  serpFeatures?: string[];
  serpDomainRank?: number | null;
  serpRefDomains?: number | null;
  /** the provider was asked for metrics for this phrase (even if it had none) */
  metricsAsked?: boolean;
  ranking?: { position: number | null; source: "gsc" | "serp" | "labs"; url: string | null; impressions?: number | null; clicks?: number | null; pages?: { url: string; impressions: number; position: number }[] };
  competitors?: Competitor[];
  serpChecked?: boolean;
};

/** Sites a young shop does not outrank on a head term: marketplaces, platforms, graders, price databases, wikis. */
const BIG_SITES = /(^|\.)(ebay|amazon|etsy|walmart|reddit|youtube|facebook|instagram|pinterest|tiktok|wikipedia|fandom|marvel|dc|cgccomics|gocollect|pricecharting|ha|mycomicshop|comiclink)\.(com|org|co\.uk)$/;
const host = () => new URL(env.siteUrl).hostname.replace(/^www\./, "");
const isOurs = (domain: string | null | undefined) => (domain ?? "").replace(/^www\./, "") === host();
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pick = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);
const first = (o: unknown, ...paths: string[]) => { for (const p of paths) { const v = pick(o, p); if (v !== undefined && v !== null) return v; } return null; };

/** OpenSEO returns flat rows from some tools and raw DataForSEO objects from others: read either. */
export function readMetricRow(row: unknown, source: string): KeywordInput | null {
  const phrase = first(row, "keyword", "keyword_data.keyword");
  if (typeof phrase !== "string" || !phrase.trim()) return null;
  const features = first(row, "serp_info.serp_item_types", "keyword_data.serp_info.serp_item_types", "ranked_serp_element.serp_item_types", "serpFeatures");
  return {
    phrase,
    source,
    volume: num(first(row, "search_volume", "searchVolume", "keyword_info.search_volume", "keyword_data.keyword_info.search_volume")),
    difficulty: num(first(row, "keyword_difficulty", "keywordDifficulty", "keyword_properties.keyword_difficulty", "keyword_data.keyword_properties.keyword_difficulty", "ranked_serp_element.keyword_difficulty")),
    cpc: num(first(row, "cpc", "keyword_info.cpc", "keyword_data.keyword_info.cpc")),
    competition: num(first(row, "competition", "keyword_info.competition", "keyword_data.keyword_info.competition")),
    providerIntent: (first(row, "main_intent", "intent", "search_intent_info.main_intent", "keyword_data.search_intent_info.main_intent") as string | null) ?? null,
    serpFeatures: Array.isArray(features) ? features.filter((f): f is string => typeof f === "string") : undefined,
    serpDomainRank: num(first(row, "avg_backlinks_info.main_domain_rank", "keyword_data.avg_backlinks_info.main_domain_rank")),
    serpRefDomains: num(first(row, "avg_backlinks_info.referring_domains", "keyword_data.avg_backlinks_info.referring_domains")),
    metricsAsked: true,
  };
}

/** Insert or merge keywords; every touched row is re-classified and re-scored. Returns counts. */
export async function saveKeywords(inputs: KeywordInput[], ctx: SeoContext): Promise<{ created: number; updated: number }> {
  const byNorm = new Map<string, KeywordInput[]>();
  for (const i of inputs) {
    const norm = normPhrase(i.phrase);
    if (!norm || norm.length > 120 || /^[\d\s().+-]+$/.test(norm)) continue; // phone numbers and bare numbers
    byNorm.set(norm, [...(byNorm.get(norm) ?? []), i]);
  }
  const norms = [...byNorm.keys()];
  const existing = new Map<string, Awaited<ReturnType<typeof db.seoKeyword.findMany>>[number]>();
  for (let i = 0; i < norms.length; i += 1000) for (const k of await db.seoKeyword.findMany({ where: { norm: { in: norms.slice(i, i + 1000) } } })) existing.set(k.norm, k);

  const now = new Date();
  const creates: Prisma.SeoKeywordCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.SeoKeywordUpdateInput }[] = [];
  for (const [norm, group] of byNorm) {
    const old = existing.get(norm);
    const merged = group.reduce<KeywordInput>((acc, g) => ({ ...acc, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined && v !== null)) }) as KeywordInput, { phrase: group[0].phrase, source: group[0].source });
    const sources = [...new Set([...(old ? (JSON.parse(old.sourcesJson) as string[]) : []), ...group.map((g) => g.source)])].filter(Boolean).slice(0, 12);
    const volume = merged.volume ?? old?.volume ?? null;
    const difficulty = merged.difficulty ?? old?.difficulty ?? null;
    const cpc = merged.cpc ?? old?.cpc ?? null;
    const providerIntent = merged.providerIntent ?? old?.providerIntent ?? null;
    const serpDomainRank = merged.serpDomainRank ?? old?.serpDomainRank ?? null;

    // Ranking state: a new check replaces the position; the previous one is kept once per day.
    let position = old?.position ?? null;
    let prevPosition = old?.prevPosition ?? null;
    let positionSource = old?.positionSource ?? null;
    let positionAt = old?.positionAt ?? null;
    let currentUrl = old?.currentUrl ?? null;
    let impressions = old?.impressions ?? null;
    let clicks = old?.clicks ?? null;
    let pagesJson = old?.pagesJson ?? "[]";
    const r = merged.ranking;
    // Search Console is first-party: a provider estimate never overwrites it.
    if (r && !(old?.positionSource === "gsc" && r.source !== "gsc" && old.position !== null)) {
      if (!old?.positionAt || now.getTime() - old.positionAt.getTime() > 20 * 3_600_000) prevPosition = old?.position ?? null;
      position = r.position;
      positionSource = r.source;
      positionAt = now;
      currentUrl = r.url ?? currentUrl;
      if (r.impressions !== undefined) impressions = r.impressions;
      if (r.clicks !== undefined) clicks = r.clicks;
      if (r.pages) pagesJson = JSON.stringify(r.pages.slice(0, 6));
    }

    const comps = merged.competitors ?? (old && old.competitorsJson !== "[]" ? (JSON.parse(old.competitorsJson) as Competitor[]) : null);
    const bigSitesInTop10 = comps ? comps.filter((c) => c.position <= 10 && BIG_SITES.test(c.domain)).length : null;
    const a = analysePhrase(merged.phrase, ctx.catalog, providerIntent);
    const parts = scoreKeyword({ volume, impressions, difficulty, cpc, words: norm.split(" ").length, position, serpDomainRank, bigSitesInTop10, intentValue: intentValue(a.intent), relevance: a.relevance.score });
    const buyerIntent = a.intent.intent === "transactional" || a.intent.intent === "commercial";
    const pr = priorityFor(parts, { position, buyerIntent });

    const data = {
      volume, difficulty, cpc,
      competition: merged.competition ?? old?.competition ?? null,
      providerIntent,
      serpFeaturesJson: merged.serpFeatures ? JSON.stringify(merged.serpFeatures) : (old?.serpFeaturesJson ?? "[]"),
      serpDomainRank,
      serpRefDomains: merged.serpRefDomains ?? old?.serpRefDomains ?? null,
      metricsAt: merged.metricsAsked ? now : (old?.metricsAt ?? null),
      intent: a.intent.intent,
      specificJson: JSON.stringify(a.intent.specific),
      intentBasis: a.intent.basis,
      relevance: a.relevance.score,
      relevanceReason: a.relevance.reason,
      entityType: a.entity.type,
      entityLabel: a.entity.label,
      clusterKey: a.clusterKey,
      score: parts.score,
      scoreJson: JSON.stringify(parts),
      priority: pr.priority,
      priorityWhy: pr.why,
      sourcesJson: JSON.stringify(sources),
      position, prevPosition, positionSource, positionAt, currentUrl, impressions, clicks, pagesJson,
      competitorsJson: merged.competitors ? JSON.stringify(merged.competitors.slice(0, 10)) : (old?.competitorsJson ?? "[]"),
      serpAt: merged.serpChecked ? now : (old?.serpAt ?? null),
    };
    if (old) {
      // Unchanged rows are not rewritten, so a full re-analysis only touches what actually moved.
      const prior = old as unknown as Record<string, unknown>;
      const same = Object.entries(data).every(([k, v]) => { const o = prior[k]; return o instanceof Date || v instanceof Date ? (o instanceof Date ? o.getTime() : o) === (v instanceof Date ? v.getTime() : v) : (o ?? null) === (v ?? null); });
      if (!same) updates.push({ id: old.id, data });
    }
    else creates.push({ phrase: merged.phrase.toLowerCase().replace(/\s+/g, " ").trim(), norm, ...data });
  }
  for (let i = 0; i < creates.length; i += 500) await db.seoKeyword.createMany({ data: creates.slice(i, i + 500), skipDuplicates: true });
  for (let i = 0; i < updates.length; i += 100) await db.$transaction(updates.slice(i, i + 100).map((u) => db.seoKeyword.update({ where: { id: u.id }, data: u.data })));
  return { created: creates.length, updated: updates.length };
}

// ───────────────────────────── run bookkeeping ─────────────────────────────

export type StepResult = { ok: boolean; summary: string; credits: number };

async function step(kind: string, actorId: string | null | undefined, fn: (ctx: SeoContext) => Promise<{ summary: string; credits?: number; detail?: unknown }>): Promise<StepResult> {
  const run = await db.seoRun.create({ data: { kind, actorId: actorId ?? null } });
  try {
    const ctx = await buildContext();
    const r = await fn(ctx);
    await db.seoRun.update({ where: { id: run.id }, data: { status: "ok", summary: r.summary, credits: r.credits ?? 0, detailJson: JSON.stringify(r.detail ?? {}), finishedAt: new Date() } });
    return { ok: true, summary: r.summary, credits: r.credits ?? 0 };
  } catch (err) {
    const blocked = err instanceof OpenSeoError && (err.code === "budget" || err.code === "not_configured");
    const message = err instanceof Error ? err.message : String(err);
    if (!(err instanceof OpenSeoError)) console.error(`[seo] ${kind} failed`, err);
    await db.seoRun.update({ where: { id: run.id }, data: { status: blocked ? "blocked" : "error", summary: message.slice(0, 500), finishedAt: new Date() } });
    return { ok: false, summary: message, credits: 0 };
  }
}

// ───────────────────────────── free steps ─────────────────────────────

/** Catalogue and topic candidates, unmeasured. No API call. */
export const stepCandidates = (actorId?: string | null, opts: { rebuild?: boolean } = {}) =>
  step("candidates", actorId, async (ctx) => {
    const phrases = candidatePhrases(ctx);
    const r = await saveKeywords(phrases.map((phrase) => ({ phrase, source: "catalog" })), ctx);
    if (opts.rebuild !== false) await rebuildStrategy(ctx);
    return { summary: `${phrases.length.toLocaleString("en-US")} candidate keywords from the catalogue and topic list: ${r.created.toLocaleString("en-US")} new, ${r.updated.toLocaleString("en-US")} already known. No credits used.` };
  });

type GscRow = { keys: string[]; clicks: number; impressions: number; position?: number };
type GscReply = { ok?: boolean; reason?: string; rows?: GscRow[]; hasMore?: boolean; nextStartRow?: number; startDate?: string; endDate?: string };

/** Search Console, last 28 days, by query and page: real positions, free. Also the rank snapshot. */
export const stepSearchConsole = (actorId?: string | null, opts: { rebuild?: boolean } = {}) =>
  step("search_console", actorId, async (ctx) => {
    const rows: GscRow[] = [];
    let startRow = 0;
    let window = "";
    for (let page = 0; page < 5; page++) {
      const r = await callTool<GscReply>("get_search_console_performance", { dimensions: ["query", "page"], dateRange: "last_28_days", rowLimit: 1000, startRow }, { summary: `query+page, last 28 days, from row ${startRow}`, lines: (d) => d.rows?.length ?? 0, actorId });
      if (r.data.ok === false) throw new OpenSeoError(`Search Console is not connected to the OpenSEO project (${r.data.reason ?? "no connection"}). Connect it in OpenSEO › Settings › Integrations.`, "tool");
      rows.push(...(r.data.rows ?? []));
      window = `${r.data.startDate} → ${r.data.endDate}`;
      if (!r.data.hasMore || r.data.nextStartRow === undefined) break;
      startRow = r.data.nextStartRow;
    }
    const byQuery = new Map<string, { phrase: string; pages: { url: string; impressions: number; position: number; clicks: number }[] }>();
    for (const row of rows) {
      const [query, url] = row.keys;
      // Search operators and quoted lookups are not keywords anyone can target.
      if (!query || !url || /(site:|inurl:|intitle:|")/.test(query)) continue;
      const norm = normPhrase(query);
      const g = byQuery.get(norm) ?? { phrase: query, pages: [] };
      // "#1" and "1" spellings of one query land on the same page: merge them, weighting position by impressions.
      const same = g.pages.find((p) => p.url === url);
      if (same) {
        const total = same.impressions + row.impressions;
        same.position = total > 0 ? (same.position * same.impressions + (row.position ?? 0) * row.impressions) / total : same.position;
        same.impressions = total;
        same.clicks += row.clicks;
      } else g.pages.push({ url, impressions: row.impressions, position: row.position ?? 0, clicks: row.clicks });
      byQuery.set(norm, g);
    }
    const inputs: KeywordInput[] = [];
    for (const g of byQuery.values()) {
      const impressions = g.pages.reduce((n, p) => n + p.impressions, 0);
      const clicks = g.pages.reduce((n, p) => n + p.clicks, 0);
      const pages = g.pages.sort((a, b) => b.impressions - a.impressions);
      // The page Google shows most often is the ranking page; its position is the keyword's position.
      const top = pages[0];
      inputs.push({ phrase: g.phrase, source: "gsc", ranking: { position: Math.round(top.position * 10) / 10, source: "gsc", url: top.url, impressions, clicks, pages: pages.map((p) => ({ url: p.url, impressions: p.impressions, position: Math.round(p.position * 10) / 10 })) } });
    }
    const saved = await saveKeywords(inputs, ctx);

    // Keywords Search Console no longer reports have dropped out of the window.
    const seen = new Set(byQuery.keys());
    const stale = (await db.seoKeyword.findMany({ where: { positionSource: "gsc", position: { not: null } }, select: { id: true, norm: true, position: true } })).filter((k) => !seen.has(k.norm));
    for (let i = 0; i < stale.length; i += 100) await db.$transaction(stale.slice(i, i + 100).map((k) => db.seoKeyword.update({ where: { id: k.id }, data: { prevPosition: k.position, position: null, positionAt: new Date(), impressions: 0, clicks: 0 } })));

    // One snapshot per keyword per day.
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const tracked = await db.seoKeyword.findMany({ where: { norm: { in: [...seen].slice(0, 5000) } }, select: { id: true, position: true, currentUrl: true, impressions: true, clicks: true } });
    await db.seoRankSnapshot.deleteMany({ where: { day, source: "gsc" } });
    for (let i = 0; i < tracked.length; i += 500) await db.seoRankSnapshot.createMany({ data: tracked.slice(i, i + 500).map((k) => ({ keywordId: k.id, day, position: k.position, url: k.currentUrl, clicks: k.clicks, impressions: k.impressions, source: "gsc" })), skipDuplicates: true });

    if (opts.rebuild !== false) await rebuildStrategy(ctx);
    return { summary: `Search Console ${window}: ${byQuery.size.toLocaleString("en-US")} queries the site appeared for (${saved.created} new keywords), ${stale.length} dropped out. No credits used.`, detail: { queries: byQuery.size, rows: rows.length } };
  });

/** Re-classify, re-score, re-cluster everything and rebuild the page plans and insights. No API call. */
export const stepAnalyse = (actorId?: string | null) =>
  step("analyse", actorId, async (ctx) => {
    // Re-score stored keywords against the current catalogue (stock and guides change relevance and page plans).
    let cursor: string | undefined;
    let n = 0;
    for (;;) {
      const batch = await db.seoKeyword.findMany({ take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" }, select: { id: true, phrase: true } });
      if (batch.length === 0) break;
      await saveKeywords(batch.map((k) => ({ phrase: k.phrase, source: "" })), ctx);
      n += batch.length;
      cursor = batch[batch.length - 1].id;
      if (batch.length < 1000) break;
    }
    const r = await rebuildStrategy(ctx);
    return { summary: `${n.toLocaleString("en-US")} keywords re-scored into ${r.clusters.toLocaleString("en-US")} clusters; ${r.insights} opportunities detected. No credits used.` };
  });

// ───────────────────────────── paid steps ─────────────────────────────

type ResearchReply = { results?: ({ seed: string; ok: true; rowCount: number; source: string; rows: unknown[] } | { seed: string; ok: false; error: string })[] };

/** Related-keyword research for 1–5 seeds (about 54 credits per seed at 150 rows). */
export const stepResearch = (seeds: string[], actorId?: string | null) =>
  step("research", actorId, async (ctx) => {
    const list = [...new Set(seeds.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 5);
    if (list.length === 0) throw new OpenSeoError("Enter at least one seed keyword.", "tool");
    const r = await callTool<ResearchReply>("research_keywords", { seeds: list.map((seed) => ({ seed })), resultLimit: 150 }, { estimate: COST.research_keywords(list.length, 150), summary: `seeds: ${list.join(", ")}`, lines: (d) => (d.results ?? []).reduce((n, x) => n + (x.ok ? x.rows.length : 0), 0), actorId });
    const inputs: KeywordInput[] = [];
    const failed: string[] = [];
    for (const res of r.data.results ?? []) {
      if (!res.ok) { failed.push(`${res.seed}: ${res.error}`); continue; }
      for (const row of res.rows) { const k = readMetricRow(row, `research:${res.seed}`); if (k) inputs.push(k); }
    }
    const saved = await saveKeywords(inputs, ctx);
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `Research for ${list.length} seed(s): ${inputs.length} keywords returned, ${saved.created} new. ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.${failed.length ? ` Failed: ${failed.join("; ")}` : ""}`, detail: { seeds: list, failed } };
  });

/** Real metrics for the most relevant unmeasured keywords, up to 700 in one call. */
export const stepMetrics = (limit: number, actorId?: string | null) =>
  step("metrics", actorId, async (ctx) => {
    const take = Math.min(700, Math.max(10, limit));
    const pending = await db.seoKeyword.findMany({ where: { metricsAt: null, relevance: { gte: 60 } }, orderBy: [{ impressions: { sort: "desc", nulls: "last" } }, { relevance: "desc" }, { createdAt: "asc" }], take, select: { phrase: true, norm: true } });
    if (pending.length === 0) return { summary: "Every relevant keyword already has metrics. Nothing to fetch, no credits used." };
    const r = await callTool<{ keywords?: unknown[] }>("get_keyword_metrics", { keywords: pending.map((k) => k.phrase), includeMonthlyTrends: false }, { estimate: COST.get_keyword_metrics(pending.length), summary: `${pending.length} phrases`, lines: (d) => d.keywords?.length ?? 0, actorId });
    const got = new Map<string, KeywordInput>();
    for (const row of r.data.keywords ?? []) { const k = readMetricRow(row, "catalog"); if (k) got.set(normPhrase(k.phrase), k); }
    // Phrases the provider has no data for are marked as asked, so they are not paid for twice.
    const inputs = pending.map((k) => got.get(k.norm) ?? { phrase: k.phrase, source: "catalog", metricsAsked: true });
    await saveKeywords(inputs, ctx);
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `Metrics requested for ${pending.length} keywords: ${got.size} have search data, ${pending.length - got.size} have none. ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.` };
  });

type SerpReply = { results?: ({ keyword: string; ok: true; items: { type?: string | null; rank: number | null; title: string | null; url: string | null; domain: string | null }[] } | { keyword: string; ok: false; error: string })[] };

/** Live Google results for the best keywords that have not been looked at yet (about 5 credits each). */
export const stepSerps = (count: number, actorId?: string | null) =>
  step("serp", actorId, async (ctx) => {
    const take = Math.min(10, Math.max(1, count));
    const targets = await db.seoKeyword.findMany({ where: { serpAt: null, score: { not: null }, priority: { in: ["high", "medium"] }, clusterRole: "primary" }, orderBy: [{ score: "desc" }], take, select: { phrase: true } });
    if (targets.length === 0) return { summary: "No scored high- or medium-priority primary keyword is waiting for a SERP check. No credits used." };
    const r = await callTool<SerpReply>("get_serp_results", { queries: targets.map((t) => ({ keyword: t.phrase })), depth: 20 }, { estimate: COST.get_serp_results(targets.length, 20), summary: `${targets.length} keyword(s), depth 20`, lines: (d) => (d.results ?? []).length, actorId });
    const inputs: KeywordInput[] = [];
    for (const res of r.data.results ?? []) {
      if (!res.ok) continue;
      const organic = res.items.filter((i) => i.type === "organic" && i.domain && i.rank !== null);
      const features = [...new Set(res.items.map((i) => i.type).filter((t): t is string => Boolean(t) && t !== "organic"))];
      const ours = organic.find((i) => isOurs(i.domain));
      inputs.push({
        phrase: res.keyword, source: "serp", serpChecked: true, serpFeatures: features,
        competitors: organic.filter((i) => !isOurs(i.domain)).slice(0, 10).map((i) => ({ domain: (i.domain ?? "").replace(/^www\./, ""), position: i.rank ?? 0, url: (i.url ?? "").split("?")[0], title: (i.title ?? "").slice(0, 120) })),
        ...(ours ? { ranking: { position: ours.rank, source: "serp" as const, url: (ours.url ?? "").split("?")[0] } } : {}),
      });
    }
    await saveKeywords(inputs, ctx);
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `Google results read for ${inputs.length} keyword(s): competitors and SERP features stored. ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.` };
  });

type RankedReply = { keywords?: unknown[]; totalCount?: number | null };

/** The keywords a competitor ranks in the top 20 for: the raw material of the keyword gap (about 24 credits). */
export const stepCompetitorGap = (domain: string, actorId?: string | null) =>
  step("gap", actorId, async (ctx) => {
    const target = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(target)) throw new OpenSeoError("Enter a competitor domain such as example.com.", "tool");
    if (isOurs(target)) throw new OpenSeoError("That is this site. Use the Search Console sync for its own rankings.", "tool");
    const r = await callTool<RankedReply>("get_ranked_keywords", { target, maxRank: 20, minSearchVolume: 30, sortBy: "search_volume", limit: 100, resultTypes: ["organic"] }, { estimate: COST.get_ranked_keywords(), summary: `${target}, top 20, volume ≥ 30`, lines: (d) => d.keywords?.length ?? 0, actorId });
    const inputs: KeywordInput[] = [];
    for (const row of r.data.keywords ?? []) {
      const k = readMetricRow(row, `competitor:${target}`);
      if (!k) continue;
      const position = num(first(row, "ranked_serp_element.serp_item.rank_absolute", "rank"));
      const url = first(row, "ranked_serp_element.serp_item.url", "url");
      const title = first(row, "ranked_serp_element.serp_item.title", "title");
      if (position !== null) k.competitors = [{ domain: target, position, url: typeof url === "string" ? url : "", title: typeof title === "string" ? title.slice(0, 120) : "" }];
      inputs.push(k);
    }
    // Merge with competitors already recorded for the same keyword instead of replacing them.
    const known = new Map((await db.seoKeyword.findMany({ where: { norm: { in: inputs.map((i) => normPhrase(i.phrase)) } }, select: { norm: true, competitorsJson: true } })).map((k) => [k.norm, JSON.parse(k.competitorsJson) as Competitor[]]));
    for (const i of inputs) {
      const prior = (known.get(normPhrase(i.phrase)) ?? []).filter((c) => c.domain !== target);
      i.competitors = [...(i.competitors ?? []), ...prior].sort((a, b) => a.position - b.position);
    }
    const saved = await saveKeywords(inputs, ctx);
    await db.seoCompetitor.upsert({ where: { domain: target }, create: { domain: target, gapAt: new Date(), gapKeywords: inputs.length }, update: { gapAt: new Date(), gapKeywords: inputs.length } });
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `${target}: ${inputs.length} keywords it ranks top-20 for (of ${r.data.totalCount ?? "?"} in total), ${saved.created} new to this system. ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.` };
  });

/** Google's top 100 for this site according to the provider's index: positions beyond what Search Console shows (about 24 credits). */
export const stepOwnRankings = (actorId?: string | null) =>
  step("own_rankings", actorId, async (ctx) => {
    const r = await callTool<RankedReply>("get_ranked_keywords", { target: host(), sortBy: "rank", limit: 100, resultTypes: ["organic"] }, { estimate: COST.get_ranked_keywords(), summary: `${host()} ranked keywords`, lines: (d) => d.keywords?.length ?? 0, actorId });
    const inputs: KeywordInput[] = [];
    for (const row of r.data.keywords ?? []) {
      const k = readMetricRow(row, "ranked");
      if (!k) continue;
      const position = num(first(row, "ranked_serp_element.serp_item.rank_absolute"));
      const url = first(row, "ranked_serp_element.serp_item.url");
      if (position !== null) k.ranking = { position, source: "labs", url: typeof url === "string" ? url : null };
      inputs.push(k);
    }
    const saved = await saveKeywords(inputs, ctx);
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `${inputs.length} keywords the site ranks for in Google's top 100, with difficulty, intent and SERP data (${saved.created} new). ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.` };
  });

export type CompetitorsReply = { competitors?: { domain: string; avg_position?: number; median_position?: number; rating?: number; etv?: number; keywords_count?: number; visibility?: number; keywords_positions?: Record<string, number[]> }[] };

/**
 * Who competes across this site's best keywords, and at which position for each one
 * (one call for up to 100 keywords, about 22 credits). The raw material of the war room.
 */
export const stepFindCompetitors = (actorId?: string | null) =>
  step("competitors", actorId, async (ctx) => {
    const targets = await db.seoKeyword.findMany({ where: { score: { not: null }, relevance: { gte: 70 }, volume: { gte: 30 } }, orderBy: [{ score: "desc" }], take: 100, select: { phrase: true } });
    if (targets.length < 5) return { summary: "Fewer than five scored, relevant keywords: fetch metrics first. No credits used." };
    const r = await callTool<CompetitorsReply>("find_serp_competitors", { keywords: targets.map((t) => t.phrase), excludeDomains: [host()], limit: 50 }, { estimate: COST.find_serp_competitors(), summary: `${targets.length} keywords, top 50 domains`, lines: (d) => d.competitors?.length ?? 0, actorId });
    const stored = await applyCompetitorComparison(r.data, ctx);
    await rebuildStrategy(ctx);
    return { credits: r.credits, summary: `${(r.data.competitors ?? []).length} competing domains compared across ${targets.length} keywords; positions stored for ${stored} keywords. ${r.credits} credits used${r.balance !== null ? `, ${r.balance} left` : ""}.` };
  });

/** Stores a competitor comparison: one row per domain, and each domain's position on each keyword. */
export async function applyCompetitorComparison(reply: CompetitorsReply, ctx: SeoContext): Promise<number> {
    const byKeyword = new Map<string, Competitor[]>();
    const now = new Date();
    for (const c of reply.competitors ?? []) {
      const domain = c.domain.toLowerCase().replace(/^www\./, "");
      const data = { medianPosition: c.median_position ?? null, visibility: c.visibility ?? null, etv: c.etv ?? null, rating: c.rating ?? null, comparedAt: now };
      await db.seoCompetitor.upsert({ where: { domain }, create: { domain, ...data }, update: data });
      for (const [phrase, positions] of Object.entries(c.keywords_positions ?? {})) {
        const position = Math.min(...positions);
        if (!Number.isFinite(position)) continue;
        byKeyword.set(normPhrase(phrase), [...(byKeyword.get(normPhrase(phrase)) ?? []), { domain, position, url: "", title: "" }]);
      }
    }
    // Merge with what is already known: a URL and title read from a live result are worth keeping.
    const known = await db.seoKeyword.findMany({ where: { norm: { in: [...byKeyword.keys()] } }, select: { phrase: true, norm: true, competitorsJson: true } });
    const inputs: KeywordInput[] = known.map((k) => {
      const prior = JSON.parse(k.competitorsJson) as Competitor[];
      const merged = new Map<string, Competitor>();
      for (const c of byKeyword.get(k.norm) ?? []) merged.set(c.domain, c);
      for (const c of prior) merged.set(c.domain, c.url ? c : (merged.get(c.domain) ?? c));
      return { phrase: k.phrase, source: "", competitors: [...merged.values()].sort((a, b) => a.position - b.position).slice(0, 25) };
    });
    await saveKeywords(inputs, ctx);
    return inputs.length;
}

/**
 * Fetches competitors' ranking pages for the best attack keywords and measures them: words,
 * product/price markup, the latest year mentioned. One polite GET per page, no API credits.
 */
export const stepInspectRivalPages = (count: number, actorId?: string | null) =>
  step("inspect_rivals", actorId, async (ctx) => {
    const { parsePage } = await import("@/lib/seo/intel/html");
    const rows = await db.seoKeyword.findMany({ where: { attackScore: { not: null }, attackJson: { contains: '"url":"http' } }, orderBy: { attackScore: "desc" }, take: 200, select: { attackJson: true } });
    const urls = [...new Set(rows.map((k) => (JSON.parse(k.attackJson) as { target?: { url?: string } }).target?.url ?? "").filter(Boolean))];
    const done = new Set((await db.seoCompetitorPage.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((p) => p.url));
    const todo = urls.filter((u) => !done.has(u)).slice(0, Math.min(40, Math.max(5, count)));
    if (todo.length === 0) return { summary: "Every competitor page behind the current attack keywords has been inspected. Read more Google results or run a gap to add pages. No credits used." };
    let ok = 0;
    for (const url of todo) {
      let domain = "";
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
      try {
        const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; RCC-Research/1.0)", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
        const html = res.ok ? (await res.text()).slice(0, 1_500_000) : "";
        const p = parsePage(html, new URL(url).origin);
        const years = [...html.replace(/<script[\s\S]*?<\/script>/gi, " ").matchAll(/\b(20[1-3]\d)\b/g)].map((m) => Number(m[1])).filter((y) => y <= new Date().getUTCFullYear());
        const data = { domain, httpStatus: res.status, title: p.title, wordCount: res.ok ? p.wordCount : null, hasOffer: res.ok ? /"@type"\s*:\s*"(Product|Offer|AggregateOffer)"|itemprop="price"|add to cart|add-to-cart/i.test(html) : null, latestYear: years.length ? Math.max(...years) : null, checkedAt: new Date() };
        await db.seoCompetitorPage.upsert({ where: { url }, create: { url, ...data }, update: data });
        if (res.ok) ok += 1;
      } catch {
        await db.seoCompetitorPage.upsert({ where: { url }, create: { url, domain, httpStatus: 0 }, update: { httpStatus: 0, checkedAt: new Date() } });
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    await rebuildStrategy(ctx);
    return { summary: `${todo.length} competitor pages fetched, ${ok} readable (the others block automated visits and stay unmeasured). No credits used.` };
  });

/** Free: the authentication test. */
export async function connectionStatus(): Promise<{ ok: boolean; message: string; credits: number | null; email: string | null }> {
  try {
    const a = await whoami();
    return { ok: true, message: `Connected as ${a.email} (${a.mode}).`, credits: a.credits, email: a.email };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed.", credits: null, email: null };
  }
}
