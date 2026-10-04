import Link from "next/link";
import { Pagination } from "@/components/admin/pagination";
import { Card, FilterBar, Field, Kv, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { KIND_LABEL, rankBand, type DomainKind } from "@/lib/seo/intel/attack";
import { INTENT_LABEL, type Intent } from "@/lib/seo/intel/intent";
import type { ScoreParts } from "@/lib/seo/intel/score";

type SP = Record<string, string | string[] | undefined>;
const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));
const arr = <T,>(json: string): T[] => { try { const v = JSON.parse(json); return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };
const obj = <T,>(json: string): Partial<T> => { try { return JSON.parse(json) as Partial<T>; } catch { return {}; } };
const pos = (p: number | null) => (p === null ? "not ranking" : `#${p.toFixed(p % 1 ? 1 : 0)}`);
const pathOf = (url: string | null | undefined) => { if (!url) return null; try { return new URL(url, "https://x").pathname.replace(/\/$/, "") || "/"; } catch { return url; } };

type Attack = { target: { domain: string; position: number; url: string; kind: DomainKind }; reasons: string[]; level: "high" | "medium" | "low"; action: string };
const LEVEL: Record<string, { label: string; tone: "danger" | "warning" | "neutral" }> = { high: { label: "🔥 High", tone: "danger" }, medium: { label: "Medium", tone: "warning" }, low: { label: "Low", tone: "neutral" } };
const INTENT_STRENGTH: Record<string, string> = { transactional: "High", commercial: "High", informational: "Low", navigational: "None" };

// ───────────────────────────── war room ─────────────────────────────

export async function WarRoom({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "attackScore", sorts: ["attackScore", "volume", "weakness", "position"], per: 25 });
  const level = p.get("level");
  const kind = p.get("kind");
  const domain = p.get("domain");
  const band = p.get("band");
  const where: Prisma.SeoKeywordWhereInput = {
    attackScore: { not: null },
    ...(level ? { attackJson: { contains: `"level":"${level}"` } } : {}),
    ...(kind ? { attackJson: { contains: `"kind":"${kind}"` } } : {}),
    ...(domain ? { attackJson: { contains: `"domain":"${domain}"` } } : {}),
    ...(band === "page1" ? { position: { lte: 10 } } : band === "page2" ? { position: { gt: 10, lte: 20 } } : band === "far" ? { position: { gt: 20 } } : band === "none" ? { position: null } : {}),
    ...(p.q ? { phrase: { contains: p.q.toLowerCase() } } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.seoKeyword.findMany({ where, orderBy: [{ [p.sort]: { sort: p.dir, nulls: "last" } }, { id: "asc" }], skip: p.skip, take: p.per }),
    db.seoKeyword.count({ where }),
    Promise.all((["high", "medium", "low"] as const).map((l) => db.seoKeyword.count({ where: { attackScore: { not: null }, attackJson: { contains: `"level":"${l}"` } } }))),
  ]);
  const clusters = new Map((await db.seoCluster.findMany({ where: { key: { in: [...new Set(rows.map((r) => r.clusterKey))] } }, select: { key: true, recommendedUrl: true, urlExists: true, pageType: true } })).map((c) => [c.key, c]));
  return (
    <div className="grid gap-5">
      <Card title="Keyword war room" description="Keywords where a competitor holds a position this site can realistically take. Attack score = (demand + rankability + buyer intent + competitor weakness) ÷ 4 × relevance; each row says why the competitor is exposed and what to do.">
        <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
          {(["high", "medium", "low"] as const).map((l, i) => (
            <Link key={l} href={`/admin/seo?tab=war&level=${l}`} className={`rounded-lg border px-3 py-2 hover:bg-ink-50 ${level === l ? "border-brand-500 bg-brand-50" : "border-ink-200"}`}>
              <Tone tone={LEVEL[l].tone}>{LEVEL[l].label}</Tone> <strong className="ml-1 tabular-nums">{counts[i]}</strong>
            </Link>
          ))}
        </div>
        <FilterBar action="/admin/seo" reset>
          <input type="hidden" name="tab" value="war" />
          <Field label="Search"><input name="q" defaultValue={p.q} className={adminInput} /></Field>
          <Field label="Priority"><select name="level" defaultValue={level} className={adminSelect}><option value="">Any</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
          <Field label="Competitor type"><select name="kind" defaultValue={kind} className={adminSelect}><option value="">Any</option>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Competitor domain"><input name="domain" defaultValue={domain} className={adminInput} placeholder="example.com" /></Field>
          <Field label="This site is"><select name="band" defaultValue={band} className={adminSelect}><option value="">Anywhere</option><option value="page1">On page 1</option><option value="page2">On page 2</option><option value="far">Beyond page 2</option><option value="none">Not ranking</option></select></Field>
          <Field label="Sort"><select name="sort" defaultValue={p.sort} className={adminSelect}><option value="attackScore">Attack score</option><option value="weakness">Competitor weakness</option><option value="volume">Search volume</option><option value="position">Our position</option></select></Field>
        </FilterBar>
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-500">No attack keyword yet. On the Roadmap tab run “Find top competitors” (one call compares up to 50 domains across the 100 best keywords), then “Read Google results” for the pages behind them.</p>
        ) : (
          <ul className="grid gap-3">
            {rows.map((k) => {
              const a = obj<Attack>(k.attackJson) as Attack;
              const c = clusters.get(k.clusterKey);
              const parts = obj<ScoreParts>(k.scoreJson);
              const others = arr<{ domain: string; position: number }>(k.competitorsJson).filter((x) => x.domain !== a.target.domain).slice(0, 4);
              return (
                <li key={k.id} className="rounded-xl border border-ink-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-[15px] font-semibold text-ink-950">{k.phrase}</p>
                    <div className="flex items-center gap-2"><span className="text-[12px] text-ink-600">attack <strong className="text-[15px] tabular-nums text-ink-950">{k.attackScore}</strong></span><Tone tone={LEVEL[a.level]?.tone ?? "neutral"}>{LEVEL[a.level]?.label ?? a.level}</Tone></div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4 lg:grid-cols-7">
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Competitor</dt><dd className="font-medium text-ink-950">{a.target.domain}<span className="block text-[11px] font-normal text-ink-500">{KIND_LABEL[a.target.kind] ?? a.target.kind}</span></dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Their position</dt><dd className="font-semibold">#{a.target.position}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Our position</dt><dd className="font-semibold">{pos(k.position)}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Search volume</dt><dd>{n(k.volume)} /mo</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Difficulty</dt><dd>{n(k.difficulty)}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Commercial intent</dt><dd>{INTENT_STRENGTH[k.intent] ?? "—"}<span className="block text-[11px] text-ink-500">{INTENT_LABEL[k.intent as Intent] ?? k.intent}</span></dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wide text-ink-500">Weakness</dt><dd>{n(k.weakness)} / 100</dd></div>
                  </dl>
                  <p className="mt-3 text-[13px] text-ink-800"><strong>Recommended action:</strong> {a.action}</p>
                  <p className="mt-1 text-[12px] text-ink-600"><strong>Target URL:</strong> <span className="font-mono">{c?.recommendedUrl ?? "—"}</span>{c && <> ({c.pageType}, {c.urlExists ? "exists" : "to create"})</>}{k.currentUrl && <> · ranking now with <span className="font-mono">{pathOf(k.currentUrl)}</span></>}</p>
                  <p className="mt-1 text-[12px] text-ink-600"><strong>Why they are exposed:</strong> {a.reasons.length ? a.reasons.join("; ") : "no specific weakness found; the opportunity rests on demand and difficulty"}.</p>
                  <p className="mt-1 text-[11px] text-ink-500">Demand {parts.demand ?? "?"} · rankability {parts.rankability ?? "?"} · intent {parts.intentValue ?? "?"} · weakness {k.weakness ?? "?"} · relevance {k.relevance}%{others.length > 0 && <> · also ranking: {others.map((x) => `${x.domain} #${x.position}`).join(", ")}</>}{a.target.url && <> · their page: <span className="break-all font-mono">{a.target.url}</span></>}</p>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination base="/admin/seo" params={{ ...p.params, tab: "war" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
      </Card>
    </div>
  );
}

// ───────────────────────────── competitor intelligence ─────────────────────────────

type Profile = { keywords: number; top3: number; top10: number; intents: [string, number][]; pages: [string, number][]; why: string; best: { phrase: string; position: number; volume: number | null }[]; takeable: { phrase: string; position: number; ours: number | null; attack: number; volume: number | null }[] };

export async function CompetitorIntel() {
  const competitors = await db.seoCompetitor.findMany({ where: { keywordsSeen: { gt: 0 } }, orderBy: [{ visibility: { sort: "desc", nulls: "last" } }, { keywordsSeen: "desc" }], take: 30 });
  const pages = await db.seoCompetitorPage.groupBy({ by: ["domain"], where: { httpStatus: 200 }, _avg: { wordCount: true }, _count: { _all: true } });
  const pageBy = new Map(pages.map((p) => [p.domain, p]));
  if (competitors.length === 0) return <Card title="Competitor intelligence"><p className="text-[13px] text-ink-500">No competitor data yet. Run “Find top competitors” on the Roadmap tab.</p></Card>;
  return (
    <Card title="Competitor intelligence" description="For each domain competing on this site's keywords: what it ranks for, why, which keywords can realistically be taken, and with what page. Visibility and traffic are OpenSEO's estimates across the compared keywords.">
      <ul className="grid gap-3">
        {competitors.map((c) => {
          const p = obj<Profile>(c.profileJson);
          const inspected = pageBy.get(c.domain);
          return (
            <li key={c.id} className="rounded-xl border border-ink-200 bg-white">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                  <span><span className="text-[15px] font-semibold text-ink-950">{c.domain}</span> <Tone tone={c.kind === "dealer" ? "danger" : c.kind === "price_guide" ? "warning" : "neutral"}>{KIND_LABEL[c.kind as DomainKind] ?? c.kind}</Tone></span>
                  <span className="flex flex-wrap gap-x-4 text-[12px] tabular-nums text-ink-700">
                    <span>visibility <strong>{n(c.visibility, 1)}</strong></span><span>{n(c.keywordsSeen)} keywords</span><span>avg #{n(c.avgPosition, 1)}</span><span>top 10: {n(p.top10)}</span><span>est. traffic {n(c.etv)}</span><span className="font-semibold text-brand-700">{p.takeable?.length ?? 0} takeable</span>
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-ink-100 p-4 text-[13px] lg:grid-cols-2">
                  <div>
                    <p className="font-semibold text-ink-950">Why it ranks</p>
                    <p className="mt-1 text-ink-700">{p.why ?? "—"}</p>
                    <Kv className="mt-3" items={[
                      { label: "Query mix", value: (p.intents ?? []).map(([i, x]) => `${INTENT_LABEL[i as Intent] ?? i} ${x}`).join(" · ") || "—" },
                      { label: "Ranking page types", value: (p.pages ?? []).map(([k, x]) => `${k} ${x}`).join(" · ") || "URLs not read yet (Read Google results)" },
                      { label: "Pages inspected", value: inspected ? `${inspected._count._all}, average ${n(inspected._avg.wordCount)} words` : "none (Inspect competitor pages)" },
                      { label: "Compared", value: c.comparedAt ? formatDateTime(c.comparedAt) : "from stored results only" },
                    ]} />
                    <p className="mt-3 font-semibold text-ink-950">What it ranks best for</p>
                    <ul className="mt-1 grid gap-0.5 text-[12px]">{(p.best ?? []).slice(0, 10).map((b) => <li key={b.phrase} className="flex justify-between gap-3"><span>{b.phrase}</span><span className="tabular-nums text-ink-600">#{b.position} · {n(b.volume)}/mo</span></li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold text-ink-950">Keywords this site can realistically take</p>
                    {(p.takeable ?? []).length === 0 ? (
                      <p className="mt-1 text-ink-600">None from the data so far: it either ranks in the top 3 on the compared keywords, or is not the competitor to beat on them.</p>
                    ) : (
                      <Table className="mt-2">
                        <thead><tr><Th>Keyword</Th><Th align="right">Them</Th><Th align="right">Us</Th><Th align="right">Vol</Th><Th align="right">Attack</Th></tr></thead>
                        <tbody>{(p.takeable ?? []).map((t) => <tr key={t.phrase}><Td><Link className="text-brand-700 hover:underline" href={`/admin/seo?tab=war&q=${encodeURIComponent(t.phrase)}`}>{t.phrase}</Link></Td><Td align="right">#{t.position}</Td><Td align="right">{t.ours === null ? "—" : `#${t.ours.toFixed(0)}`}</Td><Td align="right">{n(t.volume)}</Td><Td align="right">{t.attack}</Td></tr>)}</tbody>
                      </Table>
                    )}
                    <p className="mt-3 text-[12px] text-ink-500">The page needed for each one is on the <Link className="text-brand-700 hover:underline" href={`/admin/seo?tab=war&domain=${c.domain}`}>war room rows for {c.domain}</Link>.</p>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ───────────────────────────── topics ─────────────────────────────

type Member = { label: string; primary: string; url: string; exists: boolean; position: number | null; volume: number | null; score: number | null; pageType: string; priority: string };
const TOPIC_TYPE: Record<string, string> = { character: "Character", series: "Comic title", era: "Era", publisher: "Publisher", grading: "Grading", values: "Values", key_issues: "Key issues", collecting: "Collecting" };

export async function Topics({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "volume", sorts: ["volume", "coverage", "clusterCount", "pagesMissing"], per: 20 });
  const type = p.get("type");
  const where: Prisma.SeoTopicWhereInput = { ...(type ? { type } : {}), ...(p.q ? { label: { contains: p.q, mode: "insensitive" as const } } : {}) };
  const [rows, total, types] = await Promise.all([
    db.seoTopic.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { key: "asc" }], skip: p.skip, take: p.per }),
    db.seoTopic.count({ where }),
    db.seoTopic.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);
  return (
    <Card title="Topical authority" description="Each subject the site should own as a whole: its hub, the pages that exist, the pages still missing and how they rank. Coverage is the share of the topic's measured demand that already has a page. Only relevant, measured clusters count.">
      <FilterBar action="/admin/seo" reset>
        <input type="hidden" name="tab" value="topics" />
        <Field label="Search"><input name="q" defaultValue={p.q} className={adminInput} placeholder="venom" /></Field>
        <Field label="Type"><select name="type" defaultValue={type} className={adminSelect}><option value="">Any</option>{types.map((t) => <option key={t.type} value={t.type}>{TOPIC_TYPE[t.type] ?? t.type} ({t._count._all})</option>)}</select></Field>
        <Field label="Sort"><select name="sort" defaultValue={p.sort} className={adminSelect}><option value="volume">Search demand</option><option value="pagesMissing">Missing pages</option><option value="coverage">Coverage</option><option value="clusterCount">Size</option></select></Field>
        <Field label="Order"><select name="dir" defaultValue={p.dir} className={adminSelect}><option value="desc">High → low</option><option value="asc">Low → high</option></select></Field>
      </FilterBar>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">No topic yet: topics appear once keywords have metrics.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((t) => {
            const members = arr<Member>(t.membersJson);
            return (
              <li key={t.key} className="rounded-xl border border-ink-200 bg-white">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                    <span><span className="text-[15px] font-semibold text-ink-950">{t.label}</span> <span className="text-[12px] text-ink-500">{TOPIC_TYPE[t.type] ?? t.type}</span></span>
                    <span className="flex flex-wrap items-center gap-x-4 text-[12px] tabular-nums text-ink-700">
                      <span>{n(t.volume)} /mo</span><span>{t.pagesExisting} of {t.clusterCount} pages</span><span>{t.ranking} in top 20</span><span>{t.top10} in top 10</span>
                      <Tone tone={t.coverage >= 80 ? "success" : t.coverage >= 40 ? "warning" : "danger"}>{t.coverage}% covered</Tone>
                    </span>
                  </summary>
                  <div className="border-t border-ink-100 p-4 text-[13px]">
                    <p className="text-ink-700"><strong>Hub:</strong> <span className="font-mono text-[12px]">{t.hubUrl ?? "—"}</span> {t.hubUrl && (t.hubExists ? <Tone tone="success">exists</Tone> : <Tone tone="danger">missing</Tone>)}{!t.hubExists && t.type === "series" && <span className="text-ink-500"> — the site has no page per comic title yet; until it does, the issue guides and products of this title have no shared hub.</span>}</p>
                    <Table className="mt-3">
                      <thead><tr><Th>Page for</Th><Th>Primary keyword</Th><Th>Type</Th><Th>URL</Th><Th align="right">Volume</Th><Th>Position</Th><Th>Next step</Th></tr></thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={`${m.label}-${m.primary}`}>
                            <Td className="font-medium text-ink-950">{m.label}</Td>
                            <Td>{m.primary}</Td>
                            <Td className="text-[12px]">{m.pageType}</Td>
                            <Td className="max-w-[16rem] break-all font-mono text-[11px]">{m.url} {m.exists ? null : <span className="font-sans text-rose-700">(to create)</span>}</Td>
                            <Td align="right">{n(m.volume)}</Td>
                            <Td className="whitespace-nowrap">{pos(m.position)}</Td>
                            <Td className="max-w-[18rem] text-[12px] text-ink-600">{m.exists ? rankBand(m.position).action : "Create this page: the topic is incomplete without it."}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination base="/admin/seo" params={{ ...p.params, tab: "topics" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </Card>
  );
}

// ───────────────────────────── internal links ─────────────────────────────

const LINK_KIND: Record<string, string> = { parent_to_hub: "Section → topic hub", hub_to_page: "Topic hub → page", page_to_hub: "Page → topic hub", guide_to_product: "Guide → product" };

export async function InternalLinks({ sp }: { sp: SP }) {
  const p = listParams(sp, { defaultSort: "weight", sorts: ["weight"], per: 50 });
  const kind = p.get("kind");
  const where: Prisma.SeoLinkRecWhereInput = { ...(kind ? { kind } : {}), ...(p.q ? { OR: [{ fromUrl: { contains: p.q.toLowerCase() } }, { toUrl: { contains: p.q.toLowerCase() } }] } : {}) };
  const [rows, total, kinds, crawled] = await Promise.all([
    db.seoLinkRec.findMany({ where, orderBy: [{ weight: "desc" }, { id: "asc" }], skip: p.skip, take: p.per }),
    db.seoLinkRec.count({ where }),
    db.seoLinkRec.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.seoPage.count(),
  ]);
  return (
    <Card title="Internal links to add" description="Links between pages that already exist, following Home → category → topic → issue → product. A link is listed when the site audit found it missing (or has not crawled the source page yet). Use the anchor text as written: it names the target, not “click here”.">
      {crawled === 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">The site audit has not run, so the system cannot tell which of these links already exist. Run “Run site audit” on the Roadmap tab.</p>}
      <FilterBar action="/admin/seo" reset>
        <input type="hidden" name="tab" value="links" />
        <Field label="URL contains"><input name="q" defaultValue={p.q} className={adminInput} /></Field>
        <Field label="Kind"><select name="kind" defaultValue={kind} className={adminSelect}><option value="">Any</option>{kinds.map((k) => <option key={k.kind} value={k.kind}>{LINK_KIND[k.kind] ?? k.kind} ({k._count._all})</option>)}</select></Field>
      </FilterBar>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">No link recommendation: either nothing is missing or the clusters have no existing pages yet.</p>
      ) : (
        <Table>
          <thead><tr><Th>From</Th><Th>To</Th><Th>Anchor text</Th><Th>Kind</Th><Th>Why</Th><Th>State</Th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <Td className="max-w-[15rem] break-all font-mono text-[11px]">{l.fromUrl}</Td>
                <Td className="max-w-[15rem] break-all font-mono text-[11px]">{l.toUrl}</Td>
                <Td className="font-medium text-ink-950">{l.anchor}</Td>
                <Td className="whitespace-nowrap text-[12px]">{LINK_KIND[l.kind] ?? l.kind}</Td>
                <Td className="max-w-[20rem] text-[12px] text-ink-600">{l.reason}</Td>
                <Td>{l.present === false ? <Tone tone="danger">missing</Tone> : <Tone tone="neutral">not checked</Tone>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base="/admin/seo" params={{ ...p.params, tab: "links" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </Card>
  );
}

// ───────────────────────────── ranking playbook ─────────────────────────────

export async function RankingPlaybook() {
  const [bands, drops] = await Promise.all([
    Promise.all([
      db.seoKeyword.count({ where: { position: { lte: 3 }, relevance: { gte: 45 } } }),
      db.seoKeyword.count({ where: { position: { gt: 3, lte: 10 }, relevance: { gte: 45 } } }),
      db.seoKeyword.count({ where: { position: { gt: 10, lte: 20 }, relevance: { gte: 45 } } }),
      db.seoKeyword.count({ where: { position: { gt: 20, lte: 30 }, relevance: { gte: 45 } } }),
    ]),
    db.seoInsight.findMany({ where: { type: "rank_drop" }, orderBy: { weight: "desc" }, take: 12 }),
  ]);
  const rows: [string, number, number | null][] = [["#1–3", bands[0], 2], ["#4–10", bands[1], 7], ["#11–20", bands[2], 15], ["#21–30", bands[3], 25]];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="What each position calls for" description="Relevant keywords only. The same rule is applied to every tracked keyword in the table below.">
        <Table>
          <thead><tr><Th>Band</Th><Th align="right">Keywords</Th><Th>Action</Th></tr></thead>
          <tbody>{rows.map(([label, count, sample]) => <tr key={label}><Td className="whitespace-nowrap font-semibold">{label}</Td><Td align="right">{count}</Td><Td className="text-[12px] text-ink-700">{rankBand(sample).action}</Td></tr>)}</tbody>
        </Table>
      </Card>
      <Card title="Rankings that fell" description="Checked after every Search Console sync, with the most likely cause from the evidence on hand.">
        {drops.length === 0 ? (
          <p className="text-[13px] text-ink-500">No meaningful drop since the previous check.</p>
        ) : (
          <ul className="grid gap-2">{drops.map((d) => <li key={d.id} className="rounded-lg bg-ink-50 px-3 py-2 text-[13px]"><p className="font-medium text-ink-950">{d.title}</p><p className="text-[12px] text-ink-600">{d.detail}</p><p className="mt-0.5 text-[12px] text-ink-800">→ {d.action}</p></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
