/**
 * Which topics deserve an article, and in what order. Pure: every figure comes from SEO
 * Intelligence (keyword volume and difficulty, Search Console impressions and positions,
 * the page plan) or from the site itself (articles and listings that already exist).
 *
 * A topic is only eligible when there is evidence that people search for it (a measured
 * volume, or impressions in Search Console) and it is about what the shop does. Nothing is
 * written because a number needs to be reached.
 */
import type { ContentFormat } from "@/lib/content/categories";
import { demandFromVolume } from "@/lib/seo/intel/score";

export type Candidate = {
  keyword: string;
  norm: string;
  clusterKey: string | null;
  /** what the keyword is about, e.g. "Amazing Spider-Man 300" */
  label: string;
  /** issue | first_appearance | series | character | era | publisher | grading | topic */
  entityType: string;
  /** buy | value | learn | all */
  bucket: string;
  intent: string;
  specifics: string[];
  volume: number | null;
  difficulty: number | null;
  /** 0–100, how close the keyword is to what the shop sells and knows */
  relevance: number;
  impressions: number | null;
  position: number | null;
  secondary: string[];
  supporting: string[];
  pageType: string;
  recommendedUrl: string;
  planTitle: string;
  planH1: string;
  planTopics: string[];
  planLinks: { label: string; url: string }[];
  /** published articles about the same entity (topical authority already built) */
  supportArticles: number;
  /** listings on sale that the article can link to */
  productCount: number;
  /** competitors rank for it and the site has no page */
  competitorGap: boolean;
  /** where SEO Intelligence found the keyword: gsc, research:<seed>, catalog, competitor:<domain>… */
  sources?: string[];
};

export type ScoreParts = { volume: number; difficulty: number; intent: number; trend: number; commercial: number; ranking: number; gap: number; authority: number; relevance: number; links: number; products: number };
/** The most each factor can add. They sum to 100. */
export const WEIGHTS: ScoreParts = { volume: 16, difficulty: 12, intent: 8, trend: 6, commercial: 8, ranking: 8, gap: 8, authority: 8, relevance: 14, links: 5, products: 7 };
export const PART_LABEL: Record<keyof ScoreParts, string> = { volume: "Search volume", difficulty: "Keyword difficulty", intent: "Search intent", trend: "Trend / proven demand", commercial: "Commercial intent", ranking: "Existing ranking", gap: "Content gap", authority: "Topical authority", relevance: "Relevance to the shop", links: "Internal links", products: "Product relevance" };

/** Below this the keyword is not about collectible comics closely enough to write for. */
export const MIN_RELEVANCE = 60;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const QUESTION = /^(who|what|when|where|why|which|how|is|are|can|do|does|did|should|will)\b/;
export const isQuestion = (phrase: string) => QUESTION.test(phrase.trim().toLowerCase());

/** True when there is evidence of search demand: a measured volume or Search Console impressions. */
export const hasDemand = (c: Pick<Candidate, "volume" | "impressions">) => (c.volume ?? 0) > 0 || (c.impressions ?? 0) > 0;

export function scoreOpportunity(c: Candidate): { score: number; parts: ScoreParts; reason: string } {
  const commercialSpecific = c.specifics.some((s) => ["buying", "price_value", "investment_rarity"].includes(s));
  const share: ScoreParts = {
    // Monthly impressions stand in for volume when the keyword tool has no figure: the site is shown for it.
    volume: (c.volume ?? 0) > 0 ? demandFromVolume(c.volume!) / 100 : (c.impressions ?? 0) > 0 ? clamp01(demandFromVolume(c.impressions! * 10) / 100) : 0,
    difficulty: c.difficulty === null ? 0.5 : clamp01((100 - c.difficulty) / 100),
    intent: c.intent === "informational" || c.intent === "commercial" ? 1 : c.intent === "transactional" ? 0.4 : 0,
    trend: (c.impressions ?? 0) > 0 ? 1 : 0,
    commercial: c.intent === "commercial" || commercialSpecific ? 1 : c.specifics.includes("grading") ? 0.6 : 0.3,
    ranking: c.position === null ? 0.3 : c.position <= 10 ? 0.2 : c.position <= 30 ? 1 : c.position <= 60 ? 0.6 : 0.3,
    gap: c.competitorGap ? 1 : 0.7,
    authority: clamp01(c.supportArticles / 5),
    relevance: clamp01(c.relevance / 100),
    links: clamp01((c.planLinks.length + c.supportArticles) / 6),
    products: clamp01(c.productCount / 3),
  };
  const parts = Object.fromEntries((Object.keys(WEIGHTS) as (keyof ScoreParts)[]).map((k) => [k, Math.round(share[k] * WEIGHTS[k] * 10) / 10])) as ScoreParts;
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  const why: string[] = [];
  if ((c.volume ?? 0) > 0) why.push(`${c.volume!.toLocaleString("en-US")} searches a month`);
  else if ((c.impressions ?? 0) > 0) why.push(`${c.impressions} Search Console impressions`);
  if (c.difficulty !== null) why.push(`difficulty ${Math.round(c.difficulty)}`);
  if (c.position !== null) why.push(`the site is at position ${Math.round(c.position)} without a dedicated page`);
  else why.push("no page on the site answers it");
  if (c.productCount > 0) why.push(`${c.productCount} listing${c.productCount === 1 ? "" : "s"} to link to`);
  if (c.supportArticles > 0) why.push(`${c.supportArticles} related guide${c.supportArticles === 1 ? "" : "s"} published`);
  return { score, parts, reason: `${c.intent} intent; ${why.join("; ")}.` };
}

const CREATORS = ["stan lee", "jack kirby", "steve ditko", "todd mcfarlane", "jim lee", "frank miller", "alan moore", "bob kane", "bill finger", "john byrne", "chris claremont", "neal adams", "john romita", "alex ross", "joe simon", "will eisner", "george perez", "len wein", "bernie wrightson", "frank frazetta", "rob liefeld", "jim starlin", "john buscema", "carl barks", "jim steranko", "gil kane", "barry windsor smith"];
export const creatorIn = (norm: string): string | null => CREATORS.find((n) => new RegExp(`\\b${n}\\b`).test(norm)) ?? null;

/** Where an article about this keyword is filed. */
export function categoryFor(c: Pick<Candidate, "norm" | "entityType" | "bucket" | "specifics" | "intent">): string {
  const p = c.norm;
  const has = (re: RegExp) => re.test(p);
  if (creatorIn(p)) return "creator-stories";
  if (has(/\b(sell|selling|consign\w*)\b/)) return "selling-guides";
  if (has(/\b(invest\w*|roi|appreciat\w*)\b/)) return "investment-analysis";
  if (has(/\b(auction|ebay|marketplace)\b/)) return "auction-marketplace";
  if (has(/\b(store|storage|bag|bags|board|boards|mylar|protect\w*|ship|shipping|humidity|box|boxes|clean\w*|press\w*)\b/)) return "collector-tips";
  if (has(/\b(cgc|cbcs|slab\w*|census|cert\w*|label)\b/)) return "cgc-cbcs";
  if (c.bucket === "value" || has(/\b(worth|value|values|price|prices)\b/)) return "values-market";
  if (c.entityType === "grading" || has(/\b(grade|grades|grading|graded)\b/)) return "grading-guides";
  if (has(/\bgolden age\b/)) return "golden-age";
  if (has(/\bsilver age\b/)) return "silver-age";
  if (has(/\bbronze age\b/)) return "bronze-age";
  if (c.entityType === "first_appearance" || c.entityType === "character") return "character-stories";
  if (c.bucket === "value" || c.specifics.includes("price_value") || has(/\b(worth|value|values|price|prices)\b/)) return "values-market";
  if (c.entityType === "issue" || has(/\b(key issues?|first print\w*|variant\w*|newsstand|rare)\b/)) return "key-issues";
  if (c.bucket === "buy" || c.specifics.includes("buying") || has(/\b(buy|buying|where to)\b/)) return "buying-guides";
  if (c.entityType === "publisher" || c.entityType === "era" || has(/\b(history|origin|timeline)\b/)) return "comic-history";
  if (c.entityType === "series") return "key-issues";
  if (isQuestion(p)) return "faq";
  return "collecting-guides";
}

/** The shape the article should take, from what is being asked and how much demand there is. */
export function formatFor(c: Pick<Candidate, "norm" | "entityType" | "pageType" | "volume" | "intent">, category: string): ContentFormat {
  const p = c.norm;
  if (c.pageType === "Comparison article" || /\b(vs|versus|or|difference between|compared?)\b/.test(p) && /\b(cgc|cbcs|raw|graded|newsstand|direct|slab\w*|pgx)\b/.test(p)) return "comparison";
  if (/\b(best|top|most valuable|most expensive|list of|key issues)\b/.test(p)) return "list";
  if (category === "creator-stories" || c.entityType === "character") return "profile";
  if (isQuestion(p) && (c.volume ?? 0) < 2500) return "faq";
  if ((c.volume ?? 0) >= 5000 && c.intent === "informational" && ["grading", "era", "topic", "publisher"].includes(c.entityType)) return "longform";
  if (c.entityType === "issue" || c.entityType === "first_appearance") return "article";
  if (c.pageType === "Buying guide" || ["grading-guides", "cgc-cbcs", "buying-guides", "selling-guides", "collector-tips"].includes(category)) return "guide";
  return "article";
}

/**
 * Keyword clusters that SEO Intelligence planned for the same address become one topic: the
 * strongest keyword leads and the others are covered in the same article, never in a second one.
 */
export function mergeByUrl(candidates: Candidate[]): Candidate[] {
  const byUrl = new Map<string, Candidate[]>();
  for (const c of candidates) byUrl.set(c.recommendedUrl, [...(byUrl.get(c.recommendedUrl) ?? []), c]);
  const out: Candidate[] = [];
  for (const group of byUrl.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const ranked = [...group].sort((a, b) => scoreOpportunity(b).score - scoreOpportunity(a).score || (b.volume ?? 0) - (a.volume ?? 0));
    const lead = ranked[0];
    const others = ranked.slice(1);
    out.push({
      ...lead,
      secondary: [...new Set([...lead.secondary, ...others.map((o) => o.keyword), ...others.flatMap((o) => o.secondary)])].filter((k) => k !== lead.keyword).slice(0, 12),
      supporting: [...new Set([...lead.supporting, ...others.flatMap((o) => o.supporting)])].slice(0, 16),
      specifics: [...new Set([...lead.specifics, ...others.flatMap((o) => o.specifics)])],
      planTopics: [...new Set([...lead.planTopics, ...others.flatMap((o) => o.planTopics)])].slice(0, 8),
      planLinks: [...lead.planLinks, ...others.flatMap((o) => o.planLinks)].filter((l, i, all) => all.findIndex((x) => x.url === l.url) === i).slice(0, 8),
      impressions: Math.max(lead.impressions ?? 0, ...others.map((o) => o.impressions ?? 0)) || lead.impressions,
    });
  }
  return out;
}

export type Selected = Candidate & { score: number; parts: ScoreParts; reason: string; category: string; format: ContentFormat };

/**
 * The day's topics: best first, no more than two about the same subject, no category taking
 * more than a third of the day, and few long-form pieces. Stops below the minimum score, so a
 * day with few good topics produces few articles.
 */
export function selectTopics(candidates: Candidate[], opts: { target: number; minScore: number; maxPerEntity?: number; maxLongform?: number; requireDemand?: boolean }): Selected[] {
  const scored = candidates
    .filter((c) => (opts.requireDemand === false || hasDemand(c)) && c.relevance >= MIN_RELEVANCE && c.intent !== "navigational")
    .map((c) => {
      const s = scoreOpportunity(c);
      const category = categoryFor(c);
      return { ...c, ...s, category, format: formatFor(c, category) };
    })
    .filter((c) => c.score >= opts.minScore)
    .sort((a, b) => b.score - a.score || (b.volume ?? 0) - (a.volume ?? 0) || a.norm.localeCompare(b.norm));
  const perEntity = new Map<string, number>();
  const perCategory = new Map<string, number>();
  const categoryCap = Math.max(3, Math.ceil(opts.target / 3));
  const out: Selected[] = [];
  let longform = 0;
  for (const c of scored) {
    if (out.length >= opts.target) break;
    const entity = c.label.toLowerCase();
    if ((perEntity.get(entity) ?? 0) >= (opts.maxPerEntity ?? 2)) continue;
    if ((perCategory.get(c.category) ?? 0) >= categoryCap) continue;
    let format = c.format;
    if (format === "longform" && longform >= (opts.maxLongform ?? 4)) format = "guide";
    if (format === "longform") longform += 1;
    perEntity.set(entity, (perEntity.get(entity) ?? 0) + 1);
    perCategory.set(c.category, (perCategory.get(c.category) ?? 0) + 1);
    out.push({ ...c, format });
  }
  return out;
}
