import "server-only";
import type { ImportCrawl } from "@prisma/client";
import { db } from "@/lib/db";
import { listingToRow, PageFormatError, readPageState } from "@/lib/imports/catalog-page";
import { runImport } from "@/lib/imports/pipeline";
import { robotsAllows, robotsRules } from "@/lib/imports/robots";
import { site } from "@/lib/site";

/**
 * Page-by-page import of the source's catalogue pages (search?page=1 … page=N), in order.
 *
 * How it behaves towards the source:
 *  - it identifies itself (USER_AGENT) and reads robots.txt first; a path robots.txt disallows is
 *    not requested, and the wait between two requests is never shorter than its Crawl-delay;
 *  - one request per catalogue page, one page at a time;
 *  - a refusal (401/403, an access-check page) stops the import with status "blocked". Nothing is
 *    retried around it; an admin decides what to do next;
 *  - "slow down" answers (429/503) are obeyed, with a growing wait;
 *  - a page that keeps failing for another reason is recorded and skipped, so one bad page never
 *    loses the pages already imported.
 *
 * Every product found goes to the review queue through the same pipeline as a file upload.
 */
export const CRAWL_ORIGIN = "https://www.hipcomic.com";
export const USER_AGENT = `RareComicsCollectors-Import/1.0 (+${site.url}; ${site.email})`;
const pagePath = (page: number) => `/search?page=${page}`;
const MIN_DELAY_SECONDS = 6;
const MAX_ATTEMPTS = 3;
const MAX_SLOWDOWNS = 6;

type LogEntry = { at: string; level: "info" | "warn" | "error"; text: string };
const appendLog = (json: string, level: LogEntry["level"], text: string): string => {
  let log: LogEntry[] = [];
  try {
    log = JSON.parse(json) as LogEntry[];
  } catch {
    log = [];
  }
  log.push({ at: new Date().toISOString(), level, text });
  return JSON.stringify(log.slice(-120));
};
const parseList = (json: string): number[] => {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
};

export class CrawlBlocked extends Error {}
class SlowDown extends Error {
  constructor(message: string, public waitSeconds: number) {
    super(message);
  }
}

const fetchText = async (path: string, accept: string) => {
  const res = await fetch(`${CRAWL_ORIGIN}${path}`, { headers: { "user-agent": USER_AGENT, accept }, signal: AbortSignal.timeout(40_000), cache: "no-store", redirect: "follow" });
  return { res, text: await res.text() };
};

/** robots.txt for the page about to be requested: is it allowed, and how long to wait between requests. */
export async function checkRobots(page: number): Promise<{ allowed: boolean; delaySeconds: number }> {
  const { res, text } = await fetchText("/robots.txt", "text/plain");
  // No robots.txt (404) means no restrictions; an unreadable one (5xx) means "do not crawl now".
  if (res.status === 404) return { allowed: true, delaySeconds: MIN_DELAY_SECONDS };
  if (!res.ok) throw new SlowDown(`robots.txt answered HTTP ${res.status}`, 300);
  const rules = robotsRules(text, USER_AGENT);
  return { allowed: robotsAllows(rules, pagePath(page)), delaySeconds: Math.max(MIN_DELAY_SECONDS, Math.ceil(rules.crawlDelay ?? 0) + 1) };
}

async function fetchPage(page: number): Promise<string> {
  const { res, text } = await fetchText(pagePath(page), "text/html");
  const challenged = res.headers.get("cf-mitigated") === "challenge" || (/Just a moment|challenge-platform|cf-chl-/i.test(text.slice(0, 20_000)) && !text.includes("window.__NUXT__="));
  if (res.status === 401 || res.status === 403 || challenged) throw new CrawlBlocked(`The source refused page ${page} (HTTP ${res.status}${challenged ? ", access check" : ""}). The import stopped here; nothing was done to get around it. Ask the source to allow the importer (it identifies itself as "RareComicsCollectors-Import") or to provide a data feed, then press Try again. Files exported from the source can still be uploaded below.`);
  if (res.status === 429 || res.status === 503) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new SlowDown(`the source asked to slow down on page ${page} (HTTP ${res.status})`, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : 0);
  }
  if (!res.ok) throw new Error(`page ${page} answered HTTP ${res.status}`);
  return text;
}

export async function activeCrawl(source: string): Promise<ImportCrawl | null> {
  return db.importCrawl.findFirst({ where: { source }, orderBy: { createdAt: "desc" } });
}

export async function startCrawl(source: string, startPage: number, endPage: number, startedById: string | null): Promise<ImportCrawl> {
  const running = await db.importCrawl.findFirst({ where: { source, status: "running" } });
  if (running) return running;
  return db.importCrawl.create({ data: { source, startPage, endPage, nextPage: startPage, startedById, message: `Pages ${startPage}–${endPage} queued.`, logJson: appendLog("[]", "info", `Import of pages ${startPage}–${endPage} started`) } });
}

export async function setCrawlStatus(id: string, status: "running" | "paused"): Promise<void> {
  const crawl = await db.importCrawl.findUnique({ where: { id } });
  if (!crawl || crawl.status === "completed") return;
  await db.importCrawl.update({ where: { id }, data: { status, attempts: 0, notBefore: new Date(), lockedUntil: null, message: status === "paused" ? "Paused by an admin." : "Resumed.", logJson: appendLog(crawl.logJson, "info", status === "paused" ? "Paused by an admin" : "Resumed by an admin") } });
}

/**
 * Processes the next page if one is due. Safe to call from anywhere and from several places at
 * once (the job, the admin page): a short lock makes sure only one caller fetches, and the wait
 * between requests is enforced here, not by the callers.
 */
export async function advanceCrawl(source: string): Promise<ImportCrawl | null> {
  const crawl = await db.importCrawl.findFirst({ where: { source, status: "running" }, orderBy: { createdAt: "desc" } });
  if (!crawl) return null;
  const now = new Date();
  if (crawl.notBefore > now) return crawl;
  const claimed = await db.importCrawl.updateMany({ where: { id: crawl.id, status: "running", notBefore: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] }, data: { lockedUntil: new Date(now.getTime() + 120_000) } });
  if (claimed.count === 0) return crawl;

  const page = crawl.nextPage;
  const after = (seconds: number) => new Date(Date.now() + seconds * 1000);
  const finishOrNext = (nextPage: number) => (nextPage > crawl.endPage ? { status: "completed", finishedAt: new Date() } : {});
  let delay = crawl.delaySeconds;
  try {
    // robots.txt is re-read at the start, every 25 pages and after any failure (its rules can change).
    if (crawl.pagesDone % 25 === 0 || crawl.attempts > 0) {
      const robots = await checkRobots(page);
      delay = robots.delaySeconds;
      if (!robots.allowed) throw new CrawlBlocked(`robots.txt of the source does not allow ${pagePath(page)}. The import stopped here.`);
      await new Promise((r) => setTimeout(r, 2_000)); // the robots request and the page request are not fired back to back
    }
    const html = await fetchPage(page);
    const state = readPageState(html);
    if (state.listings.length === 0) {
      // Past the last page the source serves: nothing more to import.
      return await db.importCrawl.update({ where: { id: crawl.id }, data: { status: "completed", finishedAt: new Date(), lockedUntil: null, delaySeconds: delay, message: `Page ${page} has no products: the source's catalogue ends at page ${page - 1}.`, logJson: appendLog(crawl.logJson, "warn", `Page ${page} has no products${state.exceeded ? " (the source's pagination limit)" : ""}; import finished`) } });
    }
    const publishers = await knownPublishers();
    const rows = state.listings.map((l, i) => listingToRow(l, `page ${page}`, i + 1, publishers));
    const run = await runImport({ source, kind: "crawl", fileName: `Catalogue page ${page} of ${crawl.endPage}`, rows, startedById: crawl.startedById });
    if (run.status === "failed") throw new Error(run.message ?? "the page could not be imported");
    const nextPage = page + 1;
    const done = nextPage > crawl.endPage;
    return await db.importCrawl.update({
      where: { id: crawl.id },
      data: {
        nextPage,
        pagesDone: { increment: 1 },
        found: { increment: run.rows },
        imported: { increment: Math.max(0, run.created - run.duplicates - run.errors) },
        updated: { increment: run.updated + run.unchanged },
        duplicates: { increment: run.duplicates },
        errors: { increment: run.errors },
        attempts: 0,
        delaySeconds: delay,
        notBefore: after(delay),
        lockedUntil: null,
        message: done ? `All pages ${crawl.startPage}–${crawl.endPage} processed.` : `Page ${page} done: ${run.rows} products found.`,
        logJson: appendLog(crawl.logJson, "info", `Page ${page}: ${run.message}`),
        ...finishOrNext(nextPage),
      },
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (err instanceof CrawlBlocked) {
      return db.importCrawl.update({ where: { id: crawl.id }, data: { status: "blocked", lockedUntil: null, message: text, logJson: appendLog(crawl.logJson, "error", text) } });
    }
    const attempts = crawl.attempts + 1;
    if (err instanceof SlowDown) {
      // Obey the source: wait as long as it says, or longer each time; give up waiting only by pausing.
      const wait = Math.max(err.waitSeconds, Math.min(1800, 60 * 2 ** attempts));
      if (attempts >= MAX_SLOWDOWNS) return db.importCrawl.update({ where: { id: crawl.id }, data: { status: "paused", attempts: 0, lockedUntil: null, message: `Paused: ${text} ${MAX_SLOWDOWNS} times in a row. Resume later.`, logJson: appendLog(crawl.logJson, "error", `${text}; paused after ${MAX_SLOWDOWNS} tries`) } });
      return db.importCrawl.update({ where: { id: crawl.id }, data: { attempts, notBefore: after(wait), lockedUntil: null, message: `Waiting ${Math.round(wait / 60)} min: ${text}.`, logJson: appendLog(crawl.logJson, "warn", `${text}; waiting ${wait}s (try ${attempts})`) } });
    }
    // Anything else (network error, a page in an unexpected form): retry, then record the page and move on.
    if (attempts < MAX_ATTEMPTS) {
      const wait = Math.max(delay, 30 * attempts);
      return db.importCrawl.update({ where: { id: crawl.id }, data: { attempts, notBefore: after(wait), lockedUntil: null, message: `Page ${page} failed (${text}); retrying.`, logJson: appendLog(crawl.logJson, "warn", `Page ${page} failed: ${text} (try ${attempts} of ${MAX_ATTEMPTS})`) } });
    }
    const failed = [...parseList(crawl.failedPagesJson), page];
    const nextPage = page + 1;
    return db.importCrawl.update({
      where: { id: crawl.id },
      data: { nextPage, pagesDone: { increment: 1 }, errors: { increment: 1 }, attempts: 0, failedPagesJson: JSON.stringify(failed), notBefore: after(delay), lockedUntil: null, message: `Page ${page} skipped after ${MAX_ATTEMPTS} tries${err instanceof PageFormatError ? " (unexpected page form)" : ""}.`, logJson: appendLog(crawl.logJson, "error", `Page ${page} skipped after ${MAX_ATTEMPTS} tries: ${text}`), ...finishOrNext(nextPage) },
    });
  }
}

/** Maps a publisher as the source names it ("Marvel") to the name the catalogue already uses ("Marvel Comics"). */
async function knownPublishers(): Promise<(name: string) => string> {
  const rows = await db.brand.findMany({ select: { name: true } });
  const byKey = new Map<string, string>();
  const key = (s: string) => s.toLowerCase().replace(/\b(comics|publishing|publications|entertainment|magazines)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  for (const r of rows) if (key(r.name) && !byKey.has(key(r.name))) byKey.set(key(r.name), r.name);
  return (name) => byKey.get(key(name)) ?? name;
}

export type CrawlProgress = { id: string; status: string; startPage: number; endPage: number; currentPage: number | null; pagesDone: number; pagesTotal: number; found: number; imported: number; updated: number; duplicates: number; errors: number; failedPages: number[]; message: string | null; nextTryAt: string | null; log: LogEntry[] };

export function crawlProgress(c: ImportCrawl): CrawlProgress {
  let log: LogEntry[] = [];
  try {
    log = (JSON.parse(c.logJson) as LogEntry[]).slice(-12).reverse();
  } catch {
    log = [];
  }
  return { id: c.id, status: c.status, startPage: c.startPage, endPage: c.endPage, currentPage: c.status === "completed" ? null : c.nextPage, pagesDone: c.pagesDone, pagesTotal: c.endPage - c.startPage + 1, found: c.found, imported: c.imported, updated: c.updated, duplicates: c.duplicates, errors: c.errors, failedPages: parseList(c.failedPagesJson), message: c.message, nextTryAt: c.status === "running" ? c.notBefore.toISOString() : null, log };
}
