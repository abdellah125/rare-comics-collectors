import "server-only";
import { db } from "@/lib/db";
import { publishedWhere } from "@/lib/catalog/products";
import { getSettings } from "@/lib/settings";
import { keywordReport, SemrushError } from "@/lib/seo/semrush";
import { normalisePhrase, type KeywordRow } from "@/lib/seo/semrush-csv";

/**
 * Keyword research on top of the Semrush client, cache first:
 *   - a phrase already fetched for the same database within "seo.semrushCacheDays" is served
 *     from KeywordMetric and costs nothing;
 *   - phrases Semrush has no data for are stored too (volume null) so they are not asked again;
 *   - overview metrics come from one phrase_all call per 100 phrases (10 units a line);
 *   - related and question keywords are separate, dearer reports (40 units a line) and are only
 *     fetched when asked for, with a per-phrase line limit, and are cached on the phrase's row.
 */

export type ResearchInput = { phrases: string[]; database: string; related: boolean; questions: boolean; limit: number; actorId?: string | null };
export type ResearchResult = {
  results: KeywordSummary[];
  fetched: number;
  cached: number;
  units: number;
  warnings: string[];
};
export type KeywordSummary = {
  phrase: string;
  database: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  results: number | null;
  difficulty: number | null;
  intents: string | null;
  fetchedAt: Date;
  related: KeywordRow[];
  questions: KeywordRow[];
  fromCache: boolean;
};

const fresh = (at: Date | null, days: number) => Boolean(at && Date.now() - at.getTime() < days * 86_400_000);

export async function researchKeywords(input: ResearchInput): Promise<ResearchResult> {
  const settings = await getSettings();
  const cacheDays = settings["seo.semrushCacheDays"];
  const phrases = [...new Set(input.phrases.map(normalisePhrase).filter(Boolean))].slice(0, 50);
  const warnings: string[] = [];
  let units = 0;
  let fetched = 0;

  const existing = await db.keywordMetric.findMany({ where: { database: input.database, phrase: { in: phrases } } });
  const byPhrase = new Map(existing.map((k) => [k.phrase, k]));
  const stale = phrases.filter((p) => !fresh(byPhrase.get(p)?.fetchedAt ?? null, cacheDays));

  // 1. Overview metrics, one call per 100 phrases.
  for (let i = 0; i < stale.length; i += 100) {
    const chunk = stale.slice(i, i + 100);
    try {
      const r = await keywordReport("phrase_all", chunk, input.database, { actorId: input.actorId });
      units += r.units;
      const found = new Map(r.rows.map((row) => [row.phrase, row]));
      for (const phrase of chunk) {
        const row = found.get(phrase);
        const data = { volume: row?.volume ?? null, cpc: row?.cpc ?? null, competition: row?.competition ?? null, results: row?.results ?? null, difficulty: row?.difficulty ?? null, intents: row?.intents ?? null, trendJson: row?.trend ?? null, fetchedAt: new Date(), unitsSpent: { increment: row ? 10 : 0 } };
        const saved = await db.keywordMetric.upsert({ where: { phrase_database: { phrase, database: input.database } }, create: { phrase, database: input.database, ...data, unitsSpent: row ? 10 : 0 }, update: data });
        byPhrase.set(phrase, saved);
        fetched += 1;
      }
    } catch (err) {
      warnings.push(err instanceof SemrushError ? err.message : "Keyword overview failed");
      break;
    }
  }

  // 2. Related and question keywords, per phrase, only when asked and not cached.
  for (const kind of ["related", "questions"] as const) {
    if (!input[kind]) continue;
    for (const phrase of phrases) {
      const row = byPhrase.get(phrase);
      if (!row) continue;
      if (fresh(kind === "related" ? row.relatedFetchedAt : row.questionsFetchedAt, cacheDays)) continue;
      try {
        const r = await keywordReport(kind === "related" ? "phrase_related" : "phrase_questions", [phrase], input.database, { limit: input.limit, actorId: input.actorId });
        units += r.units;
        const data = kind === "related" ? { relatedJson: JSON.stringify(r.rows), relatedFetchedAt: new Date() } : { questionsJson: JSON.stringify(r.rows), questionsFetchedAt: new Date() };
        const saved = await db.keywordMetric.update({ where: { id: row.id }, data: { ...data, unitsSpent: { increment: r.units } } });
        byPhrase.set(phrase, saved);
      } catch (err) {
        warnings.push(`${kind} for "${phrase}": ${err instanceof SemrushError ? err.message : "failed"}`);
        if (err instanceof SemrushError && (err.code === "budget" || err.code === "auth" || err.code === "not_configured")) break;
      }
    }
  }

  const results = phrases.map((phrase) => byPhrase.get(phrase)).filter((k): k is NonNullable<typeof k> => Boolean(k)).map((k) => toSummary(k, !stale.includes(k.phrase)));
  results.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
  return { results, fetched, cached: phrases.length - stale.length, units, warnings };
}

type MetricRow = { phrase: string; database: string; volume: number | null; cpc: number | null; competition: number | null; results: number | null; difficulty: number | null; intents: string | null; fetchedAt: Date; relatedJson: string; questionsJson: string };

export function toSummary(k: MetricRow, fromCache: boolean): KeywordSummary {
  const list = (json: string): KeywordRow[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; } };
  return { phrase: k.phrase, database: k.database, volume: k.volume, cpc: k.cpc, competition: k.competition, results: k.results, difficulty: k.difficulty, intents: k.intents, fetchedAt: k.fetchedAt, related: list(k.relatedJson), questions: list(k.questionsJson), fromCache };
}

/** Everything cached for a database, best volume first (the admin table and the CSV export). */
export async function cachedKeywords(database: string, take = 500) {
  const rows = await db.keywordMetric.findMany({ where: { database }, orderBy: [{ volume: { sort: "desc", nulls: "last" } }, { phrase: "asc" }], take });
  return rows.map((k) => toSummary(k, true));
}

/**
 * Seed phrases drawn from what the store actually sells and writes about — no API call.
 * Series and publishers with the most listings first, phrased the way buyers search.
 */
export async function seedCandidates(max = 60): Promise<{ phrase: string; why: string }[]> {
  const [series, publishers] = await Promise.all([
    db.product.groupBy({ by: ["title"], where: publishedWhere, _count: { _all: true }, orderBy: { _count: { title: "desc" } }, take: 20 }),
    db.product.groupBy({ by: ["publisher"], where: publishedWhere, _count: { _all: true }, orderBy: { _count: { publisher: "desc" } }, take: 5 }),
  ]);
  const out: { phrase: string; why: string }[] = [];
  const push = (phrase: string, why: string) => { const p = normalisePhrase(phrase); if (p && !out.some((o) => o.phrase === p)) out.push({ phrase: p, why }); };
  for (const s of series) {
    push(`${s.title} cgc`, `${s._count._all} listing(s)`);
    push(`${s.title} comic value`, `${s._count._all} listing(s)`);
    push(`${s.title} key issues`, `${s._count._all} listing(s)`);
  }
  for (const p of publishers) push(`${p.publisher.replace(/ comics$/i, "")} comics cgc graded`, `${p._count._all} listing(s)`);
  for (const p of ["cgc graded comics for sale", "buy graded comics online", "cgc 9.8 comics for sale", "silver age comics for sale", "golden age comics for sale", "bronze age key issues", "signature series cgc", "how much is my comic worth", "comic book grading scale", "cgc vs cbcs"]) push(p, "store-wide");
  return out.slice(0, max);
}

/** Usage figures for the admin page. */
export async function usageOverview() {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [today, month, byReport, recent, cachedCount] = await Promise.all([
    db.apiUsage.aggregate({ _sum: { units: true }, _count: { _all: true }, where: { provider: "semrush", createdAt: { gte: dayStart } } }),
    db.apiUsage.aggregate({ _sum: { units: true }, _count: { _all: true }, where: { provider: "semrush", createdAt: { gte: monthStart } } }),
    db.apiUsage.groupBy({ by: ["endpoint", "status"], where: { provider: "semrush", createdAt: { gte: monthStart } }, _sum: { units: true, lines: true }, _count: { _all: true } }),
    db.apiUsage.findMany({ where: { provider: "semrush" }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.keywordMetric.count(),
  ]);
  return { todayUnits: today._sum.units ?? 0, todayCalls: today._count._all, monthUnits: month._sum.units ?? 0, monthCalls: month._count._all, byReport, recent, cachedCount };
}
