import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { budgetBlock, estimateUnits, parseSemrushCsv, parseUnitBalance, redactKey, SEMRUSH_REPORTS, type KeywordRow, type SemrushReport } from "@/lib/seo/semrush-csv";

/**
 * Semrush Analytics API client. The key comes from the SEMRUSH_API_KEY environment variable
 * and never leaves this module: it is added to the request URL here, requests are made from
 * the server only, and every message that could be logged or stored passes through redactKey.
 *
 * Safeguards, in order, before any billable call:
 *   1. configured?            no key → SemrushError, nothing sent
 *   2. daily budget            settings "seo.semrushDailyUnits" against today's ApiUsage rows
 *   3. balance reserve         settings "seo.semrushReserveUnits" against the (0-unit) balance check
 *   4. in-flight dedupe        an identical request already running is awaited, not repeated
 *   5. rate limit              one request at a time, ≥ 250 ms apart (Semrush allows 10/s)
 * Every call, billable or not, is written to ApiUsage with the lines returned and the units
 * they cost, so the admin page can show consumption per day and per report.
 */

export class SemrushError extends Error {
  constructor(message: string, public code: "not_configured" | "budget" | "auth" | "api" | "network") {
    super(message);
    this.name = "SemrushError";
  }
}

const API = "https://api.semrush.com/";
const BALANCE_URL = "https://www.semrush.com/users/countapiunits.html";
const MIN_GAP_MS = 250;
const TIMEOUT_MS = 20_000;
const BALANCE_TTL_MS = 10 * 60_000;

let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
const inFlight = new Map<string, Promise<ReportResult>>();
let balanceCache: { value: number; at: number } | null = null;

export type ReportResult = { rows: KeywordRow[]; lines: number; units: number; status: "ok" | "empty" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialises calls and spaces them out; the returned promise settles with the call's own result. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "text/plain,text/csv,*/*" }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok && !/^ERROR/i.test(text.trim())) throw new SemrushError(`Semrush answered HTTP ${res.status}`, "network");
  return text;
}

async function logUsage(entry: { endpoint: string; params: string; lines?: number; units?: number; status: string; error?: string | null; durationMs?: number; actorId?: string | null }) {
  await db.apiUsage.create({ data: { provider: "semrush", endpoint: entry.endpoint, params: redactKey(entry.params).slice(0, 500), lines: entry.lines ?? 0, units: entry.units ?? 0, status: entry.status, error: entry.error ? redactKey(entry.error).slice(0, 500) : null, durationMs: entry.durationMs ?? null, actorId: entry.actorId ?? null } }).catch((err) => console.error("[semrush] usage log failed", err instanceof Error ? err.message : err));
}

export const semrushConfigured = () => env.semrush.configured;

/** Units used since midnight UTC, from our own log (the only place consumption is counted per day). */
export async function unitsUsedToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const r = await db.apiUsage.aggregate({ _sum: { units: true }, where: { provider: "semrush", createdAt: { gte: start } } });
  return r._sum.units ?? 0;
}

/**
 * Remaining API units. Costs nothing, so it doubles as the authentication test: a wrong key
 * answers with an ERROR line instead of a number. Cached for 10 minutes unless forced.
 */
export async function unitBalance(opts: { force?: boolean; actorId?: string | null } = {}): Promise<number> {
  if (!env.semrush.configured) throw new SemrushError("SEMRUSH_API_KEY is not set on the server.", "not_configured");
  if (!opts.force && balanceCache && Date.now() - balanceCache.at < BALANCE_TTL_MS) return balanceCache.value;
  const started = Date.now();
  try {
    const text = await throttled(() => fetchText(`${BALANCE_URL}?key=${encodeURIComponent(env.semrush.apiKey)}`));
    const value = parseUnitBalance(text);
    if (value === null) {
      const parsed = parseSemrushCsv(text);
      const message = parsed.kind === "error" ? `${parsed.code}: ${parsed.message}` : `unexpected answer "${text.trim().slice(0, 60)}"`;
      await logUsage({ endpoint: "countapiunits", params: "balance check", status: "error", error: message, durationMs: Date.now() - started, actorId: opts.actorId });
      throw new SemrushError(`Semrush rejected the key (${message}).`, parsed.kind === "error" && (parsed.code === 120 || parsed.code === 121) ? "auth" : "api");
    }
    balanceCache = { value, at: Date.now() };
    await logUsage({ endpoint: "countapiunits", params: `balance=${value}`, status: "ok", durationMs: Date.now() - started, actorId: opts.actorId });
    return value;
  } catch (err) {
    if (err instanceof SemrushError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    await logUsage({ endpoint: "countapiunits", params: "balance check", status: "error", error: message, durationMs: Date.now() - started, actorId: opts.actorId });
    throw new SemrushError(`Could not reach Semrush: ${redactKey(message)}`, "network");
  }
}

/** Budget, reserve and balance as the admin page shows them. */
export async function budgetState() {
  const settings = await getSettings();
  const usedToday = await unitsUsedToday();
  const last = await db.apiUsage.findFirst({ where: { provider: "semrush", endpoint: "countapiunits", status: "ok" }, orderBy: { createdAt: "desc" }, select: { params: true, createdAt: true } });
  const balance = last ? Number(last.params.replace("balance=", "")) : null;
  return { dailyLimit: settings["seo.semrushDailyUnits"], reserve: settings["seo.semrushReserveUnits"], usedToday, balance: Number.isFinite(balance) ? balance : null, balanceAt: last?.createdAt ?? null, cacheDays: settings["seo.semrushCacheDays"], database: settings["seo.semrushDatabase"] };
}

/**
 * One keyword report. `phrases` is one phrase (related/questions) or up to 100 (phrase_all);
 * `limit` caps the lines and therefore the cost. Throws SemrushError when a safeguard blocks
 * the call; the block is logged too, so the admin sees why nothing was fetched.
 */
export async function keywordReport(report: SemrushReport, phrases: string[], database: string, opts: { limit?: number; actorId?: string | null } = {}): Promise<ReportResult> {
  if (!env.semrush.configured) throw new SemrushError("SEMRUSH_API_KEY is not set on the server.", "not_configured");
  const list = [...new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))];
  if (list.length === 0) return { rows: [], lines: 0, units: 0, status: "empty" };
  if (report === "phrase_all" && list.length > 100) throw new SemrushError("phrase_all takes at most 100 phrases per call.", "api");
  if (report !== "phrase_all" && list.length !== 1) throw new SemrushError(`${report} takes exactly one phrase.`, "api");
  const limit = report === "phrase_all" ? list.length : Math.min(Math.max(1, opts.limit ?? 20), 100);
  const summary = `${database} ${report === "phrase_all" ? `${list.length} phrase(s)` : `"${list[0]}" limit ${limit}`}`;
  const key = `${report}|${database}|${limit}|${list.join(";")}`;
  const running = inFlight.get(key);
  if (running) return running;

  const task = (async (): Promise<ReportResult> => {
    // Safeguards 2 and 3.
    const settings = await getSettings();
    const estimate = estimateUnits(report, limit);
    let balance: number | null = null;
    try {
      balance = await unitBalance({ actorId: opts.actorId });
    } catch (err) {
      if (err instanceof SemrushError && err.code === "auth") throw err;
      // a network blip on the free balance check must not block work; the daily budget still applies
    }
    const block = budgetBlock(estimate, { dailyLimit: settings["seo.semrushDailyUnits"], usedToday: await unitsUsedToday(), balance, reserve: settings["seo.semrushReserveUnits"] });
    if (block) {
      await logUsage({ endpoint: report, params: summary, status: "blocked", error: block, actorId: opts.actorId });
      throw new SemrushError(block, "budget");
    }

    const params = new URLSearchParams({ type: report, key: env.semrush.apiKey, database, export_columns: SEMRUSH_REPORTS[report].columns, phrase: list.join(";") });
    if (report !== "phrase_all") {
      params.set("display_limit", String(limit));
      params.set("display_sort", "nq_desc");
    }
    const started = Date.now();
    let text: string;
    try {
      text = await throttled(() => fetchText(`${API}?${params.toString()}`));
    } catch (err) {
      const message = redactKey(err instanceof Error ? err.message : String(err));
      await logUsage({ endpoint: report, params: summary, status: "error", error: message, durationMs: Date.now() - started, actorId: opts.actorId });
      throw new SemrushError(`Semrush request failed: ${message}`, "network");
    }
    const parsed = parseSemrushCsv(text);
    if (parsed.kind === "error") {
      await logUsage({ endpoint: report, params: summary, status: "error", error: `${parsed.code}: ${parsed.message}`, durationMs: Date.now() - started, actorId: opts.actorId });
      const auth = parsed.code === 120 || parsed.code === 121;
      throw new SemrushError(`Semrush error ${parsed.code}: ${parsed.message}`, auth ? "auth" : "api");
    }
    const rows = parsed.kind === "rows" ? parsed.rows : [];
    const units = estimateUnits(report, rows.length);
    if (balanceCache) balanceCache = { value: Math.max(0, balanceCache.value - units), at: balanceCache.at };
    await logUsage({ endpoint: report, params: summary, lines: rows.length, units, status: rows.length ? "ok" : "empty", durationMs: Date.now() - started, actorId: opts.actorId });
    return { rows, lines: rows.length, units, status: rows.length ? "ok" : "empty" };
  })();
  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}
