import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Disputes", description: "Disputes involving your items.", path: "/dashboard/disputes", noIndex: true });

export default async function SellerDisputesPage() {
  const user = await requireSeller({ next: "/dashboard/disputes" });
  const disputes = await db.dispute.findMany({ where: { sellerId: user.seller.id }, orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { number: true } }, orderItem: { select: { title: true } }, openedBy: { select: { name: true } } } });
  return (
    <div className="grid gap-8">
      <PageHeader title="Disputes" lead="A buyer opened a case. Reply with evidence — photos, tracking, cert numbers. Marketplace staff decide if you can't agree." />
      <Panel>
        {disputes.length === 0 ? (
          <EmptyState title="No disputes" body="Good news — nothing to resolve." />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {disputes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/dashboard/disputes/${d.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {d.orderItem?.title ?? "Whole order"} — {statusLabel(d.reason)}
                  </Link>
                  <p className="text-[13px] text-ink-600">
                    <span className="font-mono">{d.order.number}</span> · opened by {d.openedBy.name} · {formatDateTime(d.createdAt, { timeZone: user.timezone })}
                  </p>
                </div>
                <Badge tone={d.status === "awaiting_seller" ? "sale" : ["resolved", "closed"].includes(d.status) ? "neutral" : "gold"}>{statusLabel(d.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
