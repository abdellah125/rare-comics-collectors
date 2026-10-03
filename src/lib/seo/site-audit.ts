import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs/queue";
import { normPhrase } from "@/lib/seo/intel/entities";
import { allSitemapEntries } from "@/lib/sitemap-entries";

/**
 * On-page audit of the site's own indexable pages. It fetches each URL from the sitemap the
 * way a crawler would and records what is actually rendered: title, meta description, H1,
 * word count, canonical, robots and internal links. No third-party API, no credits.
 *
 * The crawl is chunked (CHUNK pages per job run) so it fits in a serverless invocation; the
 * last chunk computes the cross-page findings (duplicates, inbound links, the queries each
 * page ranks for) and writes the issue list.
 */

const CHUNK = 60;
const MAX_PAGES = 900;
const CONCURRENCY = 6;

export type Issue = { code: string; severity: "high" | "medium" | "low"; message: string };

const kindOf = (path: string) => (path === "/" ? "home" : path.startsWith("/store/") ? "product" : path === "/store" ? "store" : path.startsWith("/guides/") ? "guide" : path.startsWith("/collections") ? "collection" : path.startsWith("/publishers") ? "publisher" : path.startsWith("/characters") ? "character" : path.startsWith("/services") ? "service" : path.startsWith("/sellers") ? "seller" : "page");
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const strip = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? null;

export function parsePage(html: string, origin: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const description = metas.map((t) => (attr(t, "name")?.toLowerCase() === "description" ? attr(t, "content") : null)).find(Boolean) ?? null;
  const robots = metas.map((t) => (attr(t, "name")?.toLowerCase() === "robots" ? attr(t, "content") : null)).find(Boolean) ?? "";
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, "rel")?.toLowerCase() === "canonical");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]));
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  const words = strip(main).split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const links = new Set<string>();
  for (const m of main.matchAll(/<a\b[^>]*href\s*=\s*"([^"#?]+)[^"]*"/gi)) {
    const href = m[1];
    const path = href.startsWith("/") ? href : href.startsWith(origin) ? href.slice(origin.length) : null;
    if (path && !/^\/(admin|account|dashboard|cart|checkout|api)\b/.test(path)) links.add(path.replace(/\/$/, "") || "/");
  }
  return { title: title ? decode(title) : null, description: description ? decode(description) : null, noindex: /noindex/i.test(robots), canonical: canonicalTag ? attr(canonicalTag, "href") : null, h1: h1s[0] ?? null, h1Count: h1s.length, wordCount: words, links: [...links] };
}

async function crawlList(): Promise<string[]> {
  const origin = env.siteUrl.replace(/\/+$/, "");
  const entries = await allSitemapEntries();
  const paths = [...new Set(entries.map((e) => { try { return new URL(e.url).pathname.replace(/\/$/, "") || "/"; } catch { return null; } }).filter((p): p is string => Boolean(p)))];
  for (const s of ["/services/appraisal-and-valuation", "/services/grading-submission", "/services/consignment-and-brokerage", "/services/pressing-and-cleaning"]) if (!paths.includes(s)) paths.push(s);
  // Hubs and guides first; product pages (the long tail) fill what is left of the budget.
  const rank = (p: string) => (p.startsWith("/store/") ? 2 : p.startsWith("/guides/") ? 1 : 0);
  return paths.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_PAGES).map((p) => `${origin}${p}`);
}

/** Starts a fresh audit (clears the previous one). The work itself happens in `seo_audit` jobs. */
export async function startAudit(actorId?: string | null): Promise<number> {
  const urls = await crawlList();
  await db.seoPage.deleteMany({});
  await db.seoRun.create({ data: { kind: "audit", status: "running", summary: `Crawling ${urls.length} pages…`, actorId: actorId ?? null, detailJson: JSON.stringify({ total: urls.length, done: 0 }) } });
  await enqueueJob("seo_audit", { offset: 0 }, { maxAttempts: 3 });
  return urls.length;
}

export async function auditChunk(offset: number): Promise<void> {
  const origin = env.siteUrl.replace(/\/+$/, "");
  // A retried or duplicated job must not start a second chain: only the chunk the run is waiting for proceeds.
  const run = await db.seoRun.findFirst({ where: { kind: "audit" }, orderBy: { startedAt: "desc" } });
  const progress = run ? ((JSON.parse(run.detailJson) as { done?: number }).done ?? 0) : 0;
  if (!run || run.status !== "running" || progress !== offset) return;
  const urls = await crawlList();
  const slice = urls.slice(offset, offset + CHUNK);
  const queue = [...slice];
  const linkRows: { from: string; to: string[] }[] = [];
  const work = async () => {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      const path = url.slice(origin.length) || "/";
      try {
        const res = await fetch(url, { headers: { "user-agent": "RCC-SiteAudit/1.0 (+internal)" }, redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store" });
        const html = res.status === 200 ? await res.text() : "";
        const p = parsePage(html, origin);
        linkRows.push({ from: path, to: p.links });
        const data = { kind: kindOf(path), httpStatus: res.status, title: p.title, description: p.description, h1: p.h1, h1Count: p.h1Count, wordCount: p.wordCount, canonical: p.canonical, noindex: p.noindex || /noindex/i.test(res.headers.get("x-robots-tag") ?? ""), outlinks: p.links.length, issuesJson: JSON.stringify({ links: p.links.slice(0, 200) }), crawledAt: new Date() };
        await db.seoPage.upsert({ where: { url: path }, create: { url: path, ...data }, update: data });
      } catch {
        await db.seoPage.upsert({ where: { url: path }, create: { url: path, kind: kindOf(path), httpStatus: 0 }, update: { httpStatus: 0 } });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, work));

  const done = Math.min(urls.length, offset + CHUNK);
  if (done < urls.length) {
    await db.seoRun.update({ where: { id: run.id }, data: { summary: `Crawling: ${done} of ${urls.length} pages…`, detailJson: JSON.stringify({ total: urls.length, done }) } });
    await enqueueJob("seo_audit", { offset: done }, { maxAttempts: 3 });
    return;
  }
  const summary = await finishAudit();
  await db.seoRun.update({ where: { id: run.id }, data: { status: "ok", summary, finishedAt: new Date(), detailJson: JSON.stringify({ total: urls.length, done }) } });
}

/** Cross-page findings once every page is in: duplicates, inbound links, ranking queries, issue lists. */
export async function finishAudit(): Promise<string> {
  const pages = await db.seoPage.findMany();
  const inlinks = new Map<string, number>();
  for (const p of pages) {
    const links = ((JSON.parse(p.issuesJson) as { links?: string[] }).links ?? []).filter((l) => l !== p.url);
    for (const l of new Set(links)) inlinks.set(l, (inlinks.get(l) ?? 0) + 1);
  }
  const count = (key: (p: (typeof pages)[number]) => string | null) => { const m = new Map<string, number>(); for (const p of pages) { const k = key(p); if (k) m.set(k, (m.get(k) ?? 0) + 1); } return m; };
  const titles = count((p) => (p.httpStatus === 200 ? p.title : null));
  const descriptions = count((p) => (p.httpStatus === 200 ? p.description : null));

  // The queries each page shows for, from the Search Console data already stored on keywords.
  const queries = new Map<string, { query: string; impressions: number; position: number }[]>();
  for (const k of await db.seoKeyword.findMany({ where: { pagesJson: { not: "[]" } }, select: { phrase: true, pagesJson: true } })) {
    for (const pg of JSON.parse(k.pagesJson) as { url: string; impressions: number; position: number }[]) {
      let path: string;
      try { path = new URL(pg.url).pathname.replace(/\/$/, "") || "/"; } catch { continue; }
      queries.set(path, [...(queries.get(path) ?? []), { query: k.phrase, impressions: pg.impressions, position: pg.position }]);
    }
  }

  const origin = env.siteUrl.replace(/\/+$/, "");
  const totals: Record<string, number> = {};
  for (let i = 0; i < pages.length; i += 100) {
    await db.$transaction(
      pages.slice(i, i + 100).map((p) => {
        const issues: Issue[] = [];
        const add = (code: string, severity: Issue["severity"], message: string) => { issues.push({ code, severity, message }); totals[code] = (totals[code] ?? 0) + 1; };
        const q = (queries.get(p.url) ?? []).sort((a, b) => b.impressions - a.impressions);
        const into = inlinks.get(p.url) ?? 0;
        if (p.httpStatus !== 200) add("http_error", "high", p.httpStatus === 0 ? "The page could not be fetched." : `Answers HTTP ${p.httpStatus} but is listed in the sitemap.`);
        else {
          if (p.noindex) add("noindex", "high", "Listed in the sitemap but marked noindex.");
          if (!p.title) add("title_missing", "high", "No <title>.");
          else {
            if (p.title.length < 25) add("title_short", "medium", `Title is ${p.title.length} characters: too short to describe the page.`);
            if (p.title.length > 65) add("title_long", "low", `Title is ${p.title.length} characters: Google will cut it around 60.`);
            if ((titles.get(p.title) ?? 0) > 1) add("title_duplicate", "high", `${titles.get(p.title)} pages share this title.`);
          }
          if (!p.description) add("description_missing", "medium", "No meta description.");
          else {
            if (p.description.length < 70) add("description_short", "low", `Meta description is ${p.description.length} characters.`);
            if (p.description.length > 165) add("description_long", "low", `Meta description is ${p.description.length} characters: it will be truncated.`);
            if ((descriptions.get(p.description) ?? 0) > 1) add("description_duplicate", "medium", `${descriptions.get(p.description)} pages share this meta description.`);
          }
          if (p.h1Count === 0) add("h1_missing", "medium", "No H1 heading.");
          if (p.h1Count > 1) add("h1_multiple", "low", `${p.h1Count} H1 headings.`);
          const thin = p.kind === "product" ? 120 : p.kind === "guide" ? 300 : 150;
          if (p.wordCount < thin) add("thin_content", p.kind === "guide" ? "high" : "medium", `${p.wordCount} words of content (under ${thin} for a ${p.kind} page).`);
          if (p.canonical && p.canonical.replace(origin, "").replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") !== p.url.replace(/\/$/, "") && !(p.url === "/" && /^https?:\/\/[^/]+\/?$/.test(p.canonical))) add("canonical_elsewhere", "medium", `Canonical points to ${p.canonical}.`);
          if (into <= 1 && p.url !== "/") add("few_inlinks", "medium", into === 0 ? "No other crawled page links here." : "Only one crawled page links here.");
          const topQuery = q[0];
          if (topQuery && p.title && topQuery.impressions >= 5) {
            const titleNorm = ` ${normPhrase(p.title)} `;
            const missing = normPhrase(topQuery.query).split(" ").filter((w) => w.length > 2 && !["the", "and", "for", "what", "how", "when", "did", "was"].includes(w) && !titleNorm.includes(` ${w}`));
            if (missing.length > 0) add("title_misses_query", "medium", `Ranks at ${topQuery.position.toFixed(1)} for “${topQuery.query}” (${topQuery.impressions} impressions) but the title lacks “${missing.join("”, “")}”.`);
          }
        }
        return db.seoPage.update({ where: { id: p.id }, data: { inlinks: into, issuesJson: JSON.stringify(issues), impressions: q.reduce((n, x) => n + x.impressions, 0) || null, position: q[0]?.position ?? null, topQueriesJson: JSON.stringify(q.slice(0, 5)) } });
      }),
    );
  }
  const total = Object.values(totals).reduce((n, v) => n + v, 0);
  return `${pages.length} pages crawled, ${total} issues found (${Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") || "none"}). No credits used.`;
}
