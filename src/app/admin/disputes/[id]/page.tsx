import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseThread } from "@/components/account/case-thread";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, Tone, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { adminCaseMessageAction, decideDisputeAction, setDisputeStatusAction } from "@/lib/admin/actions/cases";
import { db } from "@/lib/db";
import { DISPUTE_OUTCOMES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { caseMessages, toThreadMessages } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Dispute" };
export const dynamic = "force-dynamic";

export default async function AdminDisputePage({ params }: PageProps<"/admin/disputes/[id]">) {
  await requireAdmin("disputes.manage");
  const { id } = await params;
  const d = await db.dispute.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, number: true, email: true, paymentStatus: true, fulfillmentStatus: true, total: true, userId: true, refunds: { where: { status: "succeeded" }, select: { amount: true } }, user: { select: { id: true, name: true, email: true } } } },
      orderItem: { select: { title: true, qty: true, subtotal: true, discountAmount: true } },
      openedBy: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, displayName: true, userId: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!d) notFound();
  const messages = toThreadMessages(await caseMessages("dispute", d.id, { includeInternal: true }));
  const closed = d.status === "resolved" || d.status === "closed";
  const remaining = Math.max(0, d.order.total - d.order.refunds.reduce((s, r) => s + r.amount, 0));
  const itemValue = d.orderItem ? d.orderItem.subtotal - d.orderItem.discountAmount : d.order.total;
  const [shipments, relatedReturns] = await Promise.all([db.shipment.findMany({ where: { orderId: d.orderId }, select: { id: true, status: true, trackingNumber: true, shippedAt: true, deliveredAt: true } }), db.returnRequest.findMany({ where: { orderId: d.orderId }, select: { id: true, status: true } })]);
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Disputes", href: "/admin/disputes" }, { label: d.order.number }]}
        title={`Dispute · ${statusLabel(d.reason)}`}
        lead={`Opened ${formatDateTime(d.createdAt)} by ${d.openedBy.name} (${d.openedByRole})${d.escalatedAt ? ` · escalated ${formatDateTime(d.escalatedAt)}` : ""}${d.decidedBy ? ` · decided by ${d.decidedBy.name}` : ""}`}
        actions={
          <span className="flex gap-1">
            {d.priority === "high" && <Tone tone="danger">high priority</Tone>}
            <StatusBadge status={d.status} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Claim">
            <p className="whitespace-pre-line text-sm text-ink-800">{d.details}</p>
          </Card>
          {d.decision && (
            <Card title={`Ruling: ${statusLabel(d.outcome ?? "none")}`} description={d.decidedAt ? formatDateTime(d.decidedAt) : undefined}>
              <p className="whitespace-pre-line text-sm text-ink-800">{d.decision}</p>
              {d.refundAmount ? <p className="mt-2 text-[13px] text-ink-700">Refund issued: {formatMoney(d.refundAmount)}</p> : null}
            </Card>
          )}
          <Card title="Conversation" description="Both parties see non-internal messages. Use internal notes for evidence review.">
            <CaseThread caseType="dispute" caseId={d.id} messages={messages} closed={d.status === "closed"} action={adminCaseMessageAction} allowInternal />
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Evidence at a glance">
            <Kv items={[{ label: "Order", value: <Link href={`/admin/orders/${d.order.id}`} className="font-mono text-brand-700">{d.order.number}</Link> }, { label: "Item", value: d.orderItem ? `${d.orderItem.title} × ${d.orderItem.qty}` : "Whole order" }, { label: "Buyer", value: d.order.user ? <Link href={`/admin/users/${d.order.user.id}`} className="text-brand-700">{d.order.user.email}</Link> : d.order.email }, { label: "Seller", value: d.seller ? <Link href={`/admin/sellers/${d.seller.id}`} className="text-brand-700">{d.seller.displayName}</Link> : "Marketplace" }, { label: "Payment", value: statusLabel(d.order.paymentStatus) }, { label: "Fulfilment", value: statusLabel(d.order.fulfillmentStatus) }, { label: "Shipments", value: shipments.length === 0 ? "none" : shipments.map((s) => `${statusLabel(s.status)}${s.trackingNumber ? ` (${s.trackingNumber})` : ""}${s.deliveredAt ? ` delivered ${formatDateTime(s.deliveredAt, { dateOnly: true })}` : ""}`).join("; ") }, { label: "Returns", value: relatedReturns.length === 0 ? "none" : relatedReturns.map((r) => <Link key={r.id} href={`/admin/returns/${r.id}`} className="mr-2 text-brand-700">{statusLabel(r.status)}</Link>) }, { label: "Item value", value: formatMoney(itemValue) }, { label: "Refundable left", value: formatMoney(remaining) }]} />
          </Card>
          {!closed && (
            <Card title="Workflow">
              <div className="flex flex-wrap gap-2">
                <ConfirmButton label="Ask seller" message="Marks the case as awaiting the seller's response." action={setDisputeStatusAction.bind(null, d.id, "awaiting_seller")} withReason reasonLabel="Message to both parties (optional)" size="sm" />
                <ConfirmButton label="Ask buyer" message="Marks the case as awaiting the buyer's response." action={setDisputeStatusAction.bind(null, d.id, "awaiting_buyer")} withReason reasonLabel="Message (optional)" size="sm" />
                <ConfirmButton label="Under review" message="You're reviewing the evidence." action={setDisputeStatusAction.bind(null, d.id, "under_review")} withReason reasonLabel="Message (optional)" size="sm" />
                {d.status !== "escalated" && <ConfirmButton label="Escalate" message="Raises priority to high and flags for a senior decision." action={setDisputeStatusAction.bind(null, d.id, "escalated")} withReason reasonLabel="Why" variant="danger" size="sm" />}
                <ConfirmButton label="Close without ruling" message="Closes the dispute with no refund — e.g. withdrawn." action={setDisputeStatusAction.bind(null, d.id, "closed")} withReason reasonLabel="Reason" size="sm" />
              </div>
            </Card>
          )}
          {!closed && (
            <Card title="Final decision" description="Notifies both parties, records the ruling on the order and optionally refunds the buyer.">
              <ActionForm action={decideDisputeAction} hidden={{ disputeId: d.id }} submitLabel="Record decision" variant="danger">
                <Field label="In favour of">
                  <select name="outcome" className={adminSelect} defaultValue="buyer">
                    {DISPUTE_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {o === "none" ? "No fault (close)" : o === "split" ? "Split — partial refund" : o}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Refund to buyer (USD)" hint={`Up to ${formatMoney(remaining)}. Leave blank when ruling for the seller.`}>
                  <input name="refundAmount" type="number" step="0.01" min={0} max={(remaining / 100).toFixed(2)} defaultValue={d.order.paymentStatus === "unpaid" ? "" : (Math.min(itemValue, remaining) / 100).toFixed(2)} className={adminInput} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="restock" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Item returned to stock
                </label>
                <Field label="Decision (sent to both parties)">
                  <textarea name="decision" rows={4} required minLength={5} className={adminTextarea} />
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
