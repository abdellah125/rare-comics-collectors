import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { updateChargebackAction } from "@/lib/admin/actions/cases";
import { db } from "@/lib/db";
import { CHARGEBACK_STATUSES, statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Chargeback" };
export const dynamic = "force-dynamic";

export default async function AdminChargebackPage({ params }: PageProps<"/admin/disputes/chargebacks/[id]">) {
  await requireAdmin("disputes.manage");
  const { id } = await params;
  const cb = await db.chargeback.findUnique({ where: { id }, include: { order: { select: { id: true, number: true, email: true, total: true, paidAt: true, fulfillmentStatus: true, user: { select: { id: true, name: true, createdAt: true } }, shipments: { select: { status: true, trackingNumber: true, deliveredAt: true, carrier: { select: { name: true } } } }, items: { select: { title: true, qty: true, seller: { select: { displayName: true } } } } } }, payment: { select: { provider: true, providerRef: true, status: true, amount: true, createdAt: true } } } });
  if (!cb) notFound();
  type Evidence = { text?: string; by?: string; at?: string };
  let evidence: Evidence | null = null;
  if (cb.evidenceJson) {
    try {
      evidence = JSON.parse(cb.evidenceJson) as Evidence;
    } catch {
      evidence = null;
    }
  }
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Disputes", href: "/admin/disputes" }, { label: "Chargebacks", href: "/admin/disputes/chargebacks" }, { label: cb.order.number }]} title={`Chargeback ${formatMoney(cb.amount, cb.currency)} · ${cb.order.number}`} lead={`${cb.payment.provider}${cb.providerRef ? ` · ${cb.providerRef}` : ""} · received ${formatDateTime(cb.createdAt)}${cb.evidenceDueAt ? ` · evidence due ${formatDateTime(cb.evidenceDueAt)}` : ""}`} actions={<StatusBadge status={cb.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Evidence pack" description="Everything the provider will ask for. Copy it into the provider's dispute form; the outcome is then recorded here.">
            <Kv items={[{ label: "Customer", value: `${cb.order.user?.name ?? "guest"} <${cb.order.email}>${cb.order.user ? `, account since ${formatDateTime(cb.order.user.createdAt, { dateOnly: true })}` : ""}` }, { label: "Paid", value: cb.order.paidAt ? formatDateTime(cb.order.paidAt) : "—" }, { label: "Items", value: cb.order.items.map((i) => `${i.title} × ${i.qty}${i.seller ? ` (${i.seller.displayName})` : ""}`).join("; ") }, { label: "Fulfilment", value: statusLabel(cb.order.fulfillmentStatus) }, { label: "Shipments", value: cb.order.shipments.length === 0 ? "none" : cb.order.shipments.map((s) => `${s.carrier?.name ?? "carrier"} ${s.trackingNumber ?? ""} — ${statusLabel(s.status)}${s.deliveredAt ? ` delivered ${formatDateTime(s.deliveredAt)}` : ""}`).join("; ") }, { label: "Payment", value: `${cb.payment.provider} ${cb.payment.providerRef ?? ""} · ${statusLabel(cb.payment.status)} · ${formatMoney(cb.payment.amount)}` }, { label: "Reason code", value: cb.reason ?? "—" }]} />
            <p className="mt-3 text-[13px]">
              <Link href={`/admin/orders/${cb.order.id}`} className="font-semibold text-brand-700">
                Open the order for the full timeline →
              </Link>
            </p>
          </Card>
          {evidence?.text && (
            <Card title="Submitted evidence" description={`${evidence.by ?? ""} · ${evidence.at ? formatDateTime(new Date(evidence.at)) : ""}`}>
              <p className="whitespace-pre-line text-sm text-ink-800">{evidence.text}</p>
            </Card>
          )}
        </div>
        <Card title="Update" className="self-start">
          <ActionForm action={updateChargebackAction} hidden={{ id: cb.id }} submitLabel="Save">
            <Field label="Status">
              <select name="status" defaultValue={cb.status} className={adminSelect}>
                {CHARGEBACK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Evidence / response text" hint="Stored with your name and time; also submit it to the provider.">
              <textarea name="evidence" rows={8} defaultValue={evidence?.text ?? ""} className={adminTextarea} />
            </Field>
          </ActionForm>
          <p className="mt-3 text-[12px] text-ink-500">Marking a chargeback <strong>lost</strong> is recorded on the order; the provider has already debited the funds. Reverse the seller&apos;s ledger from the order page if needed.</p>
        </Card>
      </div>
    </>
  );
}
