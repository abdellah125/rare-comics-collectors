import type { Metadata } from "next";
import Link from "@/components/link";
import { KeywordResearchForm } from "@/components/admin/keyword-research-form";
import { AdminPageHeader, Card, DownloadLink, Kv, Table, Td, Th, Tone } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/i18n";
import { cachedKeywords, seedCandidates, usageOverview } from "@/lib/seo/keyword-research";
import { budgetState, semrushConfigured } from "@/lib/seo/semrush";

export const metadata: Metadata = { title: "Keyword research" };
export const dynamic = "force-dynamic";

const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));

export default async function AdminKeywordsPage() {
  await requireAdmin("content.manage");
  const configured = semrushConfigured();
  const [budget, usage, seeds] = await Promise.all([budgetState(), usageOverview(), seedCandidates()]);
  const cached = await cachedKeywords(budget.database, 200);

  return (
    <>
      <AdminPageHeader
        title="Keyword research"
        lead="Semrush search data for the store's own titles, publishers and buyer questions. Results are cached, so a phrase is paid for once; every call and its cost is listed below."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Keyword research" }]}
      />
      <div className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Semrush" actions={configured ? <Tone tone="success">Key on server</Tone> : <Tone tone="danger">Not configured</Tone>}>
            <Kv
              items={[
                { label: "Units left", value: budget.balance === null ? "not checked yet" : `${n(budget.balance)} (checked ${formatDateTime(budget.balanceAt)})` },
                { label: "Used today", value: `${n(budget.usedToday)} of ${n(budget.dailyLimit)} daily budget` },
                { label: "Reserve kept", value: n(budget.reserve) },
                { label: "This month", value: `${n(usage.monthUnits)} units in ${usage.monthCalls} call(s)` },
                { label: "Cache", value: `${n(usage.cachedCount)} phrase(s), reused for ${budget.cacheDays} days` },
                { label: "Default region", value: budget.database },
              ]}
            />
            <p className="mt-3 text-[12px] text-ink-500">
              Budget, reserve, cache and region live under <Link className="text-brand-700 hover:underline" href="/admin/settings/seo">Settings › SEO</Link>. The key is read from the server environment only.
            </p>
          </Card>
          <Card title="Prices" className="lg:col-span-2" description="Semrush bills per line returned. The overview costs 10 units per keyword, the two deeper reports 40 per line; the balance check is free.">
            <Table>
              <thead>
                <tr>
                  <Th>Report (this month)</Th>
                  <Th>Status</Th>
                  <Th align="right">Calls</Th>
                  <Th align="right">Lines</Th>
                  <Th align="right">Units</Th>
                </tr>
              </thead>
              <tbody>
                {usage.byReport.length === 0 ? (
                  <tr>
                    <Td className="text-ink-500">No calls yet this month.</Td>
                    <Td /><Td /><Td /><Td />
                  </tr>
                ) : (
                  usage.byReport.map((r) => (
                    <tr key={`${r.endpoint}-${r.status}`}>
                      <Td className="font-mono text-[12px]">{r.endpoint}</Td>
                      <Td><Tone tone={r.status === "ok" ? "success" : r.status === "empty" ? "neutral" : r.status === "blocked" ? "warning" : "danger"}>{r.status}</Tone></Td>
                      <Td align="right">{r._count._all}</Td>
                      <Td align="right">{n(r._sum.lines)}</Td>
                      <Td align="right">{n(r._sum.units)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>

        <Card title="Research" description="Start with the free connection test. Then paste keywords; anything already cached is answered without a call.">
          <KeywordResearchForm configured={configured} defaultDatabase={budget.database} seeds={seeds} />
        </Card>

        <Card title={`Cached keywords (${budget.database})`} description="Best monthly volume first." actions={<DownloadLink href={`/admin/keywords/export?database=${budget.database}`}>Download CSV</DownloadLink>}>
          {cached.length === 0 ? (
            <p className="text-[13px] text-ink-500">Nothing cached yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Keyword</Th>
                  <Th align="right">Volume / mo</Th>
                  <Th align="right">KD</Th>
                  <Th align="right">CPC</Th>
                  <Th>Intent</Th>
                  <Th align="right">Related</Th>
                  <Th align="right">Questions</Th>
                  <Th>Fetched</Th>
                </tr>
              </thead>
              <tbody>
                {cached.map((k) => (
                  <tr key={k.phrase}>
                    <Td className="font-medium text-ink-900">{k.phrase}</Td>
                    <Td align="right">{n(k.volume)}</Td>
                    <Td align="right">{n(k.difficulty)}</Td>
                    <Td align="right">{k.cpc === null ? "—" : `$${k.cpc.toFixed(2)}`}</Td>
                    <Td className="text-[12px]">{k.intents ?? "—"}</Td>
                    <Td align="right">{k.related.length}</Td>
                    <Td align="right">{k.questions.length}</Td>
                    <Td className="whitespace-nowrap text-[12px] text-ink-500">{formatDateTime(k.fetchedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Recent API calls" description="Every request, including blocked and failed ones. The key is never stored.">
          {usage.recent.length === 0 ? (
            <p className="text-[13px] text-ink-500">No calls yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Report</Th>
                  <Th>Request</Th>
                  <Th>Status</Th>
                  <Th align="right">Lines</Th>
                  <Th align="right">Units</Th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((u) => (
                  <tr key={u.id}>
                    <Td className="whitespace-nowrap text-[12px] text-ink-500">{formatDateTime(u.createdAt)}</Td>
                    <Td className="font-mono text-[12px]">{u.endpoint}</Td>
                    <Td className="text-[12px]">
                      {u.params}
                      {u.error && <span className="block text-rose-700">{u.error}</span>}
                    </Td>
                    <Td><Tone tone={u.status === "ok" ? "success" : u.status === "empty" ? "neutral" : u.status === "blocked" ? "warning" : "danger"}>{u.status}</Tone></Td>
                    <Td align="right">{u.lines}</Td>
                    <Td align="right">{u.units}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
