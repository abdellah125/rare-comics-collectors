import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, EmptyState, Field, Kv, StatusBadge, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { createPayoutNowAction, reviewDocumentAction, reviewSellerAction, setVerificationAction, updateSellerSettingsAction } from "@/lib/admin/actions/sellers";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { sellerBalance } from "@/lib/finance/ledger";
import { formatDateTime } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { bpsToPercent, formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Seller" };
export const dynamic = "force-dynamic";

export default async function AdminSellerPage({ params }: PageProps<"/admin/sellers/[id]">) {
  const admin = await requireAdmin("sellers.view");
  const { id } = await params;
  const seller = await db.sellerProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, status: true, createdAt: true, lastLoginAt: true } },
      documents: { orderBy: { createdAt: "desc" }, include: { media: { select: { mime: true, originalName: true } } } },
      products: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true, issue: true, status: true, price: true, stock: true } },
      orderItems: { orderBy: { createdAt: "desc" }, take: 10, include: { order: { select: { id: true, number: true, placedAt: true } } } },
      payouts: { orderBy: { createdAt: "desc" }, take: 10 },
      disputes: { orderBy: { createdAt: "desc" }, take: 5, include: { order: { select: { number: true } } } },
      violations: { orderBy: { createdAt: "desc" }, take: 5 },
      approvedBy: { select: { name: true } },
      _count: { select: { products: true, orderItems: true, reviews: true } },
    },
  });
  if (!seller) notFound();
  const [balance, settings, ledger] = await Promise.all([sellerBalance(seller.id), getSettings(), db.ledgerEntry.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 10 })]);
  const manage = can(admin, "sellers.manage");
  const commission = seller.commissionBps ?? settings["commerce.commissionBps"];

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Sellers", href: "/admin/sellers" }, { label: seller.displayName }]}
        title={seller.displayName}
        lead={
          <>
            Owner{" "}
            <Link href={`/admin/users/${seller.user.id}`} className="font-medium text-brand-700 hover:underline">
              {seller.user.name}
            </Link>{" "}
            ({seller.user.email}) · {seller.countryCode} · applied {formatDateTime(seller.createdAt, { dateOnly: true })} ·{" "}
            <Link href={`/sellers/${seller.slug}`} className="text-brand-700 hover:underline">
              storefront ↗
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={seller.status} />
            <StatusBadge status={seller.verificationStatus} label={`Verification: ${statusLabel(seller.verificationStatus)}`} />
          </>
        }
      />
      {seller.statusReason && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">Status note: {seller.statusReason}</p>}
      {seller.applicationNote && <p className="mb-4 rounded-lg bg-ink-100 px-4 py-2.5 text-[13px] text-ink-800">Application note: “{seller.applicationNote}”</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          {manage && (
            <Card title="Decision">
              <div className="flex flex-wrap gap-2">
                {seller.status !== "approved" && <ConfirmButton label={seller.status === "suspended" ? "Reinstate seller" : "Approve seller"} message="The seller gets dashboard access and can publish listings. They'll be emailed." action={reviewSellerAction.bind(null, seller.id, seller.status === "suspended" ? "reactivate" : "approve")} variant="primary" />}
                {seller.status === "pending" && <ConfirmButton label="Reject" message="Reject this application. The reason is emailed to the applicant." action={reviewSellerAction.bind(null, seller.id, "reject")} withReason variant="danger" />}
                {seller.status === "approved" && <ConfirmButton label="Suspend" message="Suspend the seller and hide all their listings. Existing orders continue." action={reviewSellerAction.bind(null, seller.id, "suspend")} withReason variant="danger" />}
              </div>
            </Card>
          )}

          <Card title="Verification documents" description="Private files — only visible to admins with seller access.">
            {seller.documents.length === 0 ? (
              <EmptyState title="No documents uploaded" />
            ) : (
              <ul className="divide-y divide-ink-100 text-[13px]">
                {seller.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <a href={mediaUrl(d.mediaId)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                        {statusLabel(d.type)}
                      </a>{" "}
                      <span className="text-ink-500">
                        · {d.media.originalName} · {formatDateTime(d.createdAt, { dateOnly: true })}
                      </span>
                      {d.note && <span className="block text-ink-600">Note: {d.note}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={d.status} />
                      {manage && d.status === "pending" && (
                        <>
                          <ConfirmButton label="Accept" message="Mark this document as accepted?" action={reviewDocumentAction.bind(null, d.id, "accepted")} size="sm" />
                          <ConfirmButton label="Reject" message="Reject this document and tell the seller why." action={reviewDocumentAction.bind(null, d.id, "rejected")} withReason size="sm" variant="danger" />
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {manage && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
                {seller.verificationStatus !== "verified" && <ConfirmButton label="Mark verified" message="Confirms identity/business verification and unlocks payouts." action={setVerificationAction.bind(null, seller.id, "verified")} variant="primary" />}
                {seller.verificationStatus !== "rejected" && <ConfirmButton label="Request changes" message="Send the seller a note about what to fix." action={setVerificationAction.bind(null, seller.id, "rejected")} withReason reasonLabel="What needs fixing" variant="outline" />}
                {seller.verificationStatus === "verified" && <ConfirmButton label="Revoke verification" message="Set verification back to pending; payouts pause." action={setVerificationAction.bind(null, seller.id, "pending")} withReason variant="danger" />}
              </div>
            )}
            {seller.verificationNote && <p className="mt-3 text-[13px] text-ink-600">Last note to seller: {seller.verificationNote}</p>}
          </Card>

          <Card title="Listings" actions={<Link href={`/admin/products?seller=${seller.id}`} className="text-[13px] font-semibold text-brand-700">All {seller._count.products} →</Link>}>
            {seller.products.length === 0 ? (
              <EmptyState title="No listings yet" />
            ) : (
              <ul className="divide-y divide-ink-100 text-[13px]">
                {seller.products.map((pr) => (
                  <li key={pr.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/admin/products/${pr.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                      {pr.title} {pr.issue}
                    </Link>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={pr.status} />
                      <span className="tabular-nums">{formatMoney(pr.price)}</span>
                      <span className="text-ink-500">× {pr.stock}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent sales" actions={<span className="text-[13px] text-ink-500">{seller._count.orderItems} items sold</span>}>
            {seller.orderItems.length === 0 ? (
              <EmptyState title="No sales yet" />
            ) : (
              <ul className="divide-y divide-ink-100 text-[13px]">
                {seller.orderItems.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/admin/orders/${i.order.id}`} className="font-mono font-semibold text-ink-950 hover:text-brand-700">
                        {i.order.number}
                      </Link>{" "}
                      {i.title} × {i.qty}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={i.status} />
                      <span className="tabular-nums">{formatMoney(i.sellerNet)} net</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Disputes">
              {seller.disputes.length === 0 ? (
                <p className="text-[13px] text-ink-500">None</p>
              ) : (
                <ul className="divide-y divide-ink-100 text-[13px]">
                  {seller.disputes.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/admin/disputes/${d.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {d.order.number} · {statusLabel(d.reason)}
                      </Link>
                      <StatusBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Violations">
              {seller.violations.length === 0 ? (
                <p className="text-[13px] text-ink-500">None</p>
              ) : (
                <ul className="divide-y divide-ink-100 text-[13px]">
                  {seller.violations.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {statusLabel(v.type)} · {v.severity} · {statusLabel(v.actionTaken)}
                      </span>
                      <StatusBadge status={v.status} />
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/admin/moderation/violations?seller=${seller.id}`} className="mt-2 inline-block text-[13px] font-semibold text-brand-700">
                Issue or review violations →
              </Link>
            </Card>
          </div>
        </div>

        <div className="grid gap-6">
          <Card title="Balance">
            <Kv items={[{ label: "Available", value: formatMoney(balance.available) }, { label: "Pending", value: formatMoney(balance.pending) }, { label: "In payouts", value: formatMoney(balance.inPayout) }, { label: "Paid out", value: formatMoney(balance.paidOut) }, { label: "Payout method", value: seller.payoutDetailsMasked ?? seller.payoutMethod ?? "none" }, { label: "Schedule", value: seller.payoutSchedule ?? `default (${settings["payouts.schedule"]})` }]} />
            {can(admin, "payouts.manage") && balance.available > 0 && (
              <div className="mt-3">
                <ConfirmButton label={`Create payout of ${formatMoney(balance.available)}`} message="Moves the cleared balance into a pending payout for finance to send." action={createPayoutNowAction.bind(null, seller.id)} withReason reasonLabel="Note (optional)" size="sm" />
              </div>
            )}
            <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Recent ledger</p>
            <ul className="mt-1 grid gap-1 text-[12px] text-ink-700">
              {ledger.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="truncate">{e.description}</span>
                  <span className={`tabular-nums ${e.amount < 0 ? "text-rose-700" : ""}`}>{formatMoney(e.amount)}</span>
                </li>
              ))}
              {ledger.length === 0 && <li className="text-ink-500">No activity</li>}
            </ul>
            <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Payouts</p>
            <ul className="mt-1 grid gap-1 text-[12px] text-ink-700">
              {seller.payouts.map((po) => (
                <li key={po.id} className="flex justify-between gap-2">
                  <Link href={`/admin/finance/payouts/${po.id}`} className="hover:text-brand-700">
                    {formatDateTime(po.createdAt, { dateOnly: true })} · {statusLabel(po.status)}
                  </Link>
                  <span className="tabular-nums">{formatMoney(po.amount)}</span>
                </li>
              ))}
              {seller.payouts.length === 0 && <li className="text-ink-500">None yet</li>}
            </ul>
          </Card>

          <Card title="Performance">
            <Kv items={[{ label: "Sales", value: seller.salesCount }, { label: "Rating", value: seller.ratingCount ? `${seller.ratingAvg.toFixed(1)} / 5 (${seller.ratingCount})` : "—" }, { label: "Reviews", value: seller._count.reviews }, { label: "Handling", value: `${seller.handlingDays} day${seller.handlingDays === 1 ? "" : "s"}` }, { label: "Commission", value: `${bpsToPercent(commission)}${seller.commissionBps !== null ? " (override)" : ""}` }, { label: "Approved", value: seller.approvedAt ? `${formatDateTime(seller.approvedAt, { dateOnly: true })} by ${seller.approvedBy?.name ?? "—"}` : "—" }, { label: "Business", value: `${seller.businessType}${seller.businessName ? ` · ${seller.businessName}` : ""}${seller.taxIdLast4 ? ` · tax id ••••${seller.taxIdLast4}` : ""}` }]} />
          </Card>

          {manage && (
            <Card title="Seller settings" description="Overrides for this seller only.">
              <ActionForm action={updateSellerSettingsAction} hidden={{ id: seller.id }} submitLabel="Save settings" variant="outline">
                <Field label="Store name">
                  <input name="displayName" defaultValue={seller.displayName} className={adminInput} required />
                </Field>
                <Field label="Commission override (basis points)" hint={`Blank = marketplace default (${bpsToPercent(settings["commerce.commissionBps"])}). 1000 = 10%.`}>
                  <input name="commissionBps" type="number" min={0} max={10000} defaultValue={seller.commissionBps ?? ""} className={adminInput} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Handling days">
                    <input name="handlingDays" type="number" min={1} max={14} defaultValue={seller.handlingDays} className={adminInput} />
                  </Field>
                  <Field label="Max active listings">
                    <input name="maxActiveListings" type="number" min={0} defaultValue={seller.maxActiveListings ?? ""} className={adminInput} placeholder="default" />
                  </Field>
                  <Field label="Payout schedule">
                    <select name="payoutSchedule" defaultValue={seller.payoutSchedule ?? ""} className={adminSelect}>
                      <option value="">Default</option>
                      <option value="manual">Manual</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                  <Field label="Min payout (cents)">
                    <input name="minPayout" type="number" min={0} defaultValue={seller.minPayout ?? ""} className={adminInput} placeholder="default" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="canList" defaultChecked={seller.canList} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Can create listings
                </label>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="requiresListingReview" defaultChecked={seller.requiresListingReview} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Every listing needs moderator review
                </label>
                <Field label="Internal status note">
                  <input name="statusReason" defaultValue={seller.statusReason ?? ""} className={adminInput} />
                </Field>
                {seller.status === "pending" && <Tone tone="warning">Pending application</Tone>}
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
