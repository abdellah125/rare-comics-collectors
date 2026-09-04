import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseThread } from "@/components/account/case-thread";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, adminInput, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { adminCaseMessageAction, refundReturnAction, setReturnStatusAction } from "@/lib/admin/actions/cases";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { caseMessages, toThreadMessages } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Return" };
export const dynamic = "force-dynamic";

export default async function AdminReturnPage({ params }: PageProps<"/admin/returns/[id]">) {
  await requireAdmin("returns.manage");
  const { id } = await params;
  const rr = await db.returnRequest.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, number: true, email: true, paymentStatus: true, total: true, paidAt: true, refunds: { where: { status: "succeeded" }, select: { amount: true } } } },
      orderItem: { include: { seller: { select: { id: true, displayName: true } } } },
      user: { select: { id: true, name: true, email: true } },
      handledBy: { select: { name: true } },
    },
  });
  if (!rr) notFound();
  const messages = toThreadMessages(await caseMessages("return", rr.id, { includeInternal: true }));
  const itemValue = rr.orderItem ? rr.orderItem.subtotal - rr.orderItem.discountAmount : rr.order.total;
  const remaining = Math.max(0, rr.order.total - rr.order.refunds.reduce((s, r) => s + r.amount, 0));
  const closed = ["refunded", "closed", "rejected"].includes(rr.status);
  const next = (
    {
      requested: [
        { s: "approved", label: "Approve return", variant: "primary" as const, msg: "The buyer is told to ship the item back." },
        { s: "rejected", label: "Reject", variant: "danger" as const, msg: "Explain why the return is refused; the buyer is emailed." },
      ],
      approved: [{ s: "received", label: "Mark received", variant: "primary" as const, msg: "The item arrived back with the seller / marketplace." }],
      shipped_back: [{ s: "received", label: "Mark received", variant: "primary" as const, msg: "The item arrived back." }],
      received: [],
    } as Record<string, { s: string; label: string; variant: "primary" | "danger" | "outline"; msg: string }[]>
  )[rr.status] ?? [];
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Returns", href: "/admin/returns" }, { label: rr.order.number }]}
        title={`Return · ${rr.orderItem?.title ?? "order " + rr.order.number}`}
        lead={`Requested ${formatDateTime(rr.createdAt)} by ${rr.user.name} · reason: ${statusLabel(rr.reason)}${rr.handledBy ? ` · handled by ${rr.handledBy.name}` : ""}`}
        actions={<StatusBadge status={rr.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Buyer's request">
            <p className="whitespace-pre-line text-sm text-ink-800">{rr.details || "No details given."}</p>
            {rr.returnTrackingNumber && <p className="mt-2 text-[13px] text-ink-600">Return tracking: <span className="font-mono">{rr.returnTrackingNumber}</span></p>}
            {rr.sellerNote && <p className="mt-2 rounded-lg bg-gold-400/10 px-3 py-2 text-[13px] text-ink-800"><strong>Seller:</strong> {rr.sellerNote}</p>}
            {rr.adminNote && <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-[13px] text-ink-800"><strong>Admin note:</strong> {rr.adminNote}</p>}
          </Card>
          <Card title="Conversation" description="Internal notes are only visible to admins.">
            <CaseThread caseType="return" caseId={rr.id} messages={messages} closed={rr.status === "closed"} action={adminCaseMessageAction} allowInternal />
          </Card>
        </div>
        <div className="grid gap-6 self-start">
          <Card title="Summary">
            <Kv items={[{ label: "Order", value: <Link href={`/admin/orders/${rr.order.id}`} className="font-mono text-brand-700">{rr.order.number}</Link> }, { label: "Buyer", value: <Link href={`/admin/users/${rr.user.id}`} className="text-brand-700">{rr.user.email}</Link> }, { label: "Seller", value: rr.orderItem?.seller ? <Link href={`/admin/sellers/${rr.orderItem.seller.id}`} className="text-brand-700">{rr.orderItem.seller.displayName}</Link> : "Marketplace" }, { label: "Quantity", value: rr.qty }, { label: "Item value", value: formatMoney(itemValue) }, { label: "Order payment", value: statusLabel(rr.order.paymentStatus) }, { label: "Refundable left", value: formatMoney(remaining) }, { label: "Resolution", value: rr.resolution ? statusLabel(rr.resolution) : "—" }, { label: "Refunded", value: rr.refundAmount !== null ? formatMoney(rr.refundAmount) : "—" }]} />
          </Card>
          {!closed && (
            <Card title="Decision">
              <div className="flex flex-wrap gap-2">
                {next.map((n) => (
                  <ConfirmButton key={n.s} label={n.label} message={n.msg} action={setReturnStatusAction.bind(null, rr.id, n.s)} withReason reasonLabel="Note to buyer" variant={n.variant} size="sm" />
                ))}
                <ConfirmButton label="Close without refund" message="Closes the case. Use when the buyer withdrew or the matter is settled elsewhere." action={setReturnStatusAction.bind(null, rr.id, "closed")} withReason size="sm" />
              </div>
            </Card>
          )}
          {!closed && rr.order.paymentStatus !== "unpaid" && remaining > 0 && (
            <Card title="Refund & close" description="Refunds go back through the original payment provider; the seller's ledger is reversed automatically.">
              <ActionForm action={refundReturnAction} hidden={{ returnId: rr.id }} submitLabel="Refund and close return" variant="danger">
                <Field label="Amount (USD)">
                  <input name="amount" type="number" step="0.01" min="0.01" max={(remaining / 100).toFixed(2)} defaultValue={(Math.min(itemValue, remaining) / 100).toFixed(2)} className={adminInput} required />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="restock" defaultChecked className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Return item to stock
                </label>
                <Field label="Note (internal)">
                  <textarea name="note" rows={2} className={adminTextarea} />
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
