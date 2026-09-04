import type { Metadata } from "next";
import Link from "next/link";
import { AdminPageHeader, Card, EmptyState, StatusBadge } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Search" };

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/search">) {
  const admin = await requireAdmin("dashboard.view");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  if (!q) {
    return (
      <>
        <AdminPageHeader title="Search" lead="Search orders, users, listings, sellers and tickets." />
        <EmptyState title="Type something in the search box" body="Order numbers, emails, names, SKUs and ticket numbers all work." />
      </>
    );
  }
  const like = { contains: q, mode: "insensitive" as const };
  const [orders, users, products, sellers, tickets] = await Promise.all([
    can(admin, "orders.view") ? db.order.findMany({ where: { OR: [{ number: like }, { email: like }] }, take: 10, orderBy: { placedAt: "desc" }, select: { id: true, number: true, email: true, status: true, total: true } }) : [],
    can(admin, "users.view") ? db.user.findMany({ where: { deletedAt: null, OR: [{ email: like }, { name: like }] }, take: 10, select: { id: true, name: true, email: true, status: true, isSeller: true } }) : [],
    can(admin, "products.view") ? db.product.findMany({ where: { deletedAt: null, OR: [{ title: like }, { sku: like }, { slug: like }, { certNumber: like }] }, take: 10, select: { id: true, title: true, issue: true, sku: true, status: true, price: true } }) : [],
    can(admin, "sellers.view") ? db.sellerProfile.findMany({ where: { OR: [{ displayName: like }, { slug: like }, { businessName: like }] }, take: 10, select: { id: true, displayName: true, status: true } }) : [],
    can(admin, "support.view") ? db.ticket.findMany({ where: { OR: [{ number: like }, { subject: like }, { email: like }] }, take: 10, orderBy: { lastMessageAt: "desc" }, select: { id: true, number: true, subject: true, status: true } }) : [],
  ]);
  const total = orders.length + users.length + products.length + sellers.length + tickets.length;
  return (
    <>
      <AdminPageHeader title={`Results for “${q}”`} lead={`${total} match${total === 1 ? "" : "es"} across the sections you can access.`} />
      {total === 0 && <EmptyState title="Nothing matched" body="Try a full order number (RCC-…), an email address or a SKU." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {orders.length > 0 && (
          <Card title="Orders">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                    {o.number}
                  </Link>
                  <span className="truncate text-ink-600">{o.email}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    <span className="tabular-nums">{formatMoney(o.total)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {users.length > 0 && (
          <Card title="Users">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {u.name}
                  </Link>
                  <span className="truncate text-ink-600">{u.email}</span>
                  <span className="flex items-center gap-2">
                    {u.isSeller && <span className="text-[11px] uppercase text-ink-500">seller</span>}
                    <StatusBadge status={u.status} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {products.length > 0 && (
          <Card title="Listings">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {products.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/products/${p.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {p.title} {p.issue}
                  </Link>
                  <span className="font-mono text-ink-600">{p.sku}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={p.status} />
                    <span className="tabular-nums">{formatMoney(p.price)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {sellers.length > 0 && (
          <Card title="Sellers">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {sellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/sellers/${s.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {s.displayName}
                  </Link>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {tickets.length > 0 && (
          <Card title="Support tickets">
            <ul className="divide-y divide-ink-100 text-[13px]">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin/support/${t.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    <span className="font-mono">{t.number}</span> {t.subject}
                  </Link>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
