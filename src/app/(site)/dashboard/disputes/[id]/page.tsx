import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseThread } from "@/components/account/case-thread";
import { DescriptionList, PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { caseMessages } from "@/lib/orders/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Dispute", description: "Dispute case.", path: "/dashboard/disputes", noIndex: true });

export default async function SellerDisputePage({ params }: PageProps<"/dashboard/disputes/[id]">) {
  const { id } = await params;
  const user = await requireSeller({ next: `/dashboard/disputes/${id}` });
  const dispute = await db.dispute.findFirst({ where: { id, sellerId: user.seller.id }, include: { order: { select: { number: true } }, orderItem: true, openedBy: { select: { name: true } } } });
  if (!dispute) notFound();
  const messages = await caseMessages("dispute", dispute.id, { includeInternal: false });
  const closed = ["resolved", "closed"].includes(dispute.status);
  return (
    <div className="grid gap-8">
      <PageHeader title={`Dispute — ${statusLabel(dispute.reason)}`} lead={<>Order <Link href={`/dashboard/orders/${dispute.order.number}`} className="font-mono text-brand-700">{dispute.order.number}</Link> · opened by {dispute.openedBy.name} on {formatDateTime(dispute.createdAt, { timeZone: user.timezone, dateOnly: true })}</>} actions={<Badge tone={dispute.status === "awaiting_seller" ? "sale" : closed ? "neutral" : "gold"}>{statusLabel(dispute.status)}</Badge>} />
      <Panel>
        <DescriptionList items={[{ label: "Item", value: dispute.orderItem ? `${dispute.orderItem.title} × ${dispute.orderItem.qty}` : "Whole order" }, { label: "Buyer's statement", value: dispute.details }, ...(dispute.outcome ? [{ label: "Outcome", value: `${statusLabel(dispute.outcome)}${dispute.refundAmount ? ` — refund ${formatMoney(dispute.refundAmount)}` : ""}` }] : []), ...(dispute.decision ? [{ label: "Decision", value: dispute.decision }] : [])]} />
      </Panel>
      <Panel title="Conversation" description={closed ? "This case is closed." : "Reply with your side and any evidence. Photos and PDFs can be attached."}>
        <CaseThread caseType="dispute" caseId={dispute.id} closed={closed} messages={messages.map((m) => ({ id: m.id, authorRole: m.authorRole, authorName: m.author?.name ?? (m.authorRole === "admin" ? "Marketplace" : "System"), body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))} />
      </Panel>
    </div>
  );
}
