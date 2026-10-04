import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { SeoContext } from "@/lib/seo/context";
import { KIND_LABEL, assessAttack, cleanDomain, diagnoseDrop, domainKind, rankBand, type DomainKind, type Rival } from "@/lib/seo/intel/attack";
import { displayName, normPhrase } from "@/lib/seo/intel/entities";
import type { ScoreParts } from "@/lib/seo/intel/score";

/**
 * The competitive layer, rebuilt from the stored data after every step (no API call):
 *   - attack scores: where the best-placed competitor is exposed, and what to do about it
 *   - competitor profiles: what each one ranks for, with what kind of page, what can be taken
 *   - topics: every subject the site should own, its pages, gaps and rankings
 *   - internal-link recommendations along Home → category → topic → issue → product
 *   - ranking drops with the most likely cause
 */

const pathOf = (url: string | null | undefined) => { if (!url) return null; try { return new URL(url, env.siteUrl).pathname.replace(/\/$/, "") || "/"; } catch { return null; } };
const slug = (s: string) => normPhrase(s).replace(/\./g, "-").replace(/\s+/g, "-");

type Topic = { key: string; label: string; type: string; hubUrl: string | null; hubExists: boolean };

/** The subjects a cluster belongs to. A cluster can strengthen several (an issue: its title and its characters). */
function topicsFor(clusterKey: string, entityType: string, label: string, ctx: SeoContext): Topic[] {
  const [entityKey] = clusterKey.split("|");
  const id = entityKey.split(":").slice(1);
  const out: Topic[] = [];
  const character = (c: string) => {
    const page = ctx.inventory.characters.find((x) => normPhrase(x.name) === c);
    out.push({ key: `character:${c}`, label: displayName(c), type: "character", hubUrl: page ? `/characters/${page.slug}` : `/characters/${slug(c)}`, hubExists: Boolean(page) });
  };
  const series = (s: string) => {
    out.push({ key: `series:${s}`, label: displayName(s), type: "series", hubUrl: `/titles/${slug(s)}`, hubExists: false });
    if (ctx.catalog.characters.includes(s)) character(s);
  };
  switch (entityType) {
    case "issue":
      series(id[0]);
      for (const c of ctx.catalog.issueCharacters?.get(`${id[0]}|${id[1]}`) ?? []) if (c !== id[0]) character(c);
      break;
    case "first_appearance":
    case "character":
      character(id[0]);
      break;
    case "series":
      series(id[0]);
      break;
    case "era": {
      const c = ctx.inventory.collections.find((x) => x.era === id[0]);
      out.push({ key: `era:${id[0]}`, label: `${displayName(id[0])} comics`, type: "era", hubUrl: c ? `/collections/${c.slug}` : null, hubExists: Boolean(c) });
      break;
    }
    case "publisher": {
      const p = ctx.inventory.publishers.find((x) => normPhrase(x.name).startsWith(id[0]));
      out.push({ key: `publisher:${id[0]}`, label: id[0].endsWith(" comics") ? displayName(id[0]) : `${displayName(id[0])} comics`, type: "publisher", hubUrl: p ? `/publishers/${p.slug}` : null, hubExists: Boolean(p) });
      break;
    }
    case "grading":
      out.push({ key: "grading", label: "CGC and CBCS grading", type: "grading", hubUrl: "/guides", hubExists: true });
      break;
    default: {
      const t = ` ${id.join(" ").replace(/-/g, " ")} `;
      if (/ (graded|grade|cbcs|signature) /.test(t)) out.push({ key: "graded-comics", label: "Graded comics", type: "grading", hubUrl: "/store", hubExists: true });
      else if (/ (value|price|worth|appraisal|investment|valuable) /.test(t)) out.push({ key: "values", label: "Comic values and prices", type: "values", hubUrl: "/guides", hubExists: true });
      else if (/ (key|first|appearance|rare) /.test(t)) out.push({ key: "key-issues", label: "Key issues and rare comics", type: "key_issues", hubUrl: "/guides", hubExists: true });
      else if (/ (collecting|collection|collector|collectible|vintage) /.test(t)) out.push({ key: "collecting", label: "Comic collecting", type: "collecting", hubUrl: "/guides", hubExists: true });
      void label;
    }
  }
  return out;
}

export async function rebuildGrowth(ctx: SeoContext): Promise<{ attacks: number; topics: number; links: number }> {
  const thisYear = new Date().getUTCFullYear();
  const [keywords, clusters, rivalPages, auditPages] = await Promise.all([
    db.seoKeyword.findMany({ where: { OR: [{ competitorsJson: { not: "[]" } }, { prevPosition: { not: null } }] }, select: { id: true, phrase: true, intent: true, entityType: true, clusterKey: true, difficulty: true, volume: true, relevance: true, position: true, prevPosition: true, currentUrl: true, pagesJson: true, competitorsJson: true, scoreJson: true, relevanceReason: true, impressions: true, weakness: true, attackScore: true, attackJson: true } }),
    db.seoCluster.findMany(),
    db.seoCompetitorPage.findMany(),
    db.seoPage.findMany({ select: { url: true, issuesJson: true, linksJson: true, httpStatus: true } }),
  ]);
  const cluster = new Map(clusters.map((c) => [c.key, c]));
  const inspected = new Map(rivalPages.map((p) => [p.url, p]));

  // ── attack scores ──
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  const perDomain = new Map<string, { n: number; top3: number; top10: number; sum: number; intents: Record<string, number>; pages: Record<string, number>; takeable: { phrase: string; position: number; ours: number | null; attack: number; volume: number | null }[]; best: { phrase: string; position: number; volume: number | null }[] }>();
  let attacks = 0;
  for (const k of keywords) {
    const rivals = k.competitorsJson === "[]" ? [] : (JSON.parse(k.competitorsJson) as Rival[]);
    if (rivals.length === 0) continue;
    let parts: Partial<ScoreParts> = {};
    try { parts = JSON.parse(k.scoreJson) as ScoreParts; } catch { parts = {}; }
    const c = cluster.get(k.clusterKey);
    const inStock = /on sale|has on sale/.test(k.relevanceReason ?? "");
    const lead = rivals.slice().sort((a, b) => a.position - b.position)[0];
    const res = assessAttack({ phrase: k.phrase, intent: k.intent, inStock, difficulty: k.difficulty, ourPosition: k.position, rivals, rivalPage: lead?.url ? (inspected.get(lead.url) ?? null) : null, demand: parts.demand ?? null, rankability: parts.rankability ?? null, intentValue: parts.intentValue ?? 0, relevance: k.relevance, thisYear });
    if (!res) continue;
    const rp = res.target.url ? inspected.get(res.target.url) : null;
    const final = rp ? (assessAttack({ phrase: k.phrase, intent: k.intent, inStock, difficulty: k.difficulty, ourPosition: k.position, rivals, rivalPage: rp, demand: parts.demand ?? null, rankability: parts.rankability ?? null, intentValue: parts.intentValue ?? 0, relevance: k.relevance, thisYear }) ?? res) : res;
    const band = rankBand(k.position);
    const where = c ? `${c.urlExists ? "Improve" : "Create"} ${c.recommendedUrl} (${c.pageType.toLowerCase()})` : "Give this keyword a target page";
    const how = final.reasons.some((r) => r.includes("does not sell")) ? "lead with the copies in stock, their grades and prices, then the facts buyers check" : final.reasons.some((r) => r.includes("forum") || r.includes("thin")) ? "answer the query fully in one well-structured page: what ranks now is thin or scattered" : final.reasons.some((r) => r.includes("not written for")) ? "use the exact phrase in the title, H1 and first paragraph: the competitor's page does not" : "cover what the page above covers and add what it lacks";
    const action = `${where}: ${how}. ${k.position === null ? "This site does not rank yet." : `This site is at #${k.position.toFixed(k.position % 1 ? 1 : 0)}: ${band.action.charAt(0).toLowerCase()}${band.action.slice(1)}`}`;
    const attackJson = JSON.stringify({ target: { domain: final.target.domain, position: final.target.position, url: final.target.url ?? "", kind: final.target.kind }, reasons: final.reasons, level: k.relevance >= 60 ? final.level : "low", action });
    if (final.weakness !== k.weakness || final.attack !== k.attackScore || attackJson !== k.attackJson) updates.push(db.seoKeyword.update({ where: { id: k.id }, data: { weakness: final.weakness, attackScore: k.relevance >= 60 ? final.attack : null, attackJson } }));
    if (k.relevance >= 60 && final.attack !== null) attacks += 1;

    if (k.relevance < 45) continue;
    for (const r of rivals) {
      const d = cleanDomain(r.domain);
      const p = perDomain.get(d) ?? { n: 0, top3: 0, top10: 0, sum: 0, intents: {}, pages: {}, takeable: [], best: [] };
      p.n += 1;
      p.sum += r.position;
      if (r.position <= 3) p.top3 += 1;
      if (r.position <= 10) p.top10 += 1;
      p.intents[k.intent] = (p.intents[k.intent] ?? 0) + 1;
      if (r.url) {
        let path = "/";
        try { path = new URL(r.url).pathname; } catch { path = "/"; }
        const kind = path === "/" ? "home page" : /\/(product|products|item|listing|itm|p)\//.test(path) ? "product page" : /\/(blog|guide|guides|article|news|learn)\b/.test(path) ? "article" : /\/(category|collections?|shop|store|c)\b/.test(path) ? "category page" : path.split("/").filter(Boolean).length >= 2 ? "deep page" : "top-level page";
        p.pages[kind] = (p.pages[kind] ?? 0) + 1;
      }
      p.best.push({ phrase: k.phrase, position: r.position, volume: k.volume });
      if (final.target.domain === r.domain && final.attack !== null && r.position >= 4 && (k.position === null || k.position > r.position)) p.takeable.push({ phrase: k.phrase, position: r.position, ours: k.position, attack: final.attack, volume: k.volume });
      perDomain.set(d, p);
    }
  }
  for (let i = 0; i < updates.length; i += 100) await db.$transaction(updates.slice(i, i + 100));

  // ── competitor profiles: what they rank for, why, what can be taken ──
  const WHY: Record<DomainKind, string> = {
    marketplace: "Marketplace authority: thousands of live listings and links, so Google trusts it for anything with a price. It rarely has a page written for one issue.",
    social: "Google shows forum threads and posts when no site answers the question well. These are opinions, not pages built to rank.",
    video: "Video results fill queries where people want to see the book or a walkthrough. They do not sell.",
    reference: "Reference depth: one page per character, issue or term, heavily linked. It informs and does not sell.",
    price_guide: "A page for every issue with sales data, which matches value and price searches exactly. It does not stock the books.",
    dealer: "A direct competitor: category and product pages for the same books, with years of links behind them.",
    publisher: "The publisher's own site: unbeatable for brand and character queries, absent for collectible back issues.",
    media: "News and list articles: strong for informational queries, weak for buying intent.",
    other: "A site in the niche with pages matching these queries.",
  };
  for (const [domain, p] of perDomain) {
    const kind = domainKind(domain);
    const pages = Object.entries(p.pages).sort((a, b) => b[1] - a[1]);
    const intents = Object.entries(p.intents).sort((a, b) => b[1] - a[1]);
    const profile = {
      keywords: p.n, top3: p.top3, top10: p.top10, intents, pages,
      why: `${WHY[kind]}${pages.length ? ` Its ranking pages here are mostly ${pages[0][0]}s.` : ""} It holds ${p.top10} of ${p.n} tracked keywords in the top 10, mainly ${intents[0]?.[0] ?? "mixed"} queries.`,
      best: p.best.sort((a, b) => a.position - b.position || (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 12),
      takeable: p.takeable.sort((a, b) => b.attack - a.attack).slice(0, 15),
    };
    const data = { keywordsSeen: p.n, avgPosition: Math.round((p.sum / p.n) * 10) / 10, kind, profileJson: JSON.stringify(profile) };
    await db.seoCompetitor.upsert({ where: { domain }, create: { domain, ...data }, update: data });
  }

  // ── topics ──
  const topics = new Map<string, Topic & { members: typeof clusters }>();
  for (const c of clusters) {
    // Only clusters worth a page: measured and relevant, or already ranking. Off-topic volume must not inflate a topic.
    if ((c.score === null || c.priority === "low") && c.bestPosition === null) continue;
    for (const t of topicsFor(c.key, c.entityType, c.label, ctx)) {
      const cur = topics.get(t.key) ?? { ...t, members: [] };
      cur.members.push(c);
      topics.set(t.key, cur);
    }
  }
  const topicRows: Prisma.SeoTopicCreateManyInput[] = [];
  for (const t of topics.values()) {
    if (t.members.length < 2 && (t.members[0]?.volume ?? 0) < 100) continue;
    const members = t.members.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const volume = members.reduce((n, m) => n + (m.volume ?? 0), 0);
    const covered = members.filter((m) => m.urlExists).reduce((n, m) => n + Math.max(1, m.volume ?? 0), 0);
    const total = members.reduce((n, m) => n + Math.max(1, m.volume ?? 0), 0);
    topicRows.push({
      key: t.key, label: t.label, type: t.type, hubUrl: t.hubUrl, hubExists: t.hubExists, clusterCount: members.length, volume,
      pagesExisting: members.filter((m) => m.urlExists).length, pagesMissing: members.filter((m) => !m.urlExists).length,
      ranking: members.filter((m) => m.bestPosition !== null && m.bestPosition <= 20).length, top10: members.filter((m) => m.bestPosition !== null && m.bestPosition <= 10).length,
      coverage: Math.round((covered / total) * 100),
      membersJson: JSON.stringify(members.slice(0, 40).map((m) => ({ label: m.label, primary: m.primaryPhrase, url: m.recommendedUrl, exists: m.urlExists, position: m.bestPosition, volume: m.volume, score: m.score, pageType: m.pageType, priority: m.priority }))),
    });
  }
  topicRows.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  await db.seoTopic.deleteMany({});
  for (let i = 0; i < Math.min(topicRows.length, 400); i += 200) await db.seoTopic.createMany({ data: topicRows.slice(i, Math.min(i + 200, 400)), skipDuplicates: true });

  // ── internal links (between pages that exist) ──
  const linksFrom = new Map(auditPages.map((p) => { let l: string[] = []; try { const v = JSON.parse(p.linksJson); l = Array.isArray(v) ? v : []; } catch { l = []; } return [p.url, new Set(l)]; }));
  const recs = new Map<string, Prisma.SeoLinkRecCreateManyInput>();
  const add = (from: string | null, to: string | null, anchor: string, kind: string, reason: string, weight: number) => {
    const f = pathOf(from);
    const t = pathOf(to);
    if (!f || !t || f === t) return;
    const known = linksFrom.get(f);
    const key = `${f}→${t}`;
    if (!recs.has(key)) recs.set(key, { fromUrl: f, toUrl: t, anchor, kind, reason, present: known ? known.has(t) : null, weight });
  };
  const PARENT: Record<string, { url: string; label: string }> = { character: { url: "/characters", label: "Characters" }, era: { url: "/collections", label: "Collections" }, publisher: { url: "/publishers", label: "Publishers" }, grading: { url: "/", label: "Home" }, values: { url: "/", label: "Home" }, key_issues: { url: "/", label: "Home" }, collecting: { url: "/", label: "Home" }, series: { url: "/store", label: "Store" } };
  for (const t of topics.values()) {
    const hub = t.hubExists ? t.hubUrl : null;
    const parent = PARENT[t.type];
    if (hub && parent && !["/guides", "/store"].includes(hub)) add(parent.url, hub, t.label, "parent_to_hub", `${parent.label} → ${t.label}: the hub of this topic should be one click from its parent.`, 40 + Math.min(40, t.members.length * 4));
    for (const m of t.members) {
      if (!m.urlExists) continue;
      const weight = (m.score ?? 20) + (m.priority === "high" ? 15 : 0);
      if (hub && !["/guides", "/store", "/"].includes(hub)) {
        add(hub, m.recommendedUrl, m.label, "hub_to_page", `${t.label} hub → “${m.primaryPhrase}”: the hub passes its authority to the page that should rank.`, weight);
        add(m.recommendedUrl, hub, t.label, "page_to_hub", `Back to the ${t.label} hub, so the topic reads as one connected set.`, Math.round(weight / 2));
      }
      for (const l of JSON.parse(m.linksJson) as { label: string; url: string }[]) {
        if (l.url.startsWith("/store/")) add(m.recommendedUrl, l.url, l.label, "guide_to_product", `From the page that ranks for “${m.primaryPhrase}” to a copy on sale.`, weight);
      }
    }
  }
  const linkRows = [...recs.values()].filter((r) => r.present !== true).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 1500);
  await db.seoLinkRec.deleteMany({});
  for (let i = 0; i < linkRows.length; i += 500) await db.seoLinkRec.createMany({ data: linkRows.slice(i, i + 500), skipDuplicates: true });

  // ── ranking drops, with the most likely cause ──
  const fell = keywords.filter((k) => k.relevance >= 45 && k.prevPosition !== null && (k.position === null || k.position - k.prevPosition >= 3));
  const issuesOf = new Map(auditPages.map((p) => { let codes: string[] = []; try { const v = JSON.parse(p.issuesJson); codes = Array.isArray(v) ? v.map((x: { code: string }) => x.code) : []; } catch { codes = []; } return [p.url, { codes, status: p.httpStatus }]; }));
  const drops: Prisma.SeoInsightCreateManyInput[] = [];
  if (fell.length) {
    const snaps = await db.seoRankSnapshot.findMany({ where: { keywordId: { in: fell.map((k) => k.id).slice(0, 500) } }, orderBy: { day: "desc" }, select: { keywordId: true, url: true, impressions: true } });
    const liveProducts = new Set((await db.product.findMany({ where: { status: "published", deletedAt: null }, select: { slug: true } })).map((p) => `/store/${p.slug}`));
    for (const k of fell.slice(0, 500)) {
      const history = snaps.filter((s) => s.keywordId === k.id);
      const url = pathOf(k.currentUrl);
      const prevUrl = pathOf(history[1]?.url ?? null);
      const page = url ? issuesOf.get(url) : undefined;
      const pageGone = Boolean(url && ((url.startsWith("/store/") && !liveProducts.has(url)) || (page && page.status !== 200)));
      const pages = k.pagesJson === "[]" ? 0 : (JSON.parse(k.pagesJson) as unknown[]).length;
      const d = diagnoseDrop({ phrase: k.phrase, prev: k.prevPosition!, position: k.position, prevUrl, url, pageGone, pagesCompeting: pages, auditIssues: page?.codes ?? [], impressionsPrev: history[1]?.impressions ?? null, impressions: k.impressions });
      if (d.reason.startsWith("a small move")) continue;
      drops.push({ type: "rank_drop", phrase: k.phrase, url, weight: Math.round(50 + Math.min(40, (k.volume ?? 0) / 20) + (k.prevPosition! <= 10 ? 20 : 0)), title: `“${k.phrase}” fell from #${k.prevPosition!.toFixed(1)} to ${k.position === null ? "out of the results" : `#${k.position.toFixed(1)}`}`, detail: `Likely cause: ${d.reason}.`, action: d.action, dataJson: JSON.stringify({ prev: k.prevPosition, position: k.position, url }) });
    }
  }
  await db.seoInsight.deleteMany({ where: { type: "rank_drop" } });
  if (drops.length) await db.seoInsight.createMany({ data: drops.slice(0, 200) });

  return { attacks, topics: Math.min(topicRows.length, 400), links: linkRows.length };
}

export { KIND_LABEL };
