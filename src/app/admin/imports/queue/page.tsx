import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { can, requireAdmin } from "@/lib/auth/session";
import { bulkImportAction, releaseAllReadyAction } from "@/lib/admin/actions/imports";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { marginOf } from "@/lib/imports/pricing";
import { DUPLICATE_LABEL, IMPORT_SOURCE, ITEM_STATUSES, SEO_LABEL, itemStatusLabel, itemStatusTone } from "@/lib/imports/status";
import { formatMoney } from "@/lib/money";
import { gradeLabel } from "@/lib/catalog/labels";

export const metadata: Metadata = { title: "Import review queue" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SORTS = ["createdAt", "retailPrice", "title", "reviewedAt"] as const;
const list = (s: string): string[] => {
  try {
    const v = JSON.parse(s) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export default async function AdminImportQueuePage({ searchParams }: PageProps<"/admin/imports/queue">) {
  const admin = await requireAdmin("products.view");
  const manage = can(admin, "products.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: SORTS, per: 50 });
  // Default view: what still needs a decision.
  const status = p.get("status") || "open";
  const duplicate = p.get("duplicate");
  const seo = p.get("seo");
  const price = p.get("price");
  const where: Prisma.ImportItemWhereInput = {
    source: IMPORT_SOURCE,
    ...(status === "all" ? {} : status === "open" ? { status: { in: ["pending_review", "approved", "ready"] } } : { status }),
    ...(duplicate ? { duplicateStatus: duplicate } : {}),
    ...(seo ? { seoStatus: seo } : {}),
    ...(price === "changed" ? { priceChangeNote: { not: null } } : price === "manual" ? { priceManual: true } : price === "auction" ? { auction: true } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" as const } }, { sourceTitle: { contains: p.q, mode: "insensitive" as const } }, { sourceId: { contains: p.q } }, { certNumber: { contains: p.q } }, { publisher: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, readyCount] = await Promise.all([
    db.importItem.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.per, include: { product: { select: { slug: true, status: true, price: true, stock: true } } } }),
    db.importItem.count({ where }),
    db.importItem.count({ where: { source: IMPORT_SOURCE, status: { in: ["ready", "approved"] } } }),
  ]);
  const base = "/admin/imports/queue";

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "HipComic import", href: "/admin/imports" }, { label: "Review queue" }]}
        title="Review queue"
        lead={`${total.toLocaleString("en-US")} product(s) in this view. Approve what should go on sale, then press Release: only released products are public.`}
        actions={manage && readyCount > 0 ? <ConfirmButton label={`Release all ${readyCount} approved`} title="Release all approved" message="Publishes every approved product, whatever the daily limit. They become visible on the store, in the sitemap and in the Merchant Center feed." action={releaseAllReadyAction} variant="primary" confirmLabel="Release" /> : undefined}
      />
      <FilterBar action={base} reset>
        <Field label="Search">
          <input name="q" defaultValue={p.q} placeholder="Title, id, cert number…" className={adminInput} />
        </Field>
        <Field label="Review status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="open">To do (pending, approved, ready)</option>
            <option value="all">All</option>
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {itemStatusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Duplicate status">
          <select name="duplicate" defaultValue={duplicate} className={adminSelect}>
            <option value="">Any</option>
            {Object.entries(DUPLICATE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="SEO status">
          <select name="seo" defaultValue={seo} className={adminSelect}>
            <option value="">Any</option>
            {Object.entries(SEO_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price">
          <select name="price" defaultValue={price} className={adminSelect}>
            <option value="">Any</option>
            <option value="auction">Sold by bidding</option>
            <option value="manual">Set by hand</option>
            <option value="changed">Source price changed</option>
          </select>
        </Field>
      </FilterBar>

      <BulkProvider>
        {manage && (
          <BulkActionsBar
            run={bulkImportAction}
            actions={[
              { id: "approve", label: "Approve" },
              { id: "release", label: "Release", confirm: "Release the selected products that are Ready to Release? They become public." },
              { id: "reject", label: "Reject" },
              { id: "restore", label: "Back to review" },
              { id: "remove", label: "Remove from queue", danger: true, confirm: "Remove the {n} selected product(s) from the queue? Released products are kept." },
            ]}
          />
        )}
        {rows.length === 0 ? (
          <EmptyState title="Nothing here" body={status === "open" ? "No products are waiting for a decision. Upload a file on the import page to add more." : "No products match these filters."} action={<Link href="/admin/imports" className={adminButton.outline}>Import page</Link>} />
        ) : (
          <Table>
            <thead>
              <tr>
                {manage && (
                  <Th className="w-8">
                    <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                  </Th>
                )}
                <Th>Image</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="title" label="Product" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="retailPrice" label="Price" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Source</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Imported" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Import status</Th>
                <Th>Duplicate status</Th>
                <Th>SEO status</Th>
                <Th>Review status</Th>
                {manage && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = r.title ? `${r.title} ${r.issue}`.trim() : r.sourceTitle;
                const problems = list(r.problemsJson);
                const margin = marginOf(r.sourcePrice, r.retailPrice);
                const image = r.imageUrl ?? r.sourceImage;
                return (
                  <tr key={r.id}>
                    {manage && (
                      <Td>
                        <RowCheckbox id={r.id} label={name} />
                      </Td>
                    )}
                    <Td>
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-11 rounded border border-ink-200 object-cover" />
                      ) : (
                        <span className="grid h-16 w-11 place-items-center rounded border border-dashed border-ink-300 text-[10px] text-ink-400">none</span>
                      )}
                    </Td>
                    <Td className="max-w-[300px]">
                      <Link href={`/admin/imports/${r.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                        {name}
                      </Link>
                      <span className="block text-[12px] text-ink-600">
                        {[r.grader && gradeLabel(r.grader, r.grade), r.publisher && r.publisher !== "Unknown" ? r.publisher : "publisher unknown", r.year ?? "year unknown"].filter(Boolean).join(" · ")}
                      </span>
                      {r.title && <span className="block truncate text-[11px] text-ink-400" title={r.sourceTitle}>{r.sourceTitle}</span>}
                      {/"(year|publisher)"/.test(r.knowledgeJson) && <span className="mt-0.5 inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-800">AI-filled: verify</span>}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <span className="font-semibold tabular-nums text-ink-950">{r.retailPrice !== null ? formatMoney(r.retailPrice) : "—"}</span>
                      {r.auction && <span className="block text-[11px] font-medium text-amber-700" title={r.priceBasis ?? undefined}>bidding: current bid</span>}
                      <span className="block text-[11px] text-ink-500">
                        {r.auction ? "current bid" : "source"} {r.sourcePrice !== null ? formatMoney(r.sourcePrice) : "—"}
                        {margin && !r.auction ? ` · ${margin.bps < 0 ? "−" : "+"}${(Math.abs(margin.bps) / 100).toFixed(margin.bps % 100 === 0 ? 0 : 1)}%` : ""}
                      </span>
                      {r.priceManual && <span className="block text-[11px] text-amber-700">set by hand</span>}
                      {r.priceChangeNote && <span className="block text-[11px] text-rose-700">source price changed</span>}
                    </Td>
                    <Td className="text-[12px]">
                      {r.sourceUrl ? (
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 hover:underline">
                          HipComic #{r.sourceId}
                        </a>
                      ) : (
                        <>HipComic #{r.sourceId}</>
                      )}
                      <span className="block text-ink-500">{r.importFile ?? "—"}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[12px]">{formatDateTime(r.createdAt, { dateOnly: true })}</Td>
                    <Td>
                      {r.status === "error" ? <Tone tone="danger">Error</Tone> : r.status === "duplicate" ? <Tone tone="neutral">Duplicate</Tone> : <Tone tone="success">Imported</Tone>}
                      {!r.available && <span className="mt-1 block text-[11px] text-rose-700">unavailable at source</span>}
                      {problems.length > 0 && <span className="mt-1 block max-w-[200px] text-[11px] text-rose-700">{problems.slice(0, 2).join("; ")}{problems.length > 2 ? ` (+${problems.length - 2})` : ""}</span>}
                    </Td>
                    <Td>
                      <Tone tone={r.duplicateStatus === "unique" ? "success" : r.duplicateStatus === "possible" ? "warning" : "neutral"}>{DUPLICATE_LABEL[r.duplicateStatus] ?? r.duplicateStatus}</Tone>
                      {r.duplicateOf && <span className="mt-1 block max-w-[200px] text-[11px] text-ink-500">{r.duplicateOf}</span>}
                    </Td>
                    <Td>
                      <Tone tone={r.seoStatus === "ok" ? "success" : r.seoStatus === "review" ? "warning" : "neutral"}>{SEO_LABEL[r.seoStatus] ?? r.seoStatus}</Tone>
                    </Td>
                    <Td>
                      <Tone tone={itemStatusTone(r.status)}>{itemStatusLabel(r.status)}</Tone>
                      {r.reviewedById === "auto-release" && r.status !== "pending_review" && <span className="mt-1 block text-[11px] text-ink-500">by the daily rule</span>}
                      {r.status === "released" && r.product && (
                        <Link href={`/store/${r.product.slug}`} className="mt-1 block text-[11px] text-brand-700 hover:underline">
                          view listing
                        </Link>
                      )}
                    </Td>
                    {manage && (
                      <Td className="whitespace-nowrap">
                        <span className="flex flex-wrap gap-1">
                          {r.status === "pending_review" && <ConfirmButton label="Approve" message={`Approve ${name}? It is checked and becomes Ready to Release; it is not public until you release it.`} action={bulkImportAction.bind(null, "approve", [r.id])} size="sm" />}
                          {r.status === "ready" && <ConfirmButton label="Release" message={`Release ${name} at ${r.retailPrice !== null ? formatMoney(r.retailPrice) : "—"}? It becomes public on the store.`} action={bulkImportAction.bind(null, "release", [r.id])} variant="primary" size="sm" confirmLabel="Release" />}
                          {["pending_review", "approved", "ready", "error"].includes(r.status) && <ConfirmButton label="Reject" message={`Reject ${name}? It stays in the queue as Rejected and is not imported again.`} action={bulkImportAction.bind(null, "reject", [r.id])} size="sm" variant="quiet" />}
                          <Link href={`/admin/imports/${r.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                            {r.status === "released" ? "View" : "Edit"}
                          </Link>
                        </span>
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </BulkProvider>
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
