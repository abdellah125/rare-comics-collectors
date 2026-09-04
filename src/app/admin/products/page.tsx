import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, DownloadLink } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { bulkProductsAction } from "@/lib/admin/actions/products";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { ERAS, GRADERS, PRODUCT_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Listings" };
export const dynamic = "force-dynamic";

const SORTS = ["updatedAt", "price", "stock", "title", "soldCount", "viewCount", "createdAt"] as const;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const admin = await requireAdmin("products.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "updatedAt", sorts: SORTS });
  const status = p.get("status");
  const seller = p.get("seller");
  const era = p.get("era");
  const grader = p.get("grader");
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(seller === "house" ? { sellerId: null } : seller ? { sellerId: seller } : {}),
    ...(era ? { era } : {}),
    ...(grader ? { grader } : {}),
    ...(p.get("featured") ? { featured: true } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q } }, { issue: { contains: p.q } }, { sku: { contains: p.q } }, { certNumber: { contains: p.q } }, { publisher: { contains: p.q } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.product.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { seller: { select: { id: true, displayName: true } }, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } }),
    db.product.count({ where }),
    db.product.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const base = "/admin/products";
  const manage = can(admin, "products.manage");
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return (
    <>
      <AdminPageHeader
        title="Listings"
        lead={`${total.toLocaleString("en-US")} listings · ${countOf("pending")} awaiting review · ${countOf("published")} live`}
        actions={
          manage ? (
            <>
              <Link href="/admin/products/import" className={adminButton.outline}>
                Import CSV
              </Link>
              <DownloadLink href={`/api/admin/export/products?${new URLSearchParams(p.params as Record<string, string>).toString()}`} className={adminButton.outline}>
                Export CSV
              </DownloadLink>
              <Link href="/admin/products/new" className={adminButton.primary}>
                + New listing
              </Link>
            </>
          ) : undefined
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {["", ...PRODUCT_STATUSES].map((s) => (
          <Link key={s} href={s ? `${base}?status=${s}` : base} className={`rounded-full border px-3 py-1 text-[12px] ${status === s ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
            {s ? s : "all"} <span className="text-ink-500">({s ? countOf(s) : counts.reduce((n, c) => n + c._count._all, 0)})</span>
          </Link>
        ))}
      </div>
      <FilterBar action={base} reset>
        {status && <input type="hidden" name="status" value={status} />}
        <Field label="Search" className="min-w-[220px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Title, issue, SKU, cert #" className={adminInput} />
        </Field>
        <Field label="Seller">
          <select name="seller" defaultValue={seller} className={adminSelect}>
            <option value="">Any</option>
            <option value="house">House inventory</option>
          </select>
        </Field>
        <Field label="Era">
          <select name="era" defaultValue={era} className={adminSelect}>
            <option value="">Any</option>
            {ERAS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
        <Field label="Grader">
          <select name="grader" defaultValue={grader} className={adminSelect}>
            <option value="">Any</option>
            {GRADERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
      </FilterBar>
      <BulkProvider>
        {manage && (
          <BulkActionsBar
            run={bulkProductsAction}
            actions={[
              { id: "approve", label: "Approve / publish" },
              { id: "hide", label: "Hide" },
              { id: "feature", label: "Feature" },
              { id: "unfeature", label: "Unfeature" },
              { id: "archive", label: "Archive", danger: true, confirm: "Archive {n} listings? They disappear from the store." },
            ]}
          />
        )}
        {rows.length === 0 ? (
          <EmptyState title="No listings match" />
        ) : (
          <Table>
            <thead>
              <tr>
                {manage && (
                  <Th className="w-8">
                    <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                  </Th>
                )}
                <Th>
                  <SortLink base={base} params={p.params} sortKey="title" label="Listing" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Seller</Th>
                <Th>Status</Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="price" label="Price" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="stock" label="Stock" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="soldCount" label="Sold" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="viewCount" label="Views" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="updatedAt" label="Updated" current={p.sort} dir={p.dir} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pr) => (
                <tr key={pr.id} className="hover:bg-ink-50/60">
                  {manage && (
                    <Td>
                      <RowCheckbox id={pr.id} label={`${pr.title} ${pr.issue}`} />
                    </Td>
                  )}
                  <Td>
                    <span className="flex items-center gap-3">
                      {pr.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pr.images[0].url} alt="" className="h-12 w-9 rounded object-cover ring-1 ring-ink-200" />
                      ) : (
                        <span className="grid h-12 w-9 place-items-center rounded bg-ink-100 text-[9px] text-ink-400">none</span>
                      )}
                      <span>
                        <Link href={`/admin/products/${pr.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                          {pr.title} {pr.issue}
                        </Link>
                        <span className="block text-[12px] text-ink-500">
                          {pr.grader} {pr.grade} · {pr.publisher} {pr.year} · <span className="font-mono">{pr.sku}</span>
                        </span>
                        <span className="flex gap-1">
                          {pr.featured && <Tone tone="gold">Featured</Tone>}
                          {pr.bestseller && <Tone tone="brand">Bestseller</Tone>}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td>{pr.seller ? <Link href={`/admin/sellers/${pr.seller.id}`} className="text-ink-800 hover:text-brand-700">{pr.seller.displayName}</Link> : <span className="text-ink-500">House</span>}</Td>
                  <Td>
                    <StatusBadge status={pr.status} />
                  </Td>
                  <Td align="right">{formatMoney(pr.price)}</Td>
                  <Td align="right">{pr.stock}</Td>
                  <Td align="right">{pr.soldCount}</Td>
                  <Td align="right">{pr.viewCount}</Td>
                  <Td className="text-ink-600">{formatDateTime(pr.updatedAt, { dateOnly: true })}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </BulkProvider>
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
