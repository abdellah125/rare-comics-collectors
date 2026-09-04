import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { bulkSellersAction } from "@/lib/admin/actions/sellers";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { SELLER_STATUSES, VERIFICATION_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sellers" };
export const dynamic = "force-dynamic";

const SORTS = ["createdAt", "displayName", "salesCount", "ratingAvg"] as const;

export default async function AdminSellersPage({ searchParams }: PageProps<"/admin/sellers">) {
  const admin = await requireAdmin("sellers.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: SORTS });
  const status = p.get("status");
  const verification = p.get("verification");
  const where: Prisma.SellerProfileWhereInput = {
    ...(status ? { status } : {}),
    ...(verification ? { verificationStatus: verification } : {}),
    ...(p.q ? { OR: [{ displayName: { contains: p.q } }, { businessName: { contains: p.q } }, { user: { email: { contains: p.q } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.sellerProfile.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { email: true, name: true } }, _count: { select: { products: true, disputes: true } } } }),
    db.sellerProfile.count({ where }),
  ]);
  const base = "/admin/sellers";
  const manage = can(admin, "sellers.manage");
  return (
    <>
      <AdminPageHeader title="Sellers" lead={`${total} seller profile${total === 1 ? "" : "s"}. Applications, verification, commissions and performance.`} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[220px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Store, business or owner email" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {SELLER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Verification">
          <select name="verification" defaultValue={verification} className={adminSelect}>
            <option value="">Any</option>
            {VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      <BulkProvider>
        {manage && <BulkActionsBar run={bulkSellersAction} actions={[{ id: "approve", label: "Approve" }, { id: "reject", label: "Reject", danger: true, confirm: "Reject {n} applications?" }, { id: "suspend", label: "Suspend", danger: true, confirm: "Suspend {n} sellers and hide their listings?" }]} />}
        {rows.length === 0 ? (
          <EmptyState title="No sellers match" />
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
                  <SortLink base={base} params={p.params} sortKey="displayName" label="Store" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Status</Th>
                <Th>Verification</Th>
                <Th align="right">Listings</Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="salesCount" label="Sales" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">
                  <SortLink base={base} params={p.params} sortKey="ratingAvg" label="Rating" current={p.sort} dir={p.dir} />
                </Th>
                <Th align="right">Disputes</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Applied" current={p.sort} dir={p.dir} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-ink-50/60">
                  {manage && (
                    <Td>
                      <RowCheckbox id={s.id} label={s.displayName} />
                    </Td>
                  )}
                  <Td>
                    <Link href={`/admin/sellers/${s.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                      {s.displayName}
                    </Link>
                    <span className="block text-[12px] text-ink-500">
                      {s.user.name} · {s.user.email} · {s.countryCode}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td>
                    <StatusBadge status={s.verificationStatus} />
                  </Td>
                  <Td align="right">{s._count.products}</Td>
                  <Td align="right">{s.salesCount}</Td>
                  <Td align="right">{s.ratingCount ? `${s.ratingAvg.toFixed(1)} (${s.ratingCount})` : "—"}</Td>
                  <Td align="right">{s._count.disputes}</Td>
                  <Td className="text-ink-600">{formatDateTime(s.createdAt, { dateOnly: true })}</Td>
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
