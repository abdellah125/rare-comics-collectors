import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel, statusTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "My account", description: "Your orders, addresses and account settings.", path: "/account", noIndex: true });

export default async function AccountOverviewPage() {
  const user = await requireUser({ next: "/account" });
  const [orders, openTickets, unread, addresses, profile] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { placedAt: "desc" }, take: 5, select: { id: true, number: true, status: true, total: true, currency: true, presentmentTotal: true, placedAt: true, items: { select: { title: true }, take: 3 } } }),
    db.ticket.count({ where: { userId: user.id, status: { in: ["open", "pending"] } } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.address.count({ where: { userId: user.id } }),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true, twoFactorEnabled: true } }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader title={`Welcome back, ${user.name.split(" ")[0]}`} lead={`Member since ${formatDateTime(profile.createdAt, { dateOnly: true })}.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Unread notifications", value: unread, href: "/account/notifications" },
          { label: "Open support tickets", value: openTickets, href: "/account/support" },
          { label: "Saved addresses", value: addresses, href: "/account/addresses" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-ink-200 bg-ink-50 p-5 transition hover:border-brand-300 hover:bg-white">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">{s.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink-950">{s.value}</p>
          </Link>
        ))}
      </div>

      {!profile.twoFactorEnabled && (
        <Panel tone="muted">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-950">Protect your account with two-factor authentication</p>
              <p className="mt-0.5 text-sm text-ink-600">Adds a 6-digit code from your phone to every sign-in.</p>
            </div>
            <ButtonLink href="/account/security" size="sm" variant="primary">
              Enable 2FA
            </ButtonLink>
          </div>
        </Panel>
      )}

      <Panel title="Recent orders" description="Every purchase with its current status.">
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" body="Books you buy will appear here with tracking and invoices." action={<ButtonLink href="/store" size="sm">Browse the store</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/account/orders/${o.number}`} className="font-mono text-sm font-semibold text-ink-950 hover:text-brand-700">
                    {o.number}
                  </Link>
                  <p className="truncate text-[13px] text-ink-600">
                    {o.items.map((i) => i.title).join(", ")} · {formatDateTime(o.placedAt, { dateOnly: true })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone(o.status) === "danger" ? "sale" : statusTone(o.status) === "success" ? "brand" : "neutral"}>{statusLabel(o.status)}</Badge>
                  <span className="text-sm font-semibold tabular-nums text-ink-950">{formatMoney(o.presentmentTotal, o.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {orders.length > 0 && (
          <Link href="/account/orders" className="mt-4 inline-block text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            All orders →
          </Link>
        )}
      </Panel>
    </div>
  );
}
