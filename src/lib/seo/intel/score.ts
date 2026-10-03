/**
 * Keyword opportunity score, 0–100, built from four visible components. Nothing is estimated
 * when the underlying metric is missing: a component without data is null, and a keyword with
 * neither a difficulty figure nor a current position has no score at all ("needs metrics").
 *
 *   score = (0.30 × demand + 0.35 × rankability + 0.35 × intent value) × relevance / 100
 *
 * Relevance multiplies rather than adds: 50,000 searches a month for something the shop does
 * not sell is worth nothing. Rankability and intent together outweigh demand, so a 500-search
 * keyword the site can realistically win beats a 50,000-search keyword held by huge sites.
 */

export type ScoreInput = {
  volume: number | null;
  /** Search Console impressions over the last 28 days, used as demand evidence when no volume is known */
  impressions: number | null;
  difficulty: number | null;
  cpc: number | null;
  words: number;
  /** current average position, if the site ranks */
  position: number | null;
  /** average main-domain rank (0–1000) of the pages in the top results, when the provider reports it */
  serpDomainRank: number | null;
  /** how many of the top-10 results belong to marketplaces, reference sites and platforms, when a SERP was read */
  bigSitesInTop10?: number | null;
  intentValue: number;
  relevance: number;
};

export type ScoreParts = {
  demand: number | null;
  demandBasis: string;
  rankability: number | null;
  rankabilityBasis: string;
  intentValue: number;
  relevance: number;
  score: number | null;
  /** which inputs were missing */
  missing: string[];
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** 10 searches ≈ 24, 100 ≈ 46, 500 ≈ 62, 1,000 ≈ 69, 10,000 ≈ 92, 25,000+ = 100. */
export const demandFromVolume = (volume: number) => clamp(round(23 * Math.log10(volume + 1)));

export function scoreKeyword(i: ScoreInput): ScoreParts {
  const missing: string[] = [];

  let demand: number | null = null;
  let demandBasis = "no search volume";
  if (i.volume !== null && i.volume > 0) {
    demand = demandFromVolume(i.volume);
    demandBasis = `${i.volume.toLocaleString("en-US")} searches/month`;
  } else if (i.impressions !== null && i.impressions > 0) {
    demand = demandFromVolume(i.impressions);
    demandBasis = `${i.impressions.toLocaleString("en-US")} Search Console impressions in 28 days (no volume figure)`;
  } else {
    missing.push("search volume");
  }

  let rankability: number | null = null;
  const notes: string[] = [];
  if (i.difficulty !== null) {
    rankability = 100 - i.difficulty;
    notes.push(`keyword difficulty ${round(i.difficulty)}`);
    if (i.words >= 4) {
      rankability += 8;
      notes.push("long-tail (+8)");
    }
    if (i.serpDomainRank !== null && i.serpDomainRank >= 600) {
      rankability -= 10;
      notes.push("top results are high-authority domains (−10)");
    }
    const big = i.bigSitesInTop10 ?? 0;
    if (big >= 2) {
      const cut = big >= 4 ? 15 : 8;
      rankability -= cut;
      notes.push(`${big} of the top 10 are marketplaces or reference sites (−${cut})`);
    }
  } else {
    missing.push("keyword difficulty");
  }
  if (i.position !== null) {
    // Already ranking is the strongest evidence that the site can rank.
    const bonus = i.position <= 3 ? 0 : i.position <= 20 ? 20 : i.position <= 50 ? 8 : 0;
    if (rankability === null) {
      rankability = i.position <= 20 ? 70 : i.position <= 50 ? 50 : 35;
      notes.push(`already ranking at ${i.position.toFixed(1)} (difficulty unknown)`);
    } else if (bonus) {
      rankability += bonus;
      notes.push(`already ranking at ${i.position.toFixed(1)} (+${bonus})`);
    }
  }
  if (rankability !== null) rankability = clamp(round(rankability));

  let intentValue = i.intentValue;
  if (i.cpc !== null && i.cpc > 0) intentValue = clamp(intentValue + Math.min(10, round(i.cpc * 4)));

  const score = demand === null || rankability === null ? null : round(((0.3 * demand + 0.35 * rankability + 0.35 * intentValue) * i.relevance) / 100);
  return { demand, demandBasis, rankability, rankabilityBasis: notes.join(", ") || "no difficulty figure and not ranking", intentValue, relevance: i.relevance, score, missing };
}

export const PRIORITIES = ["high", "medium", "long_term", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", long_term: "Long-term", low: "Low" };

/**
 * HIGH: relevant, buyer-adjacent and realistically winnable (or already on the edge of page one).
 * MEDIUM: valuable but harder, or winnable but informational.
 * LONG-TERM: relevant and valuable, held by sites far stronger than this one.
 * LOW: off-topic, navigational or without measurable demand.
 */
export function priorityFor(parts: ScoreParts, opts: { position: number | null; buyerIntent: boolean }): { priority: Priority; why: string } {
  if (parts.relevance < 45) return { priority: "low", why: "not relevant enough to the store's products" };
  if (parts.intentValue <= 15) return { priority: "low", why: "navigational: the searcher wants another site" };
  if (parts.score === null) return { priority: "low", why: `needs ${parts.missing.join(" and ")} before it can be ranked` };
  const striking = opts.position !== null && opts.position > 3 && opts.position <= 15;
  if (striking && parts.relevance >= 60) return { priority: "high", why: `already at position ${opts.position!.toFixed(1)}: a push reaches page one` };
  const r = parts.rankability ?? 0;
  if (r < 35) return { priority: "long_term", why: `relevant, but ${parts.rankabilityBasis}: needs authority first` };
  if (r >= 60 && opts.buyerIntent && parts.relevance >= 70) return { priority: "high", why: `buyer intent, ${parts.rankabilityBasis}, ${parts.demandBasis}` };
  if (r >= 60) return { priority: "medium", why: `winnable (${parts.rankabilityBasis}) but informational: builds topical authority` };
  return { priority: "medium", why: `valuable but competitive (${parts.rankabilityBasis})` };
}
