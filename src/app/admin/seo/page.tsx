import type { Metadata } from "next";
import Link from "@/components/link";
import { Pagination } from "@/components/admin/pagination";
import { SeoActionsPanel, StatusSelect } from "@/components/admin/seo-controls";
import { AdminPageHeader, Card, FilterBar, Field, Kv, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import type { SeoCluster } from "@prisma/client";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { aiConfigured } from "@/lib/seo/ai";
import { INTENT_LABEL, SPECIFIC_LABEL, type Intent, type SpecificIntent } from "@/lib/seo/intel/intent";
import { PRIORITY_LABEL, type Priority, type ScoreParts } from "@/lib/seo/intel/score";
import { openSeoConfigured } from "@/lib/seo/openseo";
import { CompetitorIntel, InternalLinks, RankingPlaybook, Topics, WarRoom } from "./growth-tabs";

export const metadata: Metadata = { title: "SEO intelligence" };
export const dynamic = "force-dynamic";
// Research and metric calls wait on the provider; never cut one off after the credits are spent.
export const maxDuration = 60;

const TABS = [["roadmap", "Roadmap"], ["war", "War room"], ["competitors", "Competitors"], ["topics", "Topics"], ["clusters", "Page strategy"], ["links", "Internal links"], ["keywords", "Keywords"], ["rankings", "Rankings"], ["audit", "Site audit"], ["runs", "Runs & credits"]] as const;
type Tab = (typeof TABS)[number][0];
const STATUS_LABEL: Record<string, string> = { discovered: "Discovered", analyzed: "Analyzed", targeting: "Targeting", content_needed: "Content needed", optimizing: "Optimizing", published: "Published", ranking: "Ranking", needs_improvement: "Needs improvement" };
const PRIORITY_TONE: Record<string, "success" | "warning" | "neutral" | "brand"> = { high: "success", medium: "warning", long_term: "brand", low: "neutral" };
const INSIGHT_LABEL: Record<string, string> = { rank_drop: "Rankings that fell", striking_distance: "Close to page one (positions 4–15)", low_competition: "Demand with low difficulty", keyword_gap: "Competitor ranks, this site does not", cannibalization: "Several pages for one query", wrong_page: "Ranking with the wrong page", commercial_gap: "Buyer keyword with no page" };

const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));
const arr = <T,>(json: string): T[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };
const pathOf = (url: string | null) => { if (!url) return null; try { return new URL(url, "https://x").pathname.replace(/\/$/, "") || "/"; } catch { return url; } };

/** "#18 → #11 ↑", "Not ranking → #43", "#7 → dropped out". */
function Movement({ position, prev }: { position: number | null; prev: number | null }) {
  if (position === null && prev === null) return <span className="text-ink-400">Not ranking</span>;
  const now = position === null ? "dropped out" : `#${position.toFixed(position % 1 ? 1 : 0)}`;
  if (prev === null) return <span>{position === null ? now : <><span className="text-ink-400">new</span> → <strong>{now}</strong></>}</span>;
  if (position === null) return <span className="text-rose-700">#{n(prev, 1)} → {now} ↓</span>;
  const delta = prev - position;
  if (Math.abs(delta) < 0.5) return <strong>{now}</strong>;
  return (
    <span className={delta > 0 ? "text-emerald-700" : "text-rose-700"}>
      #{n(prev, 1)} → <strong>{now}</strong> {delta > 0 ? "↑" : "↓"}
    </span>
  );
}

function ScoreCell({ score, json }: { score: number | null; json: string }) {
  let p: ScoreParts | null = null;
  try { p = JSON.parse(json) as ScoreParts; } catch { p = null; }
  if (score === null) return <span className="text-[12px] text-ink-400" title={p?.missing?.length ? `Needs ${p.missing.join(" and ")}` : undefined}>needs metrics</span>;
  return (
    <span title={p ? `demand ${p.demand ?? "?"} (${p.demandBasis}) · rankability ${p.rankability ?? "?"} (${p.rankabilityBasis}) · intent value ${p.intentValue} · relevance ${p.relevance}` : undefined} className="inline-flex flex-col leading-tight">
      <strong className="tabular-nums text-ink-950">{score}</strong>
      {p && <span className="whitespace-nowrap text-[10px] text-ink-500">D{p.demand ?? "?"} · R{p.rankability ?? "?"} · I{p.intentValue} · ×{p.relevance}%</span>}
    </span>
  );
}

export default async function AdminSeoPage({ searchParams }: PageProps<"/admin/seo">) {
  await requireAdmin("content.manage");
  const sp = await searchParams;
  const tab = (TABS.some(([t]) => t === sp.tab) ? sp.tab : "roadmap") as Tab;
  const configured = openSeoConfigured();
  const [total, measured, ranking, lastBalance, lastSync] = await Promise.all([
    db.seoKeyword.count(),
    db.seoKeyword.count({ where: { score: { not: null } } }),
    db.seoKeyword.count({ where: { position: { not: null } } }),
    db.seoRun.findFirst({ where: { credits: { gt: 0 } }, orderBy: { startedAt: "desc" }, select: { summary: true } }),
    db.seoRun.findFirst({ where: { kind: "search_console", status: "ok" }, orderBy: { startedAt: "desc" }, select: { finishedAt: true } }),
  ]);
  const left = lastBalance?.summary?.match(/([\d,]+) left/)?.[1] ?? null;

  return (
    <>
      <AdminPageHeader
        title="SEO intelligence"
        lead="Which keywords this site can realistically rank for and sell from, which page should target each, and how the rankings move. Scores are relevance × (demand, rankability, buyer intent); every figure shown comes from Search Console or OpenSEO, and a keyword without data is shown as unmeasured."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "SEO intelligence" }]}
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-700">
        <span>{configured ? <Tone tone="success">OpenSEO key on server</Tone> : <Tone tone="danger">OPENSEO_API_KEY not set</Tone>}</span>
        <span><strong>{n(total)}</strong> keywords</span>
        <span><strong>{n(measured)}</strong> scored</span>
        <span><strong>{n(ranking)}</strong> ranking</span>
        <span>Credits left: <strong>{left ?? "run “Test connection”"}</strong></span>
        <span>Search Console synced: <strong>{lastSync?.finishedAt ? formatDateTime(lastSync.finishedAt) : "never"}</strong></span>
      </div>
      <nav aria-label="SEO sections" className="mb-5 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map(([t, label]) => (
          <Link key={t} href={t === "roadmap" ? "/admin/seo" : `/admin/seo?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-[13px] font-semibold ${t === tab ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-950"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "roadmap" && <Roadmap configured={configured} empty={total === 0} />}
      {tab === "war" && <WarRoom sp={sp} />}
      {tab === "topics" && <Topics sp={sp} />}
      {tab === "links" && <InternalLinks sp={sp} />}
      {tab === "keywords" && <Keywords sp={sp} />}
      {tab === "clusters" && <Clusters sp={sp} />}
      {tab === "rankings" && <Rankings sp={sp} />}
      {tab === "competitors" && <Competitors />}
      {tab === "audit" && <Audit sp={sp} />}
      {tab === "runs" && <Runs />}
    </>
  );
}

type SP = Record<string, string | string[] | undefined>;

// ───────────────────────────── roadmap ─────────────────────────────

function Section({ title, why, rows, tone }: { title: string; why: string; rows: SeoCluster[]; tone: "success" | "warning" | "brand" }) {
  return (
    <Card title={title} description={why} actions={<Tone tone={tone}>{rows.length ? `top ${rows.length}` : "none yet"}</Tone>}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">Nothing in this group yet.</p>
      ) : (
        <ol className="grid gap-3">
          {rows.map((c, i) => (
            <li key={c.key} className="rounded-lg border border-ink-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[14px] font-semibold text-ink-950">
                  {i + 1}. {c.primaryPhrase}
                  <span className="ml-2 text-[12px] font-normal text-ink-500">{c.label} · {INTENT_LABEL[c.intent as Intent] ?? c.intent}</span>
                </p>
                <p className="text-[12px] tabular-nums text-ink-700">
                  score <strong>{c.score}</strong> · {n(c.volume)} /mo · KD {n(c.difficulty)} · {c.bestPosition === null ? "not ranking" : `position ${c.bestPosition.toFixed(1)}`}
                </p>
              </div>
              <p className="mt-1 text-[13px] text-ink-700">
                <strong>{c.urlExists ? "Optimise" : "Create"}</strong> <span className="font-mono text-[12px]">{c.recommendedUrl}</span> ({c.pageType}). {c.note}
              </p>
              <p className="mt-1 text-[12px] text-ink-500">Why: {c.priorityWhy}.{arr<string>(c.secondaryJson).length > 0 && <> Also covers: {arr<string>(c.secondaryJson).slice(0, 4).join(", ")}.</>}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function Roadmap({ configured, empty }: { configured: boolean; empty: boolean }) {
  const pick = (priority: string, take: number) => db.seoCluster.findMany({ where: { priority, score: { not: null } }, orderBy: [{ score: "desc" }, { totalVolume: "desc" }], take });
  const [high, medium, longTerm, insights, ai, counts] = await Promise.all([
    pick("high", 12),
    pick("medium", 8),
    pick("long_term", 6),
    db.seoInsight.findMany({ orderBy: { weight: "desc" }, take: 400 }),
    db.seoRun.findFirst({ where: { kind: "ai", status: "ok" }, orderBy: { startedAt: "desc" } }),
    db.seoCluster.groupBy({ by: ["priority"], where: { score: { not: null } }, _count: { _all: true } }),
  ]);
  const byType = new Map<string, typeof insights>();
  for (const i of insights) byType.set(i.type, [...(byType.get(i.type) ?? []), i]);
  const count = (p: string) => counts.find((c) => c.priority === p)?._count._all ?? 0;
  let aiText: string | null = null;
  try { aiText = ai ? ((JSON.parse(ai.detailJson) as { text?: string }).text ?? null) : null; } catch { aiText = null; }

  return (
    <div className="grid gap-5">
      {empty && (
        <Card title="Start here">
          <p className="text-[13px] text-ink-700">No keyword data yet. Run, in order: <strong>Test connection</strong>, <strong>Sync Search Console</strong> and <strong>Add catalogue candidates</strong> (all free), then <strong>Fetch metrics</strong> to score them.</p>
        </Card>
      )}
      <Card title="Run a step" description="Free steps use Search Console and the site's own data. Paid steps show their typical cost in OpenSEO credits; each is refused if it would take the balance below the reserve set in Settings › SEO.">
        <SeoActionsPanel configured={configured} aiConfigured={aiConfigured()} />
      </Card>
      {aiText && (
        <Card title="Written analysis" description={`Generated ${formatDateTime(ai!.finishedAt)} from the figures on this page; it adds no data of its own.`}>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-800">{aiText}</div>
        </Card>
      )}
      <Section tone="success" title={`High priority (${count("high")} clusters)`} why="Relevant to what the store sells, buyer intent, and realistically winnable, or already on the edge of page one. Work on these first, top down." rows={high} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section tone="warning" title={`Medium priority (${count("medium")})`} why="Valuable but more competitive, or winnable but informational: they build topical authority for the buying pages." rows={medium} />
        <Section tone="brand" title={`Long-term (${count("long_term")})`} why="Relevant and valuable, but held by sites far stronger than this one. Revisit once the pages above rank." rows={longTerm} />
      </div>
      <Card title="Detected opportunities" description="Rebuilt after every step from the stored data.">
        {insights.length === 0 ? (
          <p className="text-[13px] text-ink-500">Nothing detected yet.</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {Object.keys(INSIGHT_LABEL).filter((t) => byType.has(t)).map((t) => (
              <div key={t}>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">{INSIGHT_LABEL[t]} · {byType.get(t)!.length}</p>
                <ul className="grid gap-2">
                  {byType.get(t)!.slice(0, 6).map((i) => (
                    <li key={i.id} className="rounded-lg bg-ink-50 px-3 py-2 text-[13px]">
                      <p className="font-medium text-ink-950">{i.title}</p>
                      <p className="text-[12px] text-ink-600">{i.detail}</p>
                      <p className="mt-0.5 text-[12px] text-ink-800">→ {i.action}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────── keywords ─────────────────────────────

async function Keywords({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "score", sorts: ["score", "volume", "difficulty", "position", "relevance", "impressions"], per: 50 });
  const priority = p.get("priority");
  const intent = p.get("intent");
  const status = p.get("status");
  const entity = p.get("entity");
  const show = p.get("show") || "scored";
  const where: Prisma.SeoKeywordWhereInput = {
    ...(priority ? { priority } : {}),
    ...(intent ? { intent } : {}),
    ...(status ? { status } : {}),
    ...(entity ? { entityType: entity } : {}),
    ...(show === "scored" ? { score: { not: null } } : show === "ranking" ? { position: { not: null } } : show === "unmeasured" ? { metricsAt: null } : {}),
    ...(p.q ? { phrase: { contains: p.q.toLowerCase() } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.seoKeyword.findMany({ where, orderBy: [{ [p.sort]: { sort: p.dir, nulls: "last" } }, { id: "asc" }], skip: p.skip, take: p.per }),
    db.seoKeyword.count({ where }),
  ]);
  const clusters = new Map((await db.seoCluster.findMany({ where: { key: { in: [...new Set(rows.map((r) => r.clusterKey))] } }, select: { key: true, recommendedUrl: true, urlExists: true, pageType: true } })).map((c) => [c.key, c]));
  return (
    <Card title="Keywords" description="Score = (0.30 × demand + 0.35 × rankability + 0.35 × intent value) × relevance. Under each score: D demand, R rankability, I intent value, × relevance. Hover for the inputs.">
      <FilterBar action="/admin/seo" reset>
        <input type="hidden" name="tab" value="keywords" />
        <Field label="Search"><input name="q" defaultValue={p.q} className={adminInput} placeholder="hulk 181" /></Field>
        <Field label="Show">
          <select name="show" defaultValue={show} className={adminSelect}>
            <option value="scored">Scored</option><option value="ranking">Ranking now</option><option value="unmeasured">Unmeasured</option><option value="all">All</option>
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" defaultValue={priority} className={adminSelect}>
            <option value="">Any</option>{Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Intent">
          <select name="intent" defaultValue={intent} className={adminSelect}>
            <option value="">Any</option>{Object.entries(INTENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="About">
          <select name="entity" defaultValue={entity} className={adminSelect}>
            <option value="">Anything</option><option value="issue">A specific issue</option><option value="first_appearance">A first appearance</option><option value="series">A series</option><option value="era">An era</option><option value="publisher">A publisher</option><option value="character">A character</option><option value="grading">Grading</option><option value="topic">General topic</option>
          </select>
        </Field>
        <Field label="Sort">
          <select name="sort" defaultValue={p.sort} className={adminSelect}>
            <option value="score">Opportunity score</option><option value="volume">Search volume</option><option value="difficulty">Difficulty</option><option value="position">Position</option><option value="impressions">Impressions</option><option value="relevance">Relevance</option>
          </select>
        </Field>
        <Field label="Order">
          <select name="dir" defaultValue={p.dir} className={adminSelect}><option value="desc">High → low</option><option value="asc">Low → high</option></select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">No keyword matches these filters.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Keyword</Th><Th>Current position</Th><Th align="right">Volume</Th><Th align="right">KD</Th><Th>Intent</Th><Th>Score</Th><Th>Current URL</Th><Th>Recommended URL</Th><Th>Competitors</Th><Th>Status</Th><Th>Priority</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => {
              const c = clusters.get(k.clusterKey);
              const comps = arr<{ domain: string; position: number }>(k.competitorsJson);
              const specifics = arr<SpecificIntent>(k.specificJson);
              return (
                <tr key={k.id}>
                  <Td className="min-w-[15rem]">
                    <span className="font-medium text-ink-950">{k.phrase}</span>
                    <span className="block text-[11px] text-ink-500">{k.entityLabel} · {k.clusterRole}{k.relevanceReason ? ` · ${k.relevanceReason}` : ""}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-[12px]"><Movement position={k.position} prev={k.prevPosition} />{k.impressions ? <span className="block text-[11px] text-ink-500">{n(k.impressions)} impr · {n(k.clicks)} clicks</span> : null}</Td>
                  <Td align="right">{n(k.volume)}</Td>
                  <Td align="right">{n(k.difficulty)}</Td>
                  <Td className="text-[12px]">{INTENT_LABEL[k.intent as Intent] ?? k.intent}{specifics.length > 0 && <span className="block text-[11px] text-ink-500">{specifics.map((s) => SPECIFIC_LABEL[s] ?? s).join(", ")}</span>}</Td>
                  <Td><ScoreCell score={k.score} json={k.scoreJson} /></Td>
                  <Td className="max-w-[11rem] break-all font-mono text-[11px]">{pathOf(k.currentUrl) ?? "—"}</Td>
                  <Td className="max-w-[12rem] break-all font-mono text-[11px]">{c ? <>{c.recommendedUrl}<span className="block font-sans text-[11px] text-ink-500">{c.pageType} · {c.urlExists ? "exists" : "new"}</span></> : "—"}</Td>
                  <Td className="text-[11px]">{comps.length ? comps.slice(0, 3).map((x) => `${x.domain} #${x.position}`).join(", ") : "—"}</Td>
                  <Td><StatusSelect kind="keyword" id={k.id} status={k.status} manual={k.statusManual} /></Td>
                  <Td className="min-w-[13rem]"><Tone tone={PRIORITY_TONE[k.priority] ?? "neutral"}>{PRIORITY_LABEL[k.priority as Priority] ?? k.priority}</Tone><span className="mt-0.5 block max-w-[14rem] text-[11px] text-ink-500">{k.priorityWhy}</span></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination base="/admin/seo" params={{ ...p.params, tab: "keywords" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </Card>
  );
}

// ───────────────────────────── clusters / page strategy ─────────────────────────────

async function Clusters({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "score", sorts: ["score", "totalVolume", "keywordCount"], per: 25 });
  const priority = p.get("priority");
  const pageType = p.get("pageType");
  const exists = p.get("exists");
  const show = p.get("show") || "scored";
  const where: Prisma.SeoClusterWhereInput = {
    ...(priority ? { priority } : {}),
    ...(pageType ? { pageType } : {}),
    ...(exists === "yes" ? { urlExists: true } : exists === "no" ? { urlExists: false } : {}),
    ...(show === "scored" ? { score: { not: null } } : {}),
    ...(p.q ? { OR: [{ primaryPhrase: { contains: p.q.toLowerCase() } }, { label: { contains: p.q, mode: "insensitive" as const } }, { recommendedUrl: { contains: p.q.toLowerCase() } }] } : {}),
  };
  const [rows, total, types] = await Promise.all([
    db.seoCluster.findMany({ where, orderBy: [{ [p.sort]: { sort: p.dir, nulls: "last" } }, { key: "asc" }], skip: p.skip, take: p.per }),
    db.seoCluster.count({ where }),
    db.seoCluster.groupBy({ by: ["pageType"], _count: { _all: true } }),
  ]);
  return (
    <Card title="Page strategy" description="One row per page: the keywords it should target together, so two pages never compete for the same query. An existing page is preferred to a new one.">
      <FilterBar action="/admin/seo" reset>
        <input type="hidden" name="tab" value="clusters" />
        <Field label="Search"><input name="q" defaultValue={p.q} className={adminInput} /></Field>
        <Field label="Show"><select name="show" defaultValue={show} className={adminSelect}><option value="scored">Scored</option><option value="all">All</option></select></Field>
        <Field label="Priority"><select name="priority" defaultValue={priority} className={adminSelect}><option value="">Any</option>{Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Page type"><select name="pageType" defaultValue={pageType} className={adminSelect}><option value="">Any</option>{types.map((t) => <option key={t.pageType} value={t.pageType}>{t.pageType} ({t._count._all})</option>)}</select></Field>
        <Field label="Page"><select name="exists" defaultValue={exists} className={adminSelect}><option value="">Any</option><option value="yes">Exists: optimise</option><option value="no">Missing: create</option></select></Field>
      </FilterBar>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">No cluster matches these filters.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((c) => (
            <li key={c.key} className="rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold text-ink-950">{c.label}</p>
                  <p className="text-[12px] text-ink-500">{c.pageType} · {INTENT_LABEL[c.intent as Intent] ?? c.intent}{arr<SpecificIntent>(c.specificJson).length ? ` · ${arr<SpecificIntent>(c.specificJson).map((s) => SPECIFIC_LABEL[s] ?? s).join(", ")}` : ""} · {c.keywordCount} keyword{c.keywordCount === 1 ? "" : "s"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px] tabular-nums">
                  <span>score <strong>{c.score ?? "—"}</strong></span><span>{n(c.volume)} /mo</span><span>KD {n(c.difficulty)}</span><span>{c.bestPosition === null ? "not ranking" : `#${c.bestPosition.toFixed(1)}`}</span>
                  <Tone tone={PRIORITY_TONE[c.priority] ?? "neutral"}>{PRIORITY_LABEL[c.priority as Priority] ?? c.priority}</Tone>
                  <StatusSelect kind="cluster" id={c.key} status={c.status} manual={c.statusManual} />
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-[9rem_1fr]">
                <dt className="text-ink-500">Primary keyword</dt><dd className="font-medium text-ink-950">{c.primaryPhrase}</dd>
                <dt className="text-ink-500">Secondary</dt><dd>{arr<string>(c.secondaryJson).join(" · ") || "—"}</dd>
                <dt className="text-ink-500">Supporting</dt><dd className="text-ink-700">{arr<string>(c.supportingJson).slice(0, 12).join(" · ") || "—"}</dd>
                <dt className="text-ink-500">{c.urlExists ? "Optimise" : "Create"}</dt><dd className="break-all font-mono text-[12px]">{c.recommendedUrl}{c.currentUrl && c.currentUrl !== c.recommendedUrl && <span className="font-sans text-ink-500"> (now ranking with {c.currentUrl})</span>}</dd>
                <dt className="text-ink-500">Title</dt><dd>{c.title}</dd>
                <dt className="text-ink-500">H1</dt><dd>{c.h1}</dd>
                <dt className="text-ink-500">Content topics</dt><dd>{arr<string>(c.topicsJson).length ? <ul className="list-disc pl-4">{arr<string>(c.topicsJson).map((t) => <li key={t}>{t}</li>)}</ul> : "—"}</dd>
                <dt className="text-ink-500">Internal links</dt><dd>{arr<{ label: string; url: string }>(c.linksJson).length ? arr<{ label: string; url: string }>(c.linksJson).map((l) => <span key={l.url} className="mr-3 inline-block"><span className="font-mono text-[12px]">{l.url}</span> <span className="text-ink-500">({l.label})</span></span>) : "—"}</dd>
                <dt className="text-ink-500">Note</dt><dd className="text-ink-700">{c.note}</dd>
                <dt className="text-ink-500">Why this priority</dt><dd className="text-ink-700">{c.priorityWhy}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <Pagination base="/admin/seo" params={{ ...p.params, tab: "clusters" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </Card>
  );
}

// ───────────────────────────── rankings ─────────────────────────────

async function Rankings({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "position", sorts: ["position", "impressions", "clicks", "volume"], per: 50, defaultDir: "asc" });
  const move = p.get("move");
  const base: Prisma.SeoKeywordWhereInput = { OR: [{ position: { not: null } }, { prevPosition: { not: null } }] };
  const all = await db.seoKeyword.findMany({ where: base, select: { id: true, position: true, prevPosition: true, impressions: true, clicks: true } });
  const cls = (k: { position: number | null; prevPosition: number | null }) => (k.position === null ? "lost" : k.prevPosition === null ? "new" : k.prevPosition - k.position >= 0.5 ? "up" : k.position - k.prevPosition >= 0.5 ? "down" : "same");
  const tally: Record<string, number> = { up: 0, down: 0, new: 0, lost: 0, same: 0 };
  for (const k of all) tally[cls(k)] += 1;
  const ids = move ? all.filter((k) => cls(k) === move).map((k) => k.id) : null;
  const where: Prisma.SeoKeywordWhereInput = { ...base, ...(ids ? { id: { in: ids } } : {}), ...(p.q ? { phrase: { contains: p.q.toLowerCase() } } : {}) };
  const [rows, total, history] = await Promise.all([
    db.seoKeyword.findMany({ where, orderBy: [{ [p.sort]: { sort: p.dir, nulls: "last" } }, { id: "asc" }], skip: p.skip, take: p.per }),
    db.seoKeyword.count({ where }),
    db.seoRankSnapshot.groupBy({ by: ["day"], _count: { _all: true }, _sum: { impressions: true, clicks: true }, _avg: { position: true }, orderBy: { day: "desc" }, take: 12 }),
  ]);
  const ranked = all.filter((k) => k.position !== null);
  const top = (max: number) => ranked.filter((k) => k.position! <= max).length;
  return (
    <div className="grid gap-5">
      <RankingPlaybook />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Visibility" description="Average position over the last 28 days, from Search Console (Google's own data, free).">
          <Kv items={[{ label: "Queries ranking", value: n(ranked.length) }, { label: "Top 3", value: n(top(3)) }, { label: "Top 10", value: n(top(10)) }, { label: "Top 20", value: n(top(20)) }, { label: "Impressions (28 d)", value: n(ranked.reduce((s, k) => s + (k.impressions ?? 0), 0)) }, { label: "Clicks (28 d)", value: n(ranked.reduce((s, k) => s + (k.clicks ?? 0), 0)) }]} />
        </Card>
        <Card title="Since the previous check" className="lg:col-span-2" description="Each Search Console sync is one check; the weekly job runs it automatically.">
          <div className="flex flex-wrap gap-2 text-[13px]">
            {([["up", "Improved ↑", "success"], ["down", "Declined ↓", "danger"], ["new", "Newly ranking", "brand"], ["lost", "Dropped out", "warning"], ["same", "Unchanged", "neutral"]] as const).map(([key, label, tone]) => (
              <Link key={key} href={`/admin/seo?tab=rankings&move=${key}`} className="rounded-lg border border-ink-200 px-3 py-2 hover:bg-ink-50">
                <Tone tone={tone}>{label}</Tone> <strong className="ml-1 tabular-nums">{tally[key]}</strong>
              </Link>
            ))}
            {move && <Link href="/admin/seo?tab=rankings" className={`${adminButton.quiet} ${adminButton.sm}`}>Clear filter</Link>}
          </div>
          {history.length > 0 && (
            <Table className="mt-4">
              <thead><tr><Th>Check</Th><Th align="right">Queries</Th><Th align="right">Avg position</Th><Th align="right">Impressions</Th><Th align="right">Clicks</Th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.day.toISOString()}><Td>{h.day.toISOString().slice(0, 10)}</Td><Td align="right">{n(h._count._all)}</Td><Td align="right">{n(h._avg.position, 1)}</Td><Td align="right">{n(h._sum.impressions)}</Td><Td align="right">{n(h._sum.clicks)}</Td></tr>)}</tbody>
            </Table>
          )}
        </Card>
      </div>
      <Card title="Tracked keywords">
        <FilterBar action="/admin/seo" reset>
          <input type="hidden" name="tab" value="rankings" />
          {move && <input type="hidden" name="move" value={move} />}
          <Field label="Search"><input name="q" defaultValue={p.q} className={adminInput} /></Field>
          <Field label="Sort"><select name="sort" defaultValue={p.sort} className={adminSelect}><option value="position">Position</option><option value="impressions">Impressions</option><option value="clicks">Clicks</option><option value="volume">Search volume</option></select></Field>
          <Field label="Order"><select name="dir" defaultValue={p.dir} className={adminSelect}><option value="asc">Low → high</option><option value="desc">High → low</option></select></Field>
        </FilterBar>
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-500">No ranking data yet. Run “Sync Search Console” on the Roadmap tab.</p>
        ) : (
          <Table>
            <thead><tr><Th>Keyword</Th><Th>Position</Th><Th>Ranking URL</Th><Th align="right">Impressions</Th><Th align="right">Clicks</Th><Th align="right">Volume</Th><Th>SERP features</Th><Th>Competitors</Th><Th>Source</Th></tr></thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <Td className="font-medium text-ink-950">{k.phrase}</Td>
                  <Td className="whitespace-nowrap text-[13px]"><Movement position={k.position} prev={k.prevPosition} /></Td>
                  <Td className="max-w-[16rem] break-all font-mono text-[11px]">{pathOf(k.currentUrl) ?? "—"}</Td>
                  <Td align="right">{n(k.impressions)}</Td>
                  <Td align="right">{n(k.clicks)}</Td>
                  <Td align="right">{n(k.volume)}</Td>
                  <Td className="text-[11px]">{arr<string>(k.serpFeaturesJson).map((f) => f.replace(/_/g, " ")).join(", ") || "—"}</Td>
                  <Td className="text-[11px]">{arr<{ domain: string; position: number }>(k.competitorsJson).slice(0, 3).map((x) => `${x.domain} #${x.position}`).join(", ") || "—"}</Td>
                  <Td className="text-[11px] text-ink-500">{k.positionSource === "gsc" ? "Search Console" : k.positionSource === "serp" ? "live Google result" : k.positionSource === "labs" ? "provider index" : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination base="/admin/seo" params={{ ...p.params, tab: "rankings" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
      </Card>
    </div>
  );
}

// ───────────────────────────── competitors ─────────────────────────────

async function Competitors() {
  const [competitors, gaps, gapKeywords] = await Promise.all([
    db.seoCompetitor.findMany({ where: { OR: [{ keywordsSeen: { gt: 0 } }, { gapAt: { not: null } }] }, orderBy: [{ keywordsSeen: "desc" }, { avgPosition: "asc" }], take: 40 }),
    db.seoInsight.findMany({ where: { type: "keyword_gap" }, orderBy: { weight: "desc" }, take: 40 }),
    db.seoKeyword.findMany({ where: { sourcesJson: { contains: "competitor:" }, relevance: { gte: 60 }, OR: [{ position: null }, { position: { gt: 30 } }] }, orderBy: [{ score: { sort: "desc", nulls: "last" } }], take: 60 }),
  ]);
  return (
    <div className="grid gap-5">
      <CompetitorIntel />
      <Card title="Who ranks for this site's keywords" description="Domains found in the Google results read so far, and competitors whose rankings were pulled for a gap analysis. Reading more results (Roadmap › Read Google results) widens this list.">
        {competitors.length === 0 ? (
          <p className="text-[13px] text-ink-500">No competitor data yet. Read Google results for the best keywords, or run a keyword gap for a domain you know.</p>
        ) : (
          <Table>
            <thead><tr><Th>Domain</Th><Th>Kind</Th><Th align="right">Keywords seen in</Th><Th align="right">Avg position</Th><Th align="right">Gap keywords pulled</Th><Th>Gap checked</Th></tr></thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium text-ink-950">{c.domain}</Td>
                  <Td className="text-[12px]">{c.kind.replace(/_/g, " ")}</Td>
                  <Td align="right">{n(c.keywordsSeen)}</Td>
                  <Td align="right">{n(c.avgPosition, 1)}</Td>
                  <Td align="right">{c.gapAt ? n(c.gapKeywords) : "—"}</Td>
                  <Td className="text-[12px] text-ink-500">{c.gapAt ? formatDateTime(c.gapAt) : "not yet"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card title="Keyword gap" description="Competitor ranks → this site does not → relevant to the store → opportunity. Sorted by opportunity score.">
        {gapKeywords.length === 0 && gaps.length === 0 ? (
          <p className="text-[13px] text-ink-500">No gap found yet.</p>
        ) : (
          <Table>
            <thead><tr><Th>Keyword</Th><Th>Competitors ranking</Th><Th>This site</Th><Th align="right">Volume</Th><Th align="right">KD</Th><Th>Intent</Th><Th>Score</Th><Th>Priority</Th></tr></thead>
            <tbody>
              {gapKeywords.map((k) => (
                <tr key={k.id}>
                  <Td><span className="font-medium text-ink-950">{k.phrase}</span><span className="block text-[11px] text-ink-500">{k.relevanceReason}</span></Td>
                  <Td className="text-[12px]">{arr<{ domain: string; position: number; url: string }>(k.competitorsJson).slice(0, 3).map((x) => <span key={x.domain} className="block">{x.domain} #{x.position} <span className="break-all font-mono text-[10px] text-ink-500">{pathOf(x.url)}</span></span>)}</Td>
                  <Td className="whitespace-nowrap text-[12px]">{k.position === null ? "not ranking" : `#${k.position.toFixed(1)}`}</Td>
                  <Td align="right">{n(k.volume)}</Td>
                  <Td align="right">{n(k.difficulty)}</Td>
                  <Td className="text-[12px]">{INTENT_LABEL[k.intent as Intent] ?? k.intent}</Td>
                  <Td><ScoreCell score={k.score} json={k.scoreJson} /></Td>
                  <Td><Tone tone={PRIORITY_TONE[k.priority] ?? "neutral"}>{PRIORITY_LABEL[k.priority as Priority] ?? k.priority}</Tone></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────── site audit ─────────────────────────────

async function Audit({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "impressions", sorts: ["impressions", "wordCount", "inlinks", "url"], per: 50 });
  const issue = p.get("issue");
  const kind = p.get("kind");
  const [pages, run] = await Promise.all([db.seoPage.findMany({ orderBy: [{ [p.sort]: { sort: p.dir, nulls: "last" } }, { url: "asc" }] }), db.seoRun.findFirst({ where: { kind: "audit" }, orderBy: { startedAt: "desc" } })]);
  type Issue = { code: string; severity: string; message: string };
  const parsed = pages.map((pg) => ({ ...pg, issues: arr<Issue>(pg.issuesJson) }));
  const totals = new Map<string, { n: number; severity: string }>();
  for (const pg of parsed) for (const i of pg.issues) totals.set(i.code, { n: (totals.get(i.code)?.n ?? 0) + 1, severity: i.severity });
  const filtered = parsed.filter((pg) => (!issue || pg.issues.some((i) => i.code === issue)) && (!kind || pg.kind === kind) && (!p.q || pg.url.includes(p.q.toLowerCase())));
  const view = filtered.slice(p.skip, p.skip + p.per);
  const kinds = [...new Set(pages.map((pg) => pg.kind))].sort();
  return (
    <div className="grid gap-5">
      <Card title="Site audit" description="The site's own indexable pages, fetched like a crawler and checked for what blocks ranking. Free: it uses no API credits." actions={run ? <Tone tone={run.status === "ok" ? "success" : run.status === "running" ? "warning" : "danger"}>{run.status === "running" ? "crawling" : run.status}</Tone> : undefined}>
        <p className="text-[13px] text-ink-700">{run ? `${run.summary ?? ""} (${formatDateTime(run.finishedAt ?? run.startedAt)})` : "No audit has run yet. Start one from the Roadmap tab (“Run site audit”)."}</p>
        {totals.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[...totals.entries()].sort((a, b) => b[1].n - a[1].n).map(([code, t]) => (
              <Link key={code} href={`/admin/seo?tab=audit&issue=${code}`} className={`rounded-lg border px-2.5 py-1.5 text-[12px] hover:bg-ink-50 ${issue === code ? "border-brand-500 bg-brand-50" : "border-ink-200"}`}>
                <Tone tone={t.severity === "high" ? "danger" : t.severity === "medium" ? "warning" : "neutral"}>{t.severity}</Tone> {code.replace(/_/g, " ")} <strong className="tabular-nums">{t.n}</strong>
              </Link>
            ))}
            {issue && <Link href="/admin/seo?tab=audit" className={`${adminButton.quiet} ${adminButton.sm}`}>All pages</Link>}
          </div>
        )}
      </Card>
      {pages.length > 0 && (
        <Card title={`Pages (${n(filtered.length)})`}>
          <FilterBar action="/admin/seo" reset>
            <input type="hidden" name="tab" value="audit" />
            {issue && <input type="hidden" name="issue" value={issue} />}
            <Field label="URL contains"><input name="q" defaultValue={p.q} className={adminInput} /></Field>
            <Field label="Page kind"><select name="kind" defaultValue={kind} className={adminSelect}><option value="">Any</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
            <Field label="Sort"><select name="sort" defaultValue={p.sort} className={adminSelect}><option value="impressions">Impressions</option><option value="wordCount">Word count</option><option value="inlinks">Inbound links</option><option value="url">URL</option></select></Field>
            <Field label="Order"><select name="dir" defaultValue={p.dir} className={adminSelect}><option value="desc">High → low</option><option value="asc">Low → high</option></select></Field>
          </FilterBar>
          <Table>
            <thead><tr><Th>Page</Th><Th>Title / description</Th><Th align="right">Words</Th><Th align="right">Links in</Th><Th>Ranks for</Th><Th>Issues</Th></tr></thead>
            <tbody>
              {view.map((pg) => (
                <tr key={pg.id}>
                  <Td className="max-w-[14rem]"><span className="break-all font-mono text-[11px]">{pg.url}</span><span className="block text-[11px] text-ink-500">{pg.kind}{pg.httpStatus !== 200 ? ` · HTTP ${pg.httpStatus}` : ""}</span></Td>
                  <Td className="max-w-[20rem] text-[12px]"><span className="text-ink-950">{pg.title ?? "—"}</span><span className="block text-[11px] text-ink-500">{pg.description ? `${pg.description.slice(0, 110)}${pg.description.length > 110 ? "…" : ""}` : "no meta description"}</span></Td>
                  <Td align="right">{n(pg.wordCount)}</Td>
                  <Td align="right">{n(pg.inlinks)}</Td>
                  <Td className="max-w-[14rem] text-[11px]">{arr<{ query: string; impressions: number; position: number }>(pg.topQueriesJson).slice(0, 3).map((q) => <span key={q.query} className="block">{q.query} <span className="text-ink-500">#{q.position.toFixed(1)} · {q.impressions}</span></span>)}{arr(pg.topQueriesJson).length === 0 && "—"}</Td>
                  <Td className="max-w-[22rem] text-[12px]">{pg.issues.length === 0 ? <Tone tone="success">clean</Tone> : <ul className="grid gap-0.5">{pg.issues.map((i) => <li key={i.code}><span className={i.severity === "high" ? "font-semibold text-rose-700" : i.severity === "medium" ? "text-amber-800" : "text-ink-600"}>{i.message}</span></li>)}</ul>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination base="/admin/seo" params={{ ...p.params, tab: "audit" }} page={p.page} pages={pageCount(filtered.length, p.per)} total={filtered.length} per={p.per} />
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────── runs & credits ─────────────────────────────

async function Runs() {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [runs, usage, month, byTool] = await Promise.all([
    db.seoRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
    db.apiUsage.findMany({ where: { provider: "openseo" }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.apiUsage.aggregate({ _sum: { units: true }, _count: { _all: true }, where: { provider: "openseo", createdAt: { gte: monthStart } } }),
    db.apiUsage.groupBy({ by: ["endpoint"], where: { provider: "openseo", createdAt: { gte: monthStart } }, _sum: { units: true, lines: true }, _count: { _all: true } }),
  ]);
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="This month">
          <Kv items={[{ label: "Credits used", value: n(month._sum.units) }, { label: "API calls", value: n(month._count._all) }]} />
          <p className="mt-3 text-[12px] text-ink-500">Cost is measured as the balance before and after each paid call, not estimated. The reserve is set in <Link className="text-brand-700 hover:underline" href="/admin/settings/seo">Settings › SEO</Link>.</p>
        </Card>
        <Card title="By tool" className="lg:col-span-2">
          <Table>
            <thead><tr><Th>OpenSEO tool</Th><Th align="right">Calls</Th><Th align="right">Rows</Th><Th align="right">Credits</Th></tr></thead>
            <tbody>{byTool.map((t) => <tr key={t.endpoint}><Td className="font-mono text-[12px]">{t.endpoint}</Td><Td align="right">{t._count._all}</Td><Td align="right">{n(t._sum.lines)}</Td><Td align="right">{n(t._sum.units)}</Td></tr>)}{byTool.length === 0 && <tr><Td className="text-ink-500">No calls this month.</Td><Td /><Td /><Td /></tr>}</tbody>
          </Table>
        </Card>
      </div>
      <Card title="Pipeline runs">
        <Table>
          <thead><tr><Th>When</Th><Th>Step</Th><Th>Result</Th><Th align="right">Credits</Th><Th>Status</Th></tr></thead>
          <tbody>{runs.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-[12px] text-ink-500">{formatDateTime(r.startedAt)}</Td><Td className="font-mono text-[12px]">{r.kind}</Td><Td className="text-[12px]">{r.kind === "ai" && r.status === "ok" ? "Written analysis updated." : r.summary}</Td><Td align="right">{r.credits || "—"}</Td><Td><Tone tone={r.status === "ok" ? "success" : r.status === "running" ? "warning" : r.status === "blocked" ? "warning" : "danger"}>{r.status}</Tone></Td></tr>)}{runs.length === 0 && <tr><Td className="text-ink-500">Nothing has run yet.</Td><Td /><Td /><Td /><Td /></tr>}</tbody>
        </Table>
      </Card>
      <Card title="OpenSEO calls" description="Every request, including free, blocked and failed ones. The API key is never stored.">
        <Table>
          <thead><tr><Th>When</Th><Th>Tool</Th><Th>Request</Th><Th>Status</Th><Th align="right">Rows</Th><Th align="right">Credits</Th></tr></thead>
          <tbody>{usage.map((u) => <tr key={u.id}><Td className="whitespace-nowrap text-[12px] text-ink-500">{formatDateTime(u.createdAt)}</Td><Td className="font-mono text-[12px]">{u.endpoint}</Td><Td className="text-[12px]">{u.params}{u.error && <span className="block text-rose-700">{u.error}</span>}</Td><Td><Tone tone={u.status === "ok" ? "success" : u.status === "blocked" ? "warning" : "danger"}>{u.status}</Tone></Td><Td align="right">{u.lines}</Td><Td align="right">{u.units}</Td></tr>)}{usage.length === 0 && <tr><Td className="text-ink-500">No calls yet.</Td><Td /><Td /><Td /><Td /><Td /></tr>}</tbody>
        </Table>
      </Card>
    </div>
  );
}
