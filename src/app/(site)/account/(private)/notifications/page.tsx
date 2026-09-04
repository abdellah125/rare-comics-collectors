import type { Metadata } from "next";
import Link from "next/link";
import { NotificationPrefsForm } from "@/components/account/notification-prefs-form";
import { MarkAllRead } from "@/components/account/mark-all-read";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Notifications", description: "Your notifications and email preferences.", path: "/account/notifications", noIndex: true });

export default async function NotificationsPage() {
  const user = await requireUser({ next: "/account/notifications" });
  const [notifications, prefs] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.notificationPreference.findUnique({ where: { userId: user.id } }),
  ]);
  const unread = notifications.filter((n) => !n.readAt).length;
  return (
    <div className="grid gap-8">
      <PageHeader title="Notifications" lead="Order updates, seller alerts and support replies." actions={unread > 0 ? <MarkAllRead /> : undefined} />
      <Panel>
        {notifications.length === 0 ? (
          <EmptyState title="Nothing yet" body="Updates about your orders and account will show up here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {notifications.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${n.readAt ? "" : "bg-brand-50/40"}`}>
                <div className="min-w-0">
                  <p className={`text-sm ${n.readAt ? "text-ink-800" : "font-semibold text-ink-950"}`}>{n.href ? <Link href={n.href} className="hover:text-brand-700">{n.title}</Link> : n.title}</p>
                  {n.body && <p className="mt-0.5 text-[13px] text-ink-600">{n.body}</p>}
                </div>
                <span className="text-xs text-ink-500">{formatDateTime(n.createdAt, { timeZone: user.timezone })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Email preferences" description="Security notices (new device sign-ins, password changes) are always sent.">
        <NotificationPrefsForm prefs={prefs ?? { orderUpdates: true, sellerAlerts: true, supportReplies: true, marketing: false, productAlerts: true }} />
      </Panel>
    </div>
  );
}
