import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/pagination";
import { ReleaseQueueControls } from "@/components/admin/release-queue-controls";
import { AdminPageHeader, Card, EmptyState, FilterBar, Field, Kv, StatusBadge, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { can, requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { feedStatus, releaseQueueOverview } from "@/lib/catalog/release-queue";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Release queue" };
export const dynamic = "force-dynamic";

const SORTS = ["releaseAt", "price", "title", "publishedAt"] as const;

export default async function AdminReleaseQueuePage({ searchParams }: PageProps<"/admin/release-queue">) {
  const admin = await requireAdmin("products.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "releaseAt", sorts: SORTS, per: 50, defaultDir: "asc" });
  const status = p.get("status");
  const file = p.get("file");
  const day = p.get("day");
  const dayStart = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00Z`) : null;
  const where: Prisma.ProductWhereInput = {
    importSource: { not: null },
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(file ? { importFile: file } : {}),
    ...(dayStart ? { releaseAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) } } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" as const } }, { sku: { contains: p.q, mode: "insensitive" as const } }, { certNumber: { contains: p.q } }] } : {}),
  };
  const [overview, rows, total] = await Promise.all([
    releaseQueueOverview(),
    db.product.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.per, select: { id: true, slug: true, title: true, issue: true, grader: true, grade: true, sku: true, price: true, stock: true, status: true, importFile: true, releaseAt: true, publishedAt: true, moderationNote: true, images: { take: 1, select: { url: true } } } }),
    db.product.count({ where }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <AdminPageHeader
        title="Release queue"
        lead="Catalogue imports wait here as drafts and go live in daily batches. A draft is not on the storefront, in the sitemap or in the Merchant Center feed; it is submitted to Google only once it is published, in stock and buyable."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Release queue" }]}
      />
      {overview.total === 0 ? (
        <EmptyState title="Nothing queued" body="Run scripts/import-hipcomic-csv.mjs on the next CSV files and deploy; queued listings appear here with their release day." />
      ) : (
        <div className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Queue" className="lg:col-span-2" actions={overview.paused ? <Tone tone="warning">Paused</Tone> : <Tone tone="success">Running daily</Tone>}>
              <Kv
                items={[
                  { label: "Queued in total", value: overview.total.toLocaleString("en-US") },
                  { label: "Published", value: overview.published.toLocaleString("en-US") },
                  { label: "Waiting for their day", value: overview.waiting.toLocaleString("en-US") },
                  { label: "Hidden / suspended / archived since", value: overview.other.toLocaleString("en-US") },
                  { label: "Next batch", value: overview.nextDay ? `${overview.nextDay.date} — ${overview.nextDay.waiting} listing(s)${overview.nextDay.date <= today ? " (due now, goes live on the next job run)" : ""}` : "Queue finished" },
                  { label: "Last batch", value: overview.lastDay ? overview.lastDay.date : "—" },
                ]}
              />
              <div className="mt-4">
                <ReleaseQueueControls paused={overview.paused} canManage={can(admin, "products.manage")} />
              </div>
            </Card>
            <Card title="How it runs" description="The catalog_release job runs just after 00:00 UTC (and on the 03:00 UTC cron). It re-checks every due draft — title, issue, publisher, year, grade, price, stock, photo, and that no listing with the same certification number is already on sale — publishes the ones that pass, refreshes the feed and sitemap, and pings IndexNow.">
              <p className="text-[13px] text-ink-600">
                A listing that fails the check stays a draft with the reason in its moderation note. Sold or unpublished listings drop out of the feed on its next refresh (15 minutes).
              </p>
            </Card>
          </div>

          <Card title="Schedule" description="One row per release day.">
            <Table>
              <thead>
                <tr>
                  <Th>Release day</Th>
                  <Th align="right">Scheduled</Th>
                  <Th align="right">Published</Th>
                  <Th align="right">Waiting</Th>
                  <Th>State</Th>
                </tr>
              </thead>
              <tbody>
                {overview.schedule.map((d) => (
                  <tr key={d.date}>
                    <Td>
                      <Link className="font-medium text-brand-700 hover:underline" href={`/admin/release-queue?day=${d.date}`}>
                        {d.date}
                      </Link>
                    </Td>
                    <Td align="right">{d.total}</Td>
                    <Td align="right">{d.published}</Td>
                    <Td align="right">{d.waiting}</Td>
                    <Td>{d.waiting === 0 ? <Tone tone="success">Released</Tone> : d.date <= today ? <Tone tone="warning">Due</Tone> : <Tone tone="neutral">Scheduled</Tone>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card title="Listings" description="CSV file, product, scheduled date, publication status and Merchant Center feed status.">
            <FilterBar action="/admin/release-queue" reset>
              <Field label="Search">
                <input name="q" defaultValue={p.q} placeholder="Title, SKU or cert number" className={adminInput} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={status} className={adminSelect}>
                  <option value="">Any</option>
                  <option value="draft">Waiting (draft)</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="CSV file">
                <select name="file" defaultValue={file} className={adminSelect}>
                  <option value="">Any</option>
                  {overview.files.map((f) => (
                    <option key={f.file} value={f.file}>
                      {f.file} ({f.published}/{f.total})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Release day">
                <input name="day" type="date" defaultValue={day} className={adminInput} />
              </Field>
            </FilterBar>
            <Table>
              <thead>
                <tr>
                  <Th>CSV file</Th>
                  <Th>Product</Th>
                  <Th align="right">Price</Th>
                  <Th>Scheduled</Th>
                  <Th>Publication</Th>
                  <Th>Merchant Center feed</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const feed = feedStatus({ status: r.status, stock: r.stock, price: r.price, hasImage: Boolean(r.images[0]?.url) });
                  return (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-[12px] text-ink-600">{r.importFile ?? "—"}</Td>
                      <Td>
                        <Link className="font-medium text-ink-900 hover:underline" href={`/admin/products/${r.id}`}>
                          {r.title} {r.issue}
                        </Link>
                        <span className="block text-[12px] text-ink-500">
                          {r.grader} {r.grade} · {r.sku}
                          {r.status === "published" && (
                            <>
                              {" · "}
                              <Link className="text-brand-700 hover:underline" href={`/store/${r.slug}`}>
                                view
                              </Link>
                            </>
                          )}
                        </span>
                        {r.moderationNote && <span className="block text-[12px] text-rose-700">{r.moderationNote}</span>}
                      </Td>
                      <Td align="right">{formatMoney(r.price)}</Td>
                      <Td className="whitespace-nowrap">{r.releaseAt ? r.releaseAt.toISOString().slice(0, 10) : "—"}</Td>
                      <Td>
                        <StatusBadge status={r.status} />
                        {r.publishedAt && <span className="block text-[12px] text-ink-500">{formatDateTime(r.publishedAt)}</span>}
                      </Td>
                      <Td>{feed.inFeed ? <Tone tone="success">{feed.label}</Tone> : <span className="text-[12px] text-ink-600">{feed.label}</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination base="/admin/release-queue" params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
          </Card>
        </div>
      )}
    </>
  );
}
