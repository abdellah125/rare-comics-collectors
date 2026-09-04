import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminInput, adminSelect, adminButton } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { bulkUsersAction } from "@/lib/admin/actions/users";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { USER_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

const SORTS = ["createdAt", "lastLoginAt", "name", "email"] as const;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin("users.view");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: SORTS });
  const status = p.get("status");
  const kind = p.get("kind");
  const where: Prisma.UserWhereInput = {
    deletedAt: kind === "deleted" ? { not: null } : null,
    ...(status ? { status } : {}),
    ...(kind === "sellers" ? { isSeller: true } : kind === "admins" ? { roleId: { not: null } } : kind === "buyers" ? { isSeller: false, roleId: null } : {}),
    ...(p.get("buyers") ? { orders: { some: { paymentStatus: "paid" } } } : {}),
    ...(p.q ? { OR: [{ email: { contains: p.q } }, { name: { contains: p.q } }, { phone: { contains: p.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { role: { select: { name: true } }, sellerProfile: { select: { status: true } }, _count: { select: { orders: true } } } }),
    db.user.count({ where }),
  ]);
  const base = "/admin/users";
  const manage = can(admin, "users.manage");
  return (
    <>
      <AdminPageHeader title="Users" lead={`${total.toLocaleString("en-US")} accounts`} actions={can(admin, "admins.manage") ? <Link href="/admin/admins" className={adminButton.outline}>Admins & roles</Link> : undefined} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[220px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Name, email or phone" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue={kind} className={adminSelect}>
            <option value="">Everyone</option>
            <option value="buyers">Buyers only</option>
            <option value="sellers">Sellers</option>
            <option value="admins">Admins</option>
            <option value="deleted">Deleted</option>
          </select>
        </Field>
      </FilterBar>
      <BulkProvider>
        {manage && (
          <BulkActionsBar
            run={bulkUsersAction}
            actions={[
              { id: "suspend", label: "Suspend", danger: true, confirm: "Suspend {n} accounts and sign them out?" },
              { id: "reactivate", label: "Reactivate" },
              { id: "restrict_purchase", label: "Restrict purchasing" },
              { id: "send_reset", label: "Send password reset", confirm: "Email a password reset link to {n} users?" },
            ]}
          />
        )}
        {rows.length === 0 ? (
          <EmptyState title="No users match" />
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
                  <SortLink base={base} params={p.params} sortKey="name" label="User" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th align="right">Orders</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Joined" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="lastLoginAt" label="Last login" current={p.sort} dir={p.dir} />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-ink-50/60">
                  {manage && (
                    <Td>
                      <RowCheckbox id={u.id} label={u.email} />
                    </Td>
                  )}
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                      {u.name}
                    </Link>
                    <span className="block text-[12px] text-ink-500">{u.email}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {u.role && <Tone tone="dark">{u.role.name}</Tone>}
                      {u.isSeller && <Tone tone={u.sellerProfile?.status === "approved" ? "brand" : "neutral"}>Seller{u.sellerProfile && u.sellerProfile.status !== "approved" ? ` · ${u.sellerProfile.status}` : ""}</Tone>}
                      {!u.role && !u.isSeller && <span className="text-ink-500">Buyer</span>}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={u.deletedAt ? "deleted" : u.status} />
                    {u.twoFactorEnabled && <span className="ml-1 text-[11px] text-ink-500">2FA</span>}
                  </Td>
                  <Td align="right">{u._count.orders}</Td>
                  <Td className="text-ink-600">{formatDateTime(u.createdAt, { dateOnly: true })}</Td>
                  <Td className="text-ink-600">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</Td>
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
