/**
 * Pure helpers for the Semrush Analytics API v3 (no network, no secrets): response parsing,
 * unit prices and the budget arithmetic. Everything that talks to the network lives in
 * semrush.ts; keeping this file pure lets it be unit-tested without an API key.
 *
 * Report types used and their price in API units per returned line (Semrush price list):
 *   phrase_all        keyword overview for up to 100 phrases in one call (volume, CPC, competition,
 *                     results, difficulty, intent)                                       10 units/line
 *   phrase_related    keywords related to one phrase                                     40 units/line
 *   phrase_questions  question keywords containing the phrase                            40 units/line
 *   countapiunits     remaining balance (www.semrush.com/users/countapiunits.html)        0 units
 * All keyword reports take `database` (regional database): "us" for the marketplace's home
 * market, "uk", "ca", "au", "de", "fr", "es", "it", "br" are also accepted here.
 */

export const SEMRUSH_REPORTS = {
  phrase_all: { units: 10, columns: "Ph,Nq,Cp,Co,Nr,Kd,In" },
  phrase_related: { units: 40, columns: "Ph,Nq,Cp,Co,Nr,Kd" },
  phrase_questions: { units: 40, columns: "Ph,Nq,Cp,Co,Nr,Kd" },
} as const;
export type SemrushReport = keyof typeof SEMRUSH_REPORTS;

export const SEMRUSH_DATABASES = ["us", "uk", "ca", "au", "de", "fr", "es", "it", "br"] as const;
export type SemrushDatabase = (typeof SEMRUSH_DATABASES)[number];
export const isSemrushDatabase = (s: string): s is SemrushDatabase => (SEMRUSH_DATABASES as readonly string[]).includes(s);

/** Column headers as Semrush prints them → our field names. */
const COLUMN_NAMES: Record<string, string> = {
  keyword: "phrase",
  "search volume": "volume",
  cpc: "cpc",
  competition: "competition",
  "number of results": "results",
  "keyword difficulty index": "difficulty",
  "keyword difficulty": "difficulty",
  intents: "intents",
  trends: "trend",
};

export type KeywordRow = { phrase: string; volume: number | null; cpc: number | null; competition: number | null; results: number | null; difficulty: number | null; intents: string | null; trend: string | null };

export type SemrushParsed = { kind: "rows"; rows: KeywordRow[] } | { kind: "empty" } | { kind: "error"; code: number; message: string };

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const v = Number.parseFloat(s.replace(/,/g, "."));
  return Number.isFinite(v) ? v : null;
};

/**
 * Semrush answers with a `;`-separated table (header line first) or a single
 * `ERROR <code> :: <message>` line. Code 50 ("NOTHING FOUND") is an empty result, not a failure.
 */
export function parseSemrushCsv(body: string): SemrushParsed {
  const text = body.replace(/^﻿/, "").trim();
  const error = text.match(/^ERROR\s+(\d+)\s*::\s*(.*)$/i);
  if (error) {
    const code = Number(error[1]);
    if (code === 50) return { kind: "empty" };
    return { kind: "error", code, message: error[2].trim() };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { kind: "empty" };
  const header = lines[0].split(";").map((h) => COLUMN_NAMES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  const rows: KeywordRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(";");
    const get = (name: string) => { const i = header.indexOf(name); return i >= 0 ? cells[i]?.trim() : undefined; };
    const phrase = get("phrase");
    if (!phrase) continue;
    rows.push({
      phrase: phrase.toLowerCase(),
      volume: num(get("volume")),
      cpc: num(get("cpc")),
      competition: num(get("competition")),
      results: num(get("results")),
      difficulty: num(get("difficulty")),
      intents: get("intents") || null,
      trend: get("trend") || null,
    });
  }
  return rows.length ? { kind: "rows", rows } : { kind: "empty" };
}

/** The balance endpoint prints one integer. */
export function parseUnitBalance(body: string): number | null {
  const m = body.trim().match(/^\d+$/);
  return m ? Number(m[0]) : null;
}

/** Keyword normalisation shared by cache keys, dedupe and requests. */
export function normalisePhrase(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”"]/g, "").replace(/\s+/g, " ").replace(/^[\s,;]+|[\s,;]+$/g, "").trim();
}

/** Splits pasted input (one per line, or comma-separated), normalises and dedupes, keeping order. */
export function splitPhrases(input: string, max = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\n,]+/)) {
    const p = normalisePhrase(raw);
    if (!p || p.length > 80 || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** What a report call will cost at most (Semrush bills per returned line, never more than requested). */
export function estimateUnits(report: SemrushReport, lines: number): number {
  return SEMRUSH_REPORTS[report].units * Math.max(0, lines);
}

export type BudgetState = { dailyLimit: number; usedToday: number; balance: number | null; reserve: number };

/** Null when the call may go ahead, otherwise the reason it must not. */
export function budgetBlock(estimate: number, b: BudgetState): string | null {
  if (b.dailyLimit > 0 && b.usedToday + estimate > b.dailyLimit) return `Daily budget: ${b.usedToday.toLocaleString("en-US")} of ${b.dailyLimit.toLocaleString("en-US")} units used today, this call could take ${estimate.toLocaleString("en-US")} more`;
  if (b.balance !== null && b.balance - estimate < b.reserve) return `Balance guard: ${b.balance.toLocaleString("en-US")} units left, keeping a reserve of ${b.reserve.toLocaleString("en-US")}; this call could take ${estimate.toLocaleString("en-US")}`;
  return null;
}

/** Strips the API key from anything that might be logged or stored. */
export function redactKey(text: string): string {
  return text.replace(/([?&]key=)[^&\s"']+/gi, "$1***");
}
