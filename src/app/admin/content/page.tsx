import type { Metadata } from "next";
import Link from "@/components/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { refreshBacklogAction, removeTopicAction } from "@/lib/admin/actions/content";
import { BACKLOG_DAY, backlogSummary } from "@/lib/content/backlog";
import { approveContentAction, planContentAction, regenerateContentAction, rejectContentAction, retryTaskAction, runContentAction, saveContentSettingsAction, scheduleContentAction, unpublishContentAction } from "@/lib/admin/actions/content";
import { listParams, pageCount } from "@/lib/admin/query";
import { requireAdmin } from "@/lib/auth/session";
import { CHECKER_MODEL, WRITER_MODEL, contentAiConfigured } from "@/lib/content/anthropic";
import { CATEGORIES, FORMATS, categoryBySlug, isFormat } from "@/lib/content/categories";
import { PART_LABEL, WEIGHTS, type ScoreParts } from "@/lib/content/opportunity";
import { dayKey } from "@/lib/content/plan";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Content pipeline" };
export const maxDuration = 60;

const TABS = [
  ["articles", "Articles"],
  ["backlog", "Backlog"],
  ["topics", "Topics & failures"],
  ["settings", "Settings"],
] as const;
const STATUS_LABEL: Record<string, string> = { published: "Published", scheduled: "Scheduled", pending_review: "Pending review", draft: "Draft", rejected: "Rejected" };
const TASK_LABEL: Record<string, string> = { queued: "Queued", planned: "Planned", writing: "Being written", written: "Written", checking: "Fact check", done: "Done", failed: "Failed", skipped: "Declined" };
const tone = (s: string) => (s === "published" || s === "done" ? "success" : s === "scheduled" || s === "written" || s === "checking" || s === "writing" ? "brand" : s === "pending_review" || s === "planned" ? "warning" : s === "rejected" || s === "failed" ? "danger" : "neutral");

export default async function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  await requireAdmin("content.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"] as const });
  const tab = TABS.some(([k]) => k === p.get("tab")) ? p.get("tab") : "articles";
  const settings = await getSettings();
  const today = dayKey();
  const dayStart = new Date(`${today}T00:00:00Z`);
  const now = new Date();
  const auto: Prisma.ArticleWhereInput = { origin: "auto" };

  const lastError = await db.seoRun.findFirst({ where: { kind: "content_error", startedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } }, orderBy: { startedAt: "desc" } });
  const [todayTasks, publishedToday, scheduled, pending, drafts, failedToday, lastPlan, usage] = await Promise.all([
    db.contentTask.groupBy({ by: ["status"], where: { day: today }, _count: { _all: true } }),
    db.article.count({ where: { ...auto, status: "published", publishedAt: { gte: dayStart, lte: now } } }),
    db.article.count({ where: { ...auto, status: "published", publishedAt: { gt: now } } }),
    db.article.count({ where: { ...auto, status: "pending_review" } }),
    db.article.count({ where: { ...auto, status: "draft" } }),
    db.contentTask.count({ where: { day: today, status: "failed" } }),
    db.seoRun.findFirst({ where: { kind: "content_plan" }, orderBy: { startedAt: "desc" } }),
    db.apiUsage.aggregate({ where: { provider: "anthropic", endpoint: { startsWith: "content." }, createdAt: { gte: dayStart } }, _sum: { units: true, lines: true }, _count: { _all: true } }),
  ]);
  const taskCount = (s: string) => todayTasks.find((t) => t.status === s)?._count._all ?? 0;
  const generatedToday = todayTasks.reduce((n, t) => n + t._count._all, 0);
  const inFlight = taskCount("planned") + taskCount("writing") + taskCount("written") + taskCount("checking");
  const base = "/admin/content";
  const plan = (() => { try { return lastPlan?.detailJson ? (JSON.parse(lastPlan.detailJson) as { duplicates?: { keyword: string; existing: string; why: string }[]; considered?: number; eligible?: number }) : null; } catch { return null; } })();

  const tiles: [string, string | number, string][] = [
    ["Topics today", generatedToday, `${taskCount("done")} finished · ${inFlight} in progress`],
    ["Published today", publishedToday, `${scheduled} scheduled for later`],
    ["Pending review", pending, "held for a person"],
    ["Drafts", drafts, "unpublished"],
    ["Failed today", failedToday, `${taskCount("skipped")} declined by the writer`],
    ["AI tokens today", (usage._sum.units ?? 0).toLocaleString("en-US"), `${usage._count._all} request(s) · ${usage._sum.lines ?? 0} web search(es)`],
  ];

  return (
    <>
      <AdminPageHeader
        title="Content pipeline"
        lead={`Guides, news and stories written from SEO Intelligence. Target: up to ${settings["content.dailyTarget"]} a day${settings["content.rampUp"] ? " (ramping up over the first days)" : ""}; a topic is only written when there is search demand for it, it is about what the shop does, and the site does not already cover it.`}
        actions={
          <>
            <ConfirmButton label="Plan today's topics" message="Reads SEO Intelligence, drops what the site already covers and stores today's topics. Running it again only tops the day up to the target." action={planContentAction} size="sm" />
            <ConfirmButton label="Run the pipeline now" message="Sends planned topics to be written, collects finished batches, runs the checks and announces published articles. The scheduled job does the same every few minutes." action={runContentAction} variant="primary" size="sm" />
          </>
        }
      />

      {!contentAiConfigured() && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">ANTHROPIC_API_KEY is not set on the server, so nothing can be written. Add it to the server environment (never to the browser or the repository).</p>}
      {lastError && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="content-error">
          The AI service refused the last request ({formatDateTime(lastError.startedAt)}): {lastError.summary} Nothing is lost: topics and drafts wait and the pipeline tries again every few minutes.
        </p>
      )}
      {!settings["content.enabled"] && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">The pipeline is switched off (Settings tab). Scheduled articles still publish at their time.</p>}

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-ink-200 bg-white p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink-950">{value}</dd>
            <dd className="mt-0.5 text-[12px] text-ink-600">{sub}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Sections" className="mb-5 flex flex-wrap gap-1 border-b border-ink-200">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === "articles" ? base : `${base}?tab=${key}`} aria-current={tab === key ? "page" : undefined} className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium ${tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:text-ink-900"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "articles" && <Articles p={p} base={base} />}
      {tab === "backlog" && <Backlog p={p} base={base} minScore={settings["content.minScore"]} requireDemand={settings["content.requireDemand"]} />}
      {tab === "topics" && <Topics p={p} base={base} lastPlan={lastPlan ? { summary: lastPlan.summary ?? "", at: lastPlan.startedAt } : null} plan={plan} />}
      {tab === "settings" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Dials" description="Editorial settings. API keys are not here: they live in the server environment.">
            <div className="p-5">
              <ActionForm action={saveContentSettingsAction} submitLabel="Save settings">
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="enabled" defaultChecked={settings["content.enabled"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                  <span>
                    Pipeline on<span className="block text-[12px] text-ink-500">Plans topics daily and writes them. Off: nothing new is written.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="autoPublish" defaultChecked={settings["content.autoPublish"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                  <span>
                    Publish automatically<span className="block text-[12px] text-ink-500">Articles that pass the quality gate and the fact check go out without waiting. Off: everything waits under Pending review.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="rampUp" defaultChecked={settings["content.rampUp"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                  <span>
                    Ramp up<span className="block text-[12px] text-ink-500">10 on the first day, then 25, then 50, then the full target.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="requireDemand" defaultChecked={settings["content.requireDemand"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                  <span>
                    Only write topics with measured demand<span className="block text-[12px] text-ink-500">On: a queued topic waits until its keyword has a search volume or Search Console impressions. Off: relevant topics are written without that evidence, best score first.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="publishReportedNews" defaultChecked={settings["content.publishReportedNews"]} className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600" />
                  <span>
                    Publish news reported by a single outlet<span className="block text-[12px] text-ink-500">Off: only news confirmed by an official source or two outlets publishes by itself; the rest waits for review.</span>
                  </span>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Daily target (0–100)">
                    <input name="dailyTarget" type="number" min={0} max={100} defaultValue={settings["content.dailyTarget"]} className={adminInput} />
                  </Field>
                  <Field label="News items a day (0–7)">
                    <input name="newsPerDay" type="number" min={0} max={7} defaultValue={settings["content.newsPerDay"]} className={adminInput} />
                  </Field>
                  <Field label="Minimum opportunity score" hint="A topic below this is not written.">
                    <input name="minScore" type="number" min={30} max={95} defaultValue={settings["content.minScore"]} className={adminInput} />
                  </Field>
                  <Field label="Minimum quality to auto-publish">
                    <input name="minQuality" type="number" min={50} max={100} defaultValue={settings["content.minQuality"]} className={adminInput} />
                  </Field>
                </div>
              </ActionForm>
            </div>
          </Card>
          <Card title="How a topic is scored" description="Opportunity score, 0–100. Every figure comes from SEO Intelligence or from the site itself.">
            <div className="p-5">
              <ul className="grid gap-1.5 text-sm text-ink-800">
                {(Object.keys(WEIGHTS) as (keyof ScoreParts)[]).map((k) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span>{PART_LABEL[k]}</span>
                    <span className="tabular-nums text-ink-600">up to {WEIGHTS[k]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-600">
                A topic needs measured search demand (a volume, or impressions in Search Console) and a relevance of at least 60 to be considered at all. Writer: {WRITER_MODEL}. Fact check: {CHECKER_MODEL}. The pipeline reads the SEO data already stored; it never spends keyword-tool credits by itself.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

async function Articles({ p, base }: { p: ReturnType<typeof listParams>; base: string }) {
  const status = p.get("status");
  const category = p.get("category");
  const when = p.get("when");
  const now = new Date();
  const dayStart = new Date(`${dayKey()}T00:00:00Z`);
  const where: Prisma.ArticleWhereInput = {
    origin: "auto",
    ...(status === "scheduled" ? { status: "published", publishedAt: { gt: now } } : status === "published" ? { status: "published", publishedAt: { lte: now } } : status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(when === "today" ? { createdAt: { gte: dayStart } } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" as const } }, { primaryKeyword: { contains: p.q, mode: "insensitive" as const } }, { slug: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.article.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.per, select: { id: true, slug: true, title: true, category: true, format: true, status: true, primaryKeyword: true, searchVolume: true, keywordDifficulty: true, intent: true, opportunityScore: true, seoScore: true, wordCount: true, qualityJson: true, sourcesJson: true, claimLevel: true, reviewNote: true, publishedAt: true, indexedAt: true, createdAt: true } }),
    db.article.count({ where }),
  ]);
  return (
    <>
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Title, keyword or address" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={category} className={adminSelect}>
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Written">
          <select name="when" defaultValue={when} className={adminSelect}>
            <option value="">Any time</option>
            <option value="today">Today</option>
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No articles yet" body="Articles written by the pipeline appear here with their keyword, scores and status. Use “Plan today's topics” and “Run the pipeline now”, or wait for the scheduled job." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Article</Th>
              <Th>Keyword</Th>
              <Th align="right">Volume</Th>
              <Th align="right">KD</Th>
              <Th>Intent</Th>
              <Th align="right">Opp.</Th>
              <Th align="right">SEO</Th>
              <Th align="right">Words</Th>
              <Th align="right">Links</Th>
              <Th>Status</Th>
              <Th>Date</Th>
              <Th>Indexing</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const scheduled = r.status === "published" && r.publishedAt !== null && r.publishedAt > now;
              const shown = scheduled ? "scheduled" : r.status;
              const q = (() => { try { return JSON.parse(r.qualityJson) as { internalLinks?: number; writer?: string }; } catch { return {}; } })();
              const sources = (() => { try { return (JSON.parse(r.sourcesJson) as unknown[]).length; } catch { return 0; } })();
              return (
                <tr key={r.id} className="align-top">
                  <Td className="min-w-[260px] max-w-[340px]">
                    <Link href={`/admin/guides/${r.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                      {r.title}
                    </Link>
                    <span className="block text-[11px] text-ink-500">
                      {categoryBySlug(r.category)?.short ?? r.category} · {isFormat(r.format) ? FORMATS[r.format].name : r.format} · {r.format === "news" ? `${sources} source(s)` : `AI draft (${q.writer ?? "writer"})`}
                    </span>
                    {r.reviewNote && <span className="mt-1 block text-[11px] leading-snug text-rose-700">{r.reviewNote}</span>}
                  </Td>
                  <Td className="min-w-[130px] max-w-[180px]">{r.primaryKeyword ?? "—"}</Td>
                  <Td align="right">{r.searchVolume?.toLocaleString("en-US") ?? "—"}</Td>
                  <Td align="right">{r.keywordDifficulty !== null ? Math.round(r.keywordDifficulty) : "—"}</Td>
                  <Td>{r.intent ?? "—"}</Td>
                  <Td align="right">{r.opportunityScore ?? "—"}</Td>
                  <Td align="right">{r.seoScore ?? "—"}</Td>
                  <Td align="right">{r.wordCount.toLocaleString("en-US")}</Td>
                  <Td align="right">{q.internalLinks ?? "—"}</Td>
                  <Td>
                    <Tone tone={tone(shown)}>{STATUS_LABEL[shown] ?? shown}</Tone>
                    {r.claimLevel && <span className="mt-1 block text-[11px] text-ink-600">{r.claimLevel}</span>}
                  </Td>
                  <Td className="whitespace-nowrap">{r.publishedAt ? formatDateTime(r.publishedAt) : `written ${formatDateTime(r.createdAt, { dateOnly: true })}`}</Td>
                  <Td className="whitespace-nowrap">{r.indexedAt ? `Submitted ${formatDateTime(r.indexedAt, { dateOnly: true })}` : shown === "published" ? "Queued" : "—"}</Td>
                  <Td>
                    <div className="flex min-w-[210px] flex-wrap gap-1.5">
                      {shown !== "published" && shown !== "scheduled" && <ConfirmButton label="Approve" message="Publishes this article now." action={approveContentAction.bind(null, r.id)} variant="primary" size="sm" />}
                      {shown === "scheduled" && <ConfirmButton label="Publish now" message="Publishes this article now instead of at its scheduled time." action={approveContentAction.bind(null, r.id)} size="sm" />}
                      {(shown === "published" || shown === "scheduled") && <ConfirmButton label="Unpublish" message="Takes the article off the site. It becomes a draft." action={unpublishContentAction.bind(null, r.id)} size="sm" />}
                      {shown !== "published" && <ConfirmButton label="Schedule" message="Publishes the article at the time you give." action={scheduleContentAction.bind(null, r.id)} withReason reasonLabel="Publish at (YYYY-MM-DD HH:MM, UTC)" size="sm" />}
                      <Link href={`/admin/guides/${r.id}`} className="inline-flex h-8 items-center rounded-lg border border-ink-300 px-2.5 text-[12px] font-semibold text-ink-800 hover:bg-ink-50">
                        Edit
                      </Link>
                      <ConfirmButton label="Regenerate" message="Writes the article again from the same brief. The new text replaces this one after it has passed the checks." action={regenerateContentAction.bind(null, r.id)} size="sm" />
                      {shown !== "rejected" && <ConfirmButton label="Reject" message="Rejects the article and takes it off the site if it was published. Its topic can be planned again later." action={rejectContentAction.bind(null, r.id)} withReason reasonLabel="Reason" variant="danger" size="sm" />}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}

async function Backlog({ p, base, minScore, requireDemand }: { p: ReturnType<typeof listParams>; base: string; minScore: number; requireDemand: boolean }) {
  const kind = p.get("kind") === "update" ? "update" : "new";
  const priority = p.get("priority");
  const category = p.get("category");
  const format = p.get("format");
  const where: Prisma.ContentTaskWhereInput = { day: BACKLOG_DAY, kind, status: "queued", ...(priority ? { priority } : {}), ...(category ? { category } : {}), ...(format ? { format } : {}), ...(p.q ? { OR: [{ keyword: { contains: p.q, mode: "insensitive" as const } }, { title: { contains: p.q, mode: "insensitive" as const } }] } : {}) };
  const [sum, rows, total] = await Promise.all([
    backlogSummary(minScore),
    db.contentTask.findMany({ where, orderBy: [{ score: "desc" }, { norm: "asc" }], skip: p.skip, take: p.per, select: { id: true, title: true, keyword: true, secondaryJson: true, intent: true, format: true, category: true, priority: true, volume: true, difficulty: true, score: true, source: true, status: true, reason: true } }),
    db.contentTask.count({ where }),
  ]);
  const s = sum.state;
  const chips = (title: string, counts: Record<string, number>, label: (k: string) => string) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <li key={k} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] text-ink-800">
              {label(k)} <span className="tabular-nums text-ink-500">{n.toLocaleString("en-US")}</span>
            </li>
          ))}
      </ul>
    </div>
  );
  return (
    <>
      <Card
        title="Topic backlog"
        description="Every content opportunity SEO Intelligence currently supports, queued for the pipeline. One topic per page SEO Intelligence recommends; a keyword the site already answers becomes an entry to improve that page instead."
        className="mb-5"
        actions={<ConfirmButton label="Refresh from SEO Intelligence" message="Reads the keyword clusters again and queues any new opportunity. Existing topics, drafts and articles are not changed or removed. No AI or paid API is used." action={refreshBacklogAction} size="sm" />}
      >
        <div className="grid gap-4 p-5">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                ["Topics queued", sum.queued, "waiting for the pipeline"],
                ["Ready to write now", requireDemand ? sum.eligibleNow : sum.queued, requireDemand ? `measured demand and a score of ${minScore}+` : "demand evidence not required"],
                ["Improve existing pages", sum.updates, "the site already answers these keywords"],
                ["Taken by the pipeline", sum.taken, `${sum.removed} removed by staff`],
              ] as [string, number, string][]
            ).map(([label, value, sub]) => (
              <div key={label} className="rounded-lg border border-ink-200 p-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums text-ink-950">{value.toLocaleString("en-US")}</dd>
                <dd className="text-[12px] text-ink-600">{sub}</dd>
              </div>
            ))}
          </dl>
          {s ? (
            <p className="text-[13px] leading-relaxed text-ink-700" data-testid="backlog-state">
              {s.finishedAt ? `Last pass finished ${formatDateTime(new Date(s.finishedAt))}` : `Pass in progress: ${s.cursor.toLocaleString("en-US")} of ${s.total.toLocaleString("en-US")} read; it continues from there`}. SEO Intelligence held {s.clusters.toLocaleString("en-US")} guide recommendations ({s.total.toLocaleString("en-US")} distinct pages): {s.added.toLocaleString("en-US")} queued in this pass, {s.duplicates.toLocaleString("en-US")} dropped as duplicates of a topic or page that exists, {s.updates.toLocaleString("en-US")} turned into improve-existing entries, {s.notRelevant.toLocaleString("en-US")} left out as not about collectible comics.
            </p>
          ) : (
            <p className="text-[13px] text-ink-700" data-testid="backlog-state">The backlog has not been built yet. It is built by the scheduled job, or now with the button above.</p>
          )}
          <p className="rounded-lg bg-ink-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-700">
            The backlog is as large as the evidence: it holds one topic for every page SEO Intelligence can justify today and grows by itself as more keywords are researched or appear in Search Console. It is not padded with invented variations.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {chips("By content type", sum.byFormat, (k) => (isFormat(k) ? FORMATS[k].name : k))}
            {chips("By category", sum.byCategory, (k) => categoryBySlug(k)?.short ?? k)}
            {chips("By SEO priority", sum.byPriority, (k) => (k === "unmeasured" ? "No demand figure yet" : k[0].toUpperCase() + k.slice(1)))}
          </div>
        </div>
      </Card>
      <FilterBar action={base} reset>
        <input type="hidden" name="tab" value="backlog" />
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Topic or keyword" className={adminInput} />
        </Field>
        <Field label="Show">
          <select name="kind" defaultValue={kind} className={adminSelect}>
            <option value="new">New topics</option>
            <option value="update">Improve existing pages</option>
          </select>
        </Field>
        <Field label="SEO priority">
          <select name="priority" defaultValue={priority} className={adminSelect}>
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="unmeasured">No demand figure yet</option>
          </select>
        </Field>
        <Field label="Content type">
          <select name="format" defaultValue={format} className={adminSelect}>
            <option value="">Any</option>
            {Object.entries(FORMATS).map(([k, f]) => (
              <option key={k} value={k}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={category} className={adminSelect}>
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="Nothing queued here" body="Topics appear once the backlog has been built from SEO Intelligence." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Topic</Th>
              <Th>Primary keyword</Th>
              <Th>Secondary keywords</Th>
              <Th>Intent</Th>
              <Th>Type · category</Th>
              <Th>Priority</Th>
              <Th align="right">Volume</Th>
              <Th align="right">KD</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const secondary = (() => { try { return JSON.parse(t.secondaryJson) as string[]; } catch { return []; } })();
              return (
                <tr key={t.id} className="align-top">
                  <Td className="min-w-[260px] max-w-[360px]">
                    <span className="font-medium text-ink-950">{t.title ?? t.keyword}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{t.reason}</span>
                  </Td>
                  <Td className="min-w-[140px]">{t.keyword}</Td>
                  <Td className="min-w-[160px] max-w-[240px] text-[12px] text-ink-700">{secondary.length ? `${secondary.slice(0, 4).join(", ")}${secondary.length > 4 ? ` +${secondary.length - 4}` : ""}` : "—"}</Td>
                  <Td>{t.intent}</Td>
                  <Td className="whitespace-nowrap">
                    {isFormat(t.format) ? FORMATS[t.format].name : t.format} · {categoryBySlug(t.category)?.short ?? t.category}
                  </Td>
                  <Td>
                    <Tone tone={t.priority === "high" ? "success" : t.priority === "medium" ? "brand" : t.priority === "low" ? "warning" : "neutral"}>{t.priority === "unmeasured" ? "no figure" : t.priority}</Tone>
                    <span className="mt-1 block text-[11px] tabular-nums text-ink-500">score {t.score}</span>
                  </Td>
                  <Td align="right">{t.volume?.toLocaleString("en-US") ?? "—"}</Td>
                  <Td align="right">{t.difficulty !== null ? Math.round(t.difficulty) : "—"}</Td>
                  <Td className="min-w-[180px] max-w-[260px] text-[11px] leading-snug text-ink-600">{t.source ?? "—"}</Td>
                  <Td>
                    <Tone tone="warning">{TASK_LABEL[t.status] ?? t.status}</Tone>
                  </Td>
                  <Td>
                    <ConfirmButton label="Remove" message="Takes this topic out of the backlog. It will not be written or queued again." action={removeTopicAction.bind(null, t.id)} size="sm" />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={{ ...p.params, tab: "backlog" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}

async function Topics({ p, base, lastPlan, plan }: { p: ReturnType<typeof listParams>; base: string; lastPlan: { summary: string; at: Date } | null; plan: { duplicates?: { keyword: string; existing: string; why: string }[] } | null }) {
  const status = p.get("status");
  const where: Prisma.ContentTaskWhereInput = { day: { not: BACKLOG_DAY }, ...(status ? { status } : {}), ...(p.q ? { keyword: { contains: p.q, mode: "insensitive" as const } } : {}) };
  const [rows, total] = await Promise.all([db.contentTask.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: p.skip, take: p.per, select: { id: true, day: true, kind: true, status: true, keyword: true, volume: true, difficulty: true, intent: true, score: true, category: true, format: true, reason: true, error: true, articleId: true } }), db.contentTask.count({ where })]);
  return (
    <>
      {lastPlan && (
        <Card title="Last plan" description={formatDateTime(lastPlan.at)} className="mb-5">
          <div className="p-5 text-sm text-ink-800">
            <p>{lastPlan.summary}</p>
            {plan?.duplicates && plan.duplicates.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-ink-900">{plan.duplicates.length} topic(s) dropped because the site already covers them</summary>
                <ul className="mt-2 grid gap-1 text-[13px] text-ink-700">
                  {plan.duplicates.map((d) => (
                    <li key={d.keyword}>
                      “{d.keyword}” → {d.existing} <span className="text-ink-500">({d.why})</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-ink-500">Improve the existing page for these keywords instead of adding another one.</p>
              </details>
            )}
          </div>
        </Card>
      )}
      <FilterBar action={base} reset>
        <input type="hidden" name="tab" value="topics" />
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Keyword" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {Object.entries(TASK_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No topics yet" body="Each topic the planner chooses is listed here with the reason it was chosen and what happened to it." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Topic</Th>
              <Th>Day</Th>
              <Th>Category · format</Th>
              <Th align="right">Volume</Th>
              <Th align="right">KD</Th>
              <Th align="right">Score</Th>
              <Th>Status</Th>
              <Th>Why / what happened</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="align-top">
                <Td className="min-w-[200px] max-w-[280px] font-medium text-ink-950">{t.keyword}</Td>
                <Td className="whitespace-nowrap">{t.day}</Td>
                <Td>
                  {categoryBySlug(t.category)?.short ?? t.category} · {isFormat(t.format) ? FORMATS[t.format].name : t.format}
                </Td>
                <Td align="right">{t.volume?.toLocaleString("en-US") ?? "—"}</Td>
                <Td align="right">{t.difficulty !== null ? Math.round(t.difficulty) : "—"}</Td>
                <Td align="right">{t.score}</Td>
                <Td>
                  <Tone tone={tone(t.status)}>{TASK_LABEL[t.status] ?? t.status}</Tone>
                </Td>
                <Td className="min-w-[260px] max-w-[420px] text-[12px] leading-snug">
                  {t.error ? <span className="text-rose-700">{t.error}</span> : <span className="text-ink-600">{t.reason}</span>}
                </Td>
                <Td>
                  {t.articleId && (
                    <Link href={`/admin/guides/${t.articleId}`} className="text-[12px] font-semibold text-brand-700 hover:underline">
                      Article
                    </Link>
                  )}
                  {["failed", "skipped"].includes(t.status) && <ConfirmButton label="Try again" message="Queues this topic to be written again." action={retryTaskAction.bind(null, t.id)} size="sm" />}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={{ ...p.params, tab: "topics" }} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
