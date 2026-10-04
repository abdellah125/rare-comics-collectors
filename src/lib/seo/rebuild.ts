import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { SeoContext } from "@/lib/seo/context";
import { extractEntity, type Bucket } from "@/lib/seo/intel/entities";
import type { Intent, SpecificIntent } from "@/lib/seo/intel/intent";
import type { Priority } from "@/lib/seo/intel/score";
import { planPage } from "@/lib/seo/intel/strategy";
import { domainKind } from "@/lib/seo/intel/attack";

type Competitor = { domain: string; position: number; url: string; title: string };
type Row = {
  id: string; phrase: string; norm: string; volume: number | null; difficulty: number | null; impressions: number | null; intent: string; specificJson: string; relevance: number;
  clusterKey: string; clusterRole: string; score: number | null; priority: string; priorityWhy: string | null; status: string; statusManual: boolean; position: number | null; prevPosition: number | null;
  currentUrl: string | null; pagesJson: string; competitorsJson: string; entityType: string; cpc: number | null;
};

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, long_term: 1, low: 0 };
const pathOf = (url: string | null) => { if (!url) return null; try { return new URL(url, env.siteUrl).pathname.replace(/\/$/, "") || "/"; } catch { return null; } };
const demand = (k: Row) => k.volume ?? k.impressions ?? 0;

/**
 * Everything derived from the keyword table: clusters with their page plans, each keyword's
 * role and automatic status, the competitor list and the opportunity insights. Rebuilt from
 * scratch each time, so it never drifts from the data; manual statuses are carried over.
 */
export async function rebuildStrategy(ctx: SeoContext): Promise<{ clusters: number; insights: number }> {
  const rows = (await db.seoKeyword.findMany({
    select: { id: true, phrase: true, norm: true, volume: true, difficulty: true, impressions: true, intent: true, specificJson: true, relevance: true, clusterKey: true, clusterRole: true, score: true, priority: true, priorityWhy: true, status: true, statusManual: true, position: true, prevPosition: true, currentUrl: true, pagesJson: true, competitorsJson: true, entityType: true, cpc: true },
  })) as Row[];

  // ── clusters ──
  const groups = new Map<string, Row[]>();
  for (const k of rows) groups.set(k.clusterKey, [...(groups.get(k.clusterKey) ?? []), k]);
  const manual = new Map((await db.seoCluster.findMany({ where: { statusManual: true }, select: { key: true, status: true } })).map((c) => [c.key, c.status]));

  const clusters: Prisma.SeoClusterCreateManyInput[] = [];
  const role = new Map<string, string>();
  const planExists = new Map<string, { exists: boolean; url: string }>();
  for (const [key, members] of groups) {
    const maxRelevance = Math.max(...members.map((m) => m.relevance));
    // The primary keyword is the most searched one that is actually relevant: a huge off-topic head term never leads a cluster.
    const fit = (m: Row) => (m.relevance >= 45 ? 1 : 0);
    members.sort((a, b) => fit(b) - fit(a) || demand(b) - demand(a) || (b.score ?? -1) - (a.score ?? -1) || a.phrase.length - b.phrase.length);
    const primary = members[0];
    role.set(primary.id, "primary");
    const secondary = members.slice(1).filter((m) => demand(m) > 0).slice(0, 5);
    for (const m of secondary) role.set(m.id, "secondary");
    const supporting = members.slice(1).filter((m) => !secondary.includes(m));
    for (const m of supporting) role.set(m.id, "supporting");
    if (maxRelevance < 30) continue; // noise never becomes a page plan

    const [entityKey, bucket = "all"] = key.split("|");
    const entity = extractEntity(primary.phrase, ctx.catalog);
    const specifics = [...new Set(members.slice(0, 12).flatMap((m) => JSON.parse(m.specificJson) as SpecificIntent[]))];
    const plan = planPage({ entity: { ...entity, key: entityKey }, bucket: bucket as Bucket, primary: primary.phrase, intent: primary.intent as Intent, specifics, inventory: ctx.inventory });
    // A page that already ranks for the cluster is worth more than a new URL: optimise it instead.
    const rankingNow = members.filter((m) => m.position !== null && m.position <= 30 && m.currentUrl).sort((a, b) => a.position! - b.position!)[0];
    const catchAll = ["/", "/store", "/faq", "/services"].includes(plan.recommendedUrl);
    if ((!plan.exists || catchAll) && rankingNow) {
      const path = pathOf(rankingNow.currentUrl);
      if (path && path !== plan.recommendedUrl && !["/", "/store"].includes(path)) {
        plan.pageType = path.startsWith("/store/") ? "Product page" : path.startsWith("/collections") ? "Collection page" : path.startsWith("/characters") ? "Comic character page" : path.startsWith("/publishers") ? "Category page" : path.startsWith("/services") ? "Landing page" : path.startsWith("/guides") ? (plan.pageType === "FAQ" || plan.pageType === "Category page" || plan.pageType === "Landing page" ? "Educational article" : plan.pageType) : plan.pageType;
        plan.note = `${path} already ranks at ${rankingNow.position!.toFixed(1)} for “${rankingNow.phrase}”: expand that page rather than creating ${plan.recommendedUrl}.`;
        plan.recommendedUrl = path;
        plan.exists = true;
      }
    }
    planExists.set(key, { exists: plan.exists, url: plan.recommendedUrl });
    const best = members.filter((m) => m.priority !== "low").sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || (b.score ?? 0) - (a.score ?? 0))[0] ?? primary;
    const ranked = members.filter((m) => m.position !== null).sort((a, b) => a.position! - b.position!)[0];
    const priority = best.priority as Priority;
    const auto = ranked ? (ranked.position! <= 10 ? "ranking" : "needs_improvement") : !plan.exists && (priority === "high" || priority === "medium") ? "content_needed" : "analyzed";
    clusters.push({
      key, label: entity.label, entityType: entity.type, bucket, intent: primary.intent, specificJson: JSON.stringify(specifics), primaryPhrase: primary.phrase,
      secondaryJson: JSON.stringify(secondary.map((m) => m.phrase)), supportingJson: JSON.stringify(supporting.slice(0, 25).map((m) => m.phrase)),
      keywordCount: members.length, totalVolume: members.reduce((n, m) => n + (m.volume ?? 0), 0), volume: primary.volume, difficulty: primary.difficulty,
      score: best.score, priority, priorityWhy: best.priorityWhy,
      pageType: plan.pageType, recommendedUrl: plan.recommendedUrl, urlExists: plan.exists, currentUrl: pathOf(ranked?.currentUrl ?? null), bestPosition: ranked?.position ?? null,
      title: plan.title, h1: plan.h1, topicsJson: JSON.stringify(plan.topics), linksJson: JSON.stringify(plan.links), note: plan.note,
      status: manual.get(key) ?? auto, statusManual: manual.has(key),
    });
  }
  await db.seoCluster.deleteMany({});
  for (let i = 0; i < clusters.length; i += 500) await db.seoCluster.createMany({ data: clusters.slice(i, i + 500), skipDuplicates: true });

  // ── keyword roles and automatic statuses (manual statuses are never touched) ──
  const byRole = new Map<string, string[]>();
  const byStatus = new Map<string, string[]>();
  for (const k of rows) {
    const r = role.get(k.id) ?? "supporting";
    if (r !== k.clusterRole) byRole.set(r, [...(byRole.get(r) ?? []), k.id]);
    if (k.statusManual) continue;
    const plan = planExists.get(k.clusterKey);
    const auto = k.position !== null ? (k.position <= 10 ? "ranking" : "needs_improvement") : k.score === null ? "discovered" : plan && !plan.exists && (k.priority === "high" || k.priority === "medium") ? "content_needed" : "analyzed";
    if (auto !== k.status) byStatus.set(auto, [...(byStatus.get(auto) ?? []), k.id]);
  }
  for (const [r, ids] of byRole) for (let i = 0; i < ids.length; i += 2000) await db.seoKeyword.updateMany({ where: { id: { in: ids.slice(i, i + 2000) } }, data: { clusterRole: r } });
  for (const [s, ids] of byStatus) for (let i = 0; i < ids.length; i += 2000) await db.seoKeyword.updateMany({ where: { id: { in: ids.slice(i, i + 2000) } }, data: { status: s } });

  // ── competitors seen in the stored results ──
  const seen = new Map<string, { n: number; sum: number }>();
  for (const k of rows) {
    if (k.competitorsJson === "[]" || k.relevance < 45) continue;
    for (const c of JSON.parse(k.competitorsJson) as Competitor[]) {
      const s = seen.get(c.domain) ?? { n: 0, sum: 0 };
      s.n += 1;
      s.sum += c.position;
      seen.set(c.domain, s);
    }
  }
  await db.seoCompetitor.updateMany({ data: { keywordsSeen: 0, avgPosition: null } });
  for (const [domain, s] of seen) {
    const data = { keywordsSeen: s.n, avgPosition: Math.round((s.sum / s.n) * 10) / 10, kind: domainKind(domain) };
    await db.seoCompetitor.upsert({ where: { domain }, create: { domain, ...data }, update: data });
  }

  // ── insights ──
  const insights: Prisma.SeoInsightCreateManyInput[] = [];
  const fmt = (n: number | null) => (n === null ? "?" : n.toLocaleString("en-US"));
  for (const k of rows) {
    if (k.relevance < 45) continue;
    const comps = k.competitorsJson === "[]" ? [] : (JSON.parse(k.competitorsJson) as Competitor[]);
    const plan = planExists.get(k.clusterKey);
    const here = pathOf(k.currentUrl);
    const buyer = k.intent === "transactional" || k.intent === "commercial";

    if (k.position !== null && k.position > 3 && k.position <= 15 && (k.impressions ?? 0) >= 2) {
      insights.push({ type: "striking_distance", phrase: k.phrase, url: here, weight: Math.round(100 - k.position * 3 + Math.min(30, (k.impressions ?? 0)) + (buyer ? 15 : 0)), title: `“${k.phrase}” is at position ${k.position.toFixed(1)}`, detail: `${fmt(k.impressions)} impressions in 28 days${k.volume !== null ? `, ${fmt(k.volume)} searches/month` : ""}${k.difficulty !== null ? `, difficulty ${Math.round(k.difficulty)}` : ""}. Page: ${here ?? "unknown"}.`, action: `Improve ${here ?? "the ranking page"} for this query: put the phrase in the title and first paragraph, answer it directly, and link to it from related pages.`, dataJson: JSON.stringify({ position: k.position, impressions: k.impressions, volume: k.volume, difficulty: k.difficulty }) });
    }
    if (k.volume !== null && k.volume >= 100 && k.difficulty !== null && k.difficulty <= 25 && k.relevance >= 70 && (k.position === null || k.position > 20) && role.get(k.id) === "primary") {
      insights.push({ type: "low_competition", phrase: k.phrase, url: plan?.url ?? null, weight: Math.round((k.score ?? 0) + (buyer ? 15 : 0)), title: `“${k.phrase}”: ${fmt(k.volume)} searches/month at difficulty ${Math.round(k.difficulty)}`, detail: `Relevance ${k.relevance}, ${k.intent} intent${k.position !== null ? `, currently at ${k.position.toFixed(1)}` : ", not ranking"}.`, action: plan?.exists ? `Optimise ${plan.url} for this keyword.` : `Create ${plan?.url ?? "a page"} for this keyword.`, dataJson: JSON.stringify({ volume: k.volume, difficulty: k.difficulty, relevance: k.relevance, score: k.score }) });
    }
    const top = comps.filter((c) => c.position <= 10).sort((a, b) => a.position - b.position);
    if (top.length > 0 && k.relevance >= 70 && (k.position === null || k.position > 30) && k.priority !== "long_term") {
      insights.push({ type: "keyword_gap", phrase: k.phrase, url: plan?.url ?? null, weight: Math.round((k.score ?? 30) + (buyer ? 10 : 0)), title: `${top[0].domain} ranks #${top[0].position} for “${k.phrase}”; this site ${k.position === null ? "does not rank" : `is at ${k.position.toFixed(1)}`}`, detail: `${k.volume !== null ? `${fmt(k.volume)} searches/month` : "Volume unknown"}${k.difficulty !== null ? `, difficulty ${Math.round(k.difficulty)}` : ""}. Also ranking: ${top.slice(1, 4).map((c) => `${c.domain} #${c.position}`).join(", ") || "no other tracked competitor"}.`, action: plan?.exists ? `Strengthen ${plan.url} against ${top[0].url || top[0].domain}.` : `No page targets this yet: create ${plan?.url ?? "one"}.`, dataJson: JSON.stringify({ competitors: top.slice(0, 5), volume: k.volume, difficulty: k.difficulty }) });
    }
    const pages = k.pagesJson === "[]" ? [] : (JSON.parse(k.pagesJson) as { url: string; impressions: number; position: number }[]);
    const total = pages.reduce((n, p) => n + p.impressions, 0);
    const sharing = pages.filter((p) => total >= 8 && p.impressions / total >= 0.25);
    if (sharing.length >= 2) {
      insights.push({ type: "cannibalization", phrase: k.phrase, url: pathOf(sharing[0].url), weight: Math.round(40 + Math.min(40, total)), title: `${sharing.length} pages compete for “${k.phrase}”`, detail: sharing.map((p) => `${pathOf(p.url)} (${p.impressions} impressions, position ${p.position.toFixed(1)})`).join("; "), action: plan?.exists ? `Make ${plan.url} the one page for this query: link the others to it and remove the phrase from their titles.` : `Pick one page for this query (${plan?.url ?? pathOf(sharing[0].url)}) and point the others at it.`, dataJson: JSON.stringify({ pages: sharing }) });
    }
    if (here && plan?.exists && !["/", "/store", "/faq", "/services"].includes(plan.url) && pathOf(plan.url) !== here && k.position !== null && k.position <= 40 && (k.impressions ?? 0) >= 3) {
      insights.push({ type: "wrong_page", phrase: k.phrase, url: here, weight: Math.round(30 + Math.min(40, k.impressions ?? 0)), title: `“${k.phrase}” ranks with ${here}, not ${plan.url}`, detail: `Position ${k.position.toFixed(1)}, ${fmt(k.impressions)} impressions. The page that should own this topic is ${plan.url}.`, action: `Either expand ${here} to cover the topic properly, or link it prominently to ${plan.url} so Google sees which page answers the query.`, dataJson: JSON.stringify({ position: k.position, impressions: k.impressions }) });
    }
    if (k.intent === "transactional" && k.relevance >= 80 && plan && !plan.exists && role.get(k.id) === "primary" && k.score !== null) {
      insights.push({ type: "commercial_gap", phrase: k.phrase, url: plan.url, weight: Math.round(k.score + 10), title: `Buyers search “${k.phrase}” and no page targets it`, detail: `${fmt(k.volume)} searches/month${k.difficulty !== null ? `, difficulty ${Math.round(k.difficulty)}` : ""}, relevance ${k.relevance}.`, action: `Create ${plan.url}.`, dataJson: JSON.stringify({ volume: k.volume, difficulty: k.difficulty, cpc: k.cpc }) });
    }
  }
  await db.seoInsight.deleteMany({});
  insights.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const kept = insights.slice(0, 600);
  for (let i = 0; i < kept.length; i += 300) await db.seoInsight.createMany({ data: kept.slice(i, i + 300) });
  // The competitive layer reads the clusters just written.
  const { rebuildGrowth } = await import("@/lib/seo/growth");
  await rebuildGrowth(ctx);
  return { clusters: clusters.length, insights: kept.length };
}
