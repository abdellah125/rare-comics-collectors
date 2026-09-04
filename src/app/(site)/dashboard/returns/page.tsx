import type { Metadata } from "next";
import Link from "next/link";
import { CaseThread } from "@/components/account/case-thread";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { ReturnDecisionForm } from "@/components/seller/return-decision-form";
import { SellerRefundForm } from "@/components/seller/seller-refund-form";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { caseMessages } from "@/lib/orders/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Returns", description: "Return requests on your items.", path: "/dashboard/returns", noIndex: true });

export default async function SellerReturnsPage() {
  const user = await requireSeller({ next: "/dashboard/returns" });
  const returns = await db.returnRequest.findMany({
    where: { orderItem: { sellerId: user.seller.id } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { order: { select: { number: true, id: true } }, orderItem: true, user: { select: { name: true } } },
  });
  const threads = await Promise.all(returns.map((r) => caseMessages("return", r.id, { includeInternal: false })));
  return (
    <div className="grid gap-8">
      <PageHeader title="Returns" lead="Respond within 3 business days. Approved returns are refunded once you mark the book received." />
      {returns.length === 0 ? (
        <EmptyState title="No return requests" />
      ) : (
        returns.map((r, idx) => {
          const item = r.orderItem!;
          const open = !["closed", "refunded", "rejected"].includes(r.status);
          return (
            <Panel
              key={r.id}
              title={`${item.title} × ${r.qty}`}
              description={
                <>
                  Order{" "}
                  <Link href={`/dashboard/orders/${r.order.number}`} className="font-mono text-brand-700">
                    {r.order.number}
                  </Link>{" "}
                  · {r.user.name} · {statusLabel(r.reason)} · requested {formatDateTime(r.createdAt, { timeZone: user.timezone })}
                </>
              }
            >
              <div className="mb-4 flex items-center gap-2">
                <Badge tone={r.status === "refunded" ? "brand" : r.status === "rejected" ? "sale" : "gold"}>{statusLabel(r.status)}</Badge>
                {r.details && <span className="text-sm text-ink-700">“{r.details}”</span>}
              </div>
              {r.status === "requested" && <ReturnDecisionForm returnId={r.id} mode="decide" />}
              {["approved", "shipped_back"].includes(r.status) && <ReturnDecisionForm returnId={r.id} mode="received" />}
              {r.status === "received" && (
                <div className="mt-2">
                  <p className="mb-2 text-sm text-ink-700">Book received — issue the refund to close the return.</p>
                  <SellerRefundForm orderId={r.order.id} returnRequestId={r.id} items={[{ id: item.id, title: item.title, remaining: item.qty - item.refundedQty, perUnit: Math.round((item.subtotal - item.discountAmount) / item.qty) }]} />
                </div>
              )}
              <div className="mt-5 border-t border-ink-100 pt-4">
                <CaseThread caseType="return" caseId={r.id} closed={!open} messages={threads[idx].map((m) => ({ id: m.id, authorRole: m.authorRole, authorName: m.author?.name ?? (m.authorRole === "admin" ? "Marketplace" : "System"), body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))} />
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}
