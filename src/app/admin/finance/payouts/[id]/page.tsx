import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Kv, StatusBadge, Table, Td, Th } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { payoutActionRun } from "@/lib/admin/actions/finance";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Payout" };
export const dynamic = "force-dynamic";

export default async function AdminPayoutPage({ params }: PageProps<"/admin/finance/payouts/[id]">) {
  const admin = await requireAdmin("finance.view");
  const { id } = await params;
  const payout = await db.payout.findUnique({ where: { id }, include: { seller: { select: { id: true, displayName: true, payoutMethod: true, payoutDetailsEnc: true, payoutDetailsMasked: true, verificationStatus: true, user: { select: { email: true } } } }, entries: { orderBy: { createdAt: "asc" }, include: { order: { select: { id: true, number: true } } } }, createdBy: { select: { name: true } } } });
  if (!payout) notFound();
  const manage = can(admin, "payouts.manage");
  // Payout destination is decrypted only for finance staff who can act on it, and only on this page.
  let destination: Record<string, string> | null = null;
  if (manage && payout.seller.payoutDetailsEnc) {
    try {
      destination = JSON.parse(decrypt(payout.seller.payoutDetailsEnc)) as Record<string, string>;
    } catch {
      destination = null;
    }
  }
  const open = ["pending", "scheduled", "processing"].includes(payout.status);
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Payouts", href: "/admin/finance/payouts" }, { label: payout.id.slice(-8).toUpperCase() }]} title={`Payout ${formatMoney(payout.amount)} → ${payout.seller.displayName}`} lead={`Created ${formatDateTime(payout.createdAt)}${payout.createdBy ? ` by ${payout.createdBy.name}` : " by scheduler"}${payout.note ? ` · ${payout.note}` : ""}`} actions={<StatusBadge status={payout.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card title="Ledger entries in this payout">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {payout.entries.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-600">{formatDateTime(e.createdAt, { dateOnly: true })}</Td>
                    <Td>{statusLabel(e.type)}</Td>
                    <Td>
                      {e.description}
                      {e.order && (
                        <Link href={`/admin/orders/${e.order.id}`} className="ml-1 font-mono text-[12px] text-brand-700">
                          {e.order.number}
                        </Link>
                      )}
                    </Td>
                    <Td align="right" className={e.amount < 0 ? "text-rose-700" : ""}>
                      {formatMoney(e.amount)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="grid gap-6">
          <Card title="Destination">
            <Kv items={[{ label: "Seller", value: <Link href={`/admin/sellers/${payout.seller.id}`} className="text-brand-700 hover:underline">{payout.seller.displayName}</Link> }, { label: "Owner", value: payout.seller.user.email }, { label: "Verification", value: statusLabel(payout.seller.verificationStatus) }, { label: "Method", value: payout.method ?? payout.seller.payoutMethod ?? "—" }, { label: "Masked", value: payout.destinationMasked ?? "—" }, ...(destination ? Object.entries(destination).filter(([, v]) => v).map(([k, v]) => ({ label: k.replace(/([A-Z])/g, " $1"), value: v })) : []), { label: "Period", value: payout.periodStart && payout.periodEnd ? `${formatDateTime(payout.periodStart, { dateOnly: true })} → ${formatDateTime(payout.periodEnd, { dateOnly: true })}` : "—" }, { label: "Scheduled for", value: payout.scheduledFor ? formatDateTime(payout.scheduledFor, { dateOnly: true }) : "—" }, { label: "Paid", value: payout.paidAt ? `${formatDateTime(payout.paidAt)} · ref ${payout.reference}` : "—" }]} />
            {destination && <p className="mt-3 text-[11px] text-ink-500">Bank details are decrypted for this view only; this access is not written to the audit log, the payment is.</p>}
          </Card>
          {manage && open && (
            <Card title="Actions">
              <div className="flex flex-wrap gap-2">
                {payout.status !== "processing" && <ConfirmButton label="Mark processing" message="You've started the transfer." action={payoutActionRun.bind(null, payout.id, "processing")} size="sm" />}
                <ConfirmButton label="Mark paid" message={`Confirm ${formatMoney(payout.amount)} was sent. The seller is emailed.`} action={payoutActionRun.bind(null, payout.id, "paid")} withReason reasonLabel="Transfer reference" variant="primary" size="sm" />
                <ConfirmButton label="Mark failed" message="Transfer bounced or was rejected. Funds stay reserved in this payout until cancelled." action={payoutActionRun.bind(null, payout.id, "failed")} withReason reasonLabel="Failure reason" variant="danger" size="sm" />
                <ConfirmButton label="Cancel & release funds" message="Returns the ledger entries to the seller's available balance." action={payoutActionRun.bind(null, payout.id, "cancel")} withReason variant="danger" size="sm" />
              </div>
            </Card>
          )}
          {manage && payout.status === "failed" && (
            <Card title="Actions">
              <ConfirmButton label="Cancel & release funds" message="Returns the ledger entries to the seller's available balance so a new payout can be created." action={payoutActionRun.bind(null, payout.id, "cancel")} withReason variant="danger" size="sm" />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
