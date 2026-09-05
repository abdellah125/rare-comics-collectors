import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { OrderAddressForm } from "@/components/admin/address-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { RefundForm } from "@/components/admin/refund-form";
import { AdminPageHeader, Card, EmptyState, Field, Kv, StatusBadge, Tone, adminInput, adminTextarea } from "@/components/admin/ui";
import { CaseThread } from "@/components/account/case-thread";
import { ShipForm } from "@/components/seller/ship-form";
import { ShipmentStatusButtons } from "@/components/seller/shipment-status-buttons";
import { requireAdmin, can } from "@/lib/auth/session";
import { addOrderNoteAction, adminShipAction, adminShipmentStatusAction, cancelOrderAdminAction, completeManualRefundAction, markPaidManuallyAction, resendConfirmationAction, setOrderStatusAction, setRiskAction } from "@/lib/admin/actions/orders";
import { adminCaseMessageAction } from "@/lib/admin/actions/cases";
import { db } from "@/lib/db";
import { formatAddress } from "@/lib/commerce/pricing";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { parseJsonArray, isString } from "@/lib/json";
import { formatMoney } from "@/lib/money";
import { caseMessages, getOrderById, orderAddress } from "@/lib/orders/queries";
import { bankTransferDetails } from "@/lib/payments/bank-details";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const admin = await requireAdmin("orders.view");
  const { id } = await params;
  const order = await getOrderById(id);
  if (!order) notFound();
  const [carriers, countries, chargebacks, tickets] = await Promise.all([
    db.carrier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.country.findMany({ where: { isEnabled: true }, orderBy: { name: "asc" }, select: { code: true, name: true } }),
    db.chargeback.findMany({ where: { orderId: id }, orderBy: { createdAt: "desc" } }),
    db.ticket.findMany({ where: { orderId: id }, select: { id: true, number: true, subject: true, status: true } }),
  ]);
  const threads = await Promise.all([
    ...order.disputes.map(async (d) => ({ kind: "dispute" as const, id: d.id, title: `Dispute — ${statusLabel(d.reason)}`, status: d.status, messages: await caseMessages("dispute", d.id, { includeInternal: true }) })),
    ...order.returns.map(async (r) => ({ kind: "return" as const, id: r.id, title: `Return — ${statusLabel(r.reason)} (qty ${r.qty})`, status: r.status, messages: await caseMessages("return", r.id, { includeInternal: true }) })),
  ]);
  const wire = order.payments.some((p) => p.provider === "bank_transfer") ? bankTransferDetails(await getSettings(), order.number) : null;
  const manage = can(admin, "orders.manage");
  const canRefund = can(admin, "orders.refund");
  const finance = can(admin, "finance.manage");
  const shipping = orderAddress(order.shippingAddressJson);
  const billing = orderAddress(order.billingAddressJson);
  const payment = order.payments.find((p) => ["succeeded", "partially_refunded", "refunded"].includes(p.status)) ?? order.payments[0];
  const remaining = payment && ["succeeded", "partially_refunded"].includes(payment.status) ? payment.amount - payment.refundedAmount : 0;
  const unshipped = order.items.filter((i) => i.kind === "comic" && !i.shipmentId && ["paid", "processing"].includes(i.status));
  const riskFlags = parseJsonArray(order.riskFlagsJson, isString);
  const paid = ["paid", "partially_refunded"].includes(order.paymentStatus);

  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Orders", href: "/admin/orders" }, { label: order.number }]}
        title={`Order ${order.number}`}
        lead={`Placed ${formatDateTime(order.placedAt)} · ${formatMoney(order.total)}${order.currency !== "USD" ? ` (${formatMoney(order.presentmentTotal, order.currency)} charged)` : ""} · via ${payment?.provider ?? "—"}`}
        actions={
          <>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} label={`Payment: ${statusLabel(order.paymentStatus)}`} />
            <StatusBadge status={order.fulfillmentStatus} label={`Fulfilment: ${statusLabel(order.fulfillmentStatus)}`} />
            {order.riskScore >= 40 && <Tone tone={order.riskScore >= 70 ? "danger" : "warning"}>Risk {order.riskScore}</Tone>}
          </>
        }
      />
      {riskFlags.length > 0 && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">Risk flags: {riskFlags.map((f) => f.replace(/_/g, " ")).join(", ")} · IP {order.ipAddress ?? "?"}</p>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          <Card title="Items">
            <ul className="divide-y divide-ink-100">
              {order.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
                  <div className="flex items-center gap-3">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.imageUrl} alt="" className="h-14 w-10 rounded object-cover ring-1 ring-ink-200" />
                    ) : (
                      <span className="h-14 w-10 rounded bg-ink-100" />
                    )}
                    <div>
                      <p className="font-semibold text-ink-950">
                        {i.productId ? (
                          <Link href={`/admin/products/${i.productId}`} className="hover:text-brand-700">
                            {i.title}
                          </Link>
                        ) : (
                          i.title
                        )}{" "}
                        × {i.qty}
                      </p>
                      <p className="text-ink-600">
                        {i.subtitle} · SKU {i.sku ?? "—"} · {i.seller ? <Link href={`/admin/sellers/${i.seller.id}`} className="text-brand-700">{i.seller.displayName}</Link> : "House"} · commission {formatMoney(i.commissionAmount)} · seller net {formatMoney(i.sellerNet)}
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={i.status} />
                    {i.refundedQty > 0 && <Tone tone="neutral">{i.refundedQty} refunded</Tone>}
                    <span className="tabular-nums font-semibold">{formatMoney(i.subtotal - i.discountAmount)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-3 grid max-w-xs gap-1 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
              {order.discountTotal > 0 && <div className="flex justify-between"><dt className="text-ink-600">Discount {order.couponCode ? `(${order.couponCode})` : ""}</dt><dd className="tabular-nums">− {formatMoney(order.discountTotal)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-600">Shipping ({order.shippingMethodName ?? "—"})</dt><dd className="tabular-nums">{formatMoney(order.shippingTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-600">Tax</dt><dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.total)}</dd></div>
            </dl>
          </Card>

          {manage && paid && unshipped.length > 0 && (
            <Card title="Ship items" description="Marketplace staff can ship on behalf of any seller (for example house inventory).">
              <ShipForm orderId={order.id} items={unshipped.map((i) => ({ id: i.id, title: i.title, qty: i.qty }))} carriers={carriers} action={adminShipAction} />
            </Card>
          )}

          {order.shipments.length > 0 && (
            <Card title="Shipments">
              <ul className="grid gap-3">
                {order.shipments.map((s) => (
                  <li key={s.id} className="rounded-lg border border-ink-200 p-3 text-[13px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink-950">
                        {s.carrier?.name ?? s.carrierName ?? "Carrier"} · {statusLabel(s.status)}
                        {s.trackingNumber && (s.trackingUrl ? <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-mono text-brand-700 underline">{s.trackingNumber}</a> : <span className="ml-2 font-mono text-ink-600">{s.trackingNumber}</span>)}
                      </span>
                      {manage && <ShipmentStatusButtons shipmentId={s.id} status={s.status} action={adminShipmentStatusAction} />}
                    </div>
                    <p className="mt-1 text-ink-600">{s.items.map((i) => `${i.title} × ${i.qty}`).join(", ")}</p>
                    <ul className="mt-1 grid gap-0.5 text-[12px] text-ink-500">
                      {s.events.map((e) => (
                        <li key={e.id}>
                          {formatDateTime(e.occurredAt)} — {statusLabel(e.status)}
                          {e.message ? `: ${e.message}` : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Payments & refunds">
            {order.payments.length === 0 ? (
              <EmptyState title="No payment attempts" />
            ) : (
              <ul className="divide-y divide-ink-100 text-[13px]">
                {order.payments.map((pm) => (
                  <li key={pm.id} className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong className="text-ink-950">{pm.provider}</strong> · {pm.method ?? "—"}
                        {pm.cardBrand && ` · ${pm.cardBrand} •••• ${pm.cardLast4}`} · ref <span className="font-mono">{pm.providerRef ?? "—"}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={pm.status} />
                        <span className="tabular-nums">{formatMoney(pm.presentmentAmount, pm.currency)}</span>
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-500">
                      {formatDateTime(pm.createdAt)}
                      {pm.capturedAt ? ` · captured ${formatDateTime(pm.capturedAt)}` : ""}
                      {pm.feeAmount ? ` · provider fee ${formatMoney(pm.feeAmount, pm.currency)}` : ""}
                      {pm.refundedAmount > 0 ? ` · refunded ${formatMoney(pm.refundedAmount)}` : ""}
                      {pm.failureMessage ? ` · ${pm.failureMessage}` : ""}
                    </p>
                    {pm.provider === "bank_transfer" && pm.status !== "succeeded" && wire && (
                      <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-700">
                        <p className="font-semibold text-ink-900">Wire details given to the buyer</p>
                        {wire.lines.length <= 1 ? (
                          <p className="mt-1 text-rose-700">No bank details are configured — buyers only see the payment reference. Add them under Finance › Payment providers › Bank wire.</p>
                        ) : (
                          <ul className="mt-1 grid gap-0.5">
                            {wire.lines.map((l) => (
                              <li key={l.label}>
                                {l.label}: <span className="font-mono">{l.value}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {finance && pm.provider === "bank_transfer" && pm.status !== "succeeded" && order.status !== "cancelled" && (
                      <div className="mt-2">
                        <ConfirmButton label="Mark payment received" message="Confirms the bank transfer arrived. The order becomes paid and sellers are notified." action={markPaidManuallyAction.bind(null, order.id)} withReason reasonLabel="Bank reference" variant="primary" size="sm" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {order.refunds.length > 0 && (
              <>
                <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Refunds</p>
                <ul className="divide-y divide-ink-100 text-[13px]">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {formatDateTime(r.createdAt)} · {statusLabel(r.reason)}
                        {r.note ? ` · ${r.note}` : ""}
                        {r.providerRef ? ` · ref ${r.providerRef}` : ""}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <span className="tabular-nums">{formatMoney(r.amount)}</span>
                        {finance && r.status === "pending" && <ConfirmButton label="Mark completed" message="Confirms the refund transfer was sent." action={completeManualRefundAction.bind(null, r.id)} withReason reasonLabel="Reference" size="sm" />}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {chargebacks.length > 0 && (
              <>
                <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Chargebacks</p>
                <ul className="text-[13px]">
                  {chargebacks.map((c) => (
                    <li key={c.id} className="flex justify-between py-1">
                      <Link href={`/admin/disputes/chargebacks/${c.id}`} className="text-brand-700 hover:underline">
                        {c.reason ?? "Chargeback"} · {formatMoney(c.amount)}
                      </Link>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {canRefund && remaining > 0 && (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <h3 className="mb-2 text-[13px] font-semibold text-ink-950">Issue a refund</h3>
                <RefundForm orderId={order.id} remaining={remaining} items={order.items.map((i) => ({ id: i.id, title: i.title, qty: i.qty, refundedQty: i.refundedQty, unitNet: Math.round((i.subtotal - i.discountAmount) / i.qty) }))} />
              </div>
            )}
          </Card>

          {threads.map((t) => (
            <Card key={t.id} title={t.title} description={<>Status: <strong>{statusLabel(t.status)}</strong> · <Link href={`/admin/${t.kind === "dispute" ? "disputes" : "returns"}/${t.id}`} className="text-brand-700">open case →</Link></>}>
              <CaseThread caseType={t.kind} caseId={t.id} closed={["resolved", "closed", "refunded", "rejected"].includes(t.status)} action={adminCaseMessageAction} allowInternal messages={t.messages.map((m) => ({ id: m.id, authorRole: m.isInternal ? `${m.authorRole} (internal)` : m.authorRole, authorName: m.author?.name ?? "System", body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))} />
            </Card>
          ))}

          <Card title="Timeline">
            <ol className="grid gap-1.5 text-[13px]">
              {order.events.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-800">
                    {e.message} <span className="text-ink-400">· {e.actor?.name ?? e.actorType}</span>
                  </span>
                  <span className="text-ink-500">{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid gap-6">
          {manage && (
            <Card title="Actions">
              <div className="flex flex-wrap gap-2">
                {!["cancelled", "refunded", "completed", "shipped", "partially_shipped", "delivered"].includes(order.status) && <ConfirmButton label="Cancel order" message="Cancels the order and returns stock. Paid orders must then be refunded." action={cancelOrderAdminAction.bind(null, order.id)} withReason variant="danger" size="sm" />}
                {order.status === "paid" && <ConfirmButton label="Mark processing" message="Signals that the order is being prepared." action={setOrderStatusAction.bind(null, order.id, "processing")} size="sm" />}
                {["delivered", "shipped"].includes(order.status) && <ConfirmButton label="Mark completed" message="Closes the order (ends the return window)." action={setOrderStatusAction.bind(null, order.id, "completed")} size="sm" />}
                <ConfirmButton label="Resend confirmation" message={`Send the confirmation email again to ${order.email}?`} action={resendConfirmationAction.bind(null, order.id)} size="sm" />
              </div>
            </Card>
          )}
          <Card title="Customer">
            <Kv items={[{ label: "Name", value: order.user ? <Link href={`/admin/users/${order.user.id}`} className="text-brand-700 hover:underline">{order.user.name}</Link> : "Guest checkout" }, { label: "Email", value: order.email }, { label: "Phone", value: order.phone ?? "—" }, { label: "Country", value: order.countryCode ?? "—" }, { label: "IP", value: order.ipAddress ?? "—" }, { label: "Note", value: order.customerNote ?? "—" }]} />
            {tickets.length > 0 && (
              <p className="mt-3 text-[13px]">
                Tickets:{" "}
                {tickets.map((t) => (
                  <Link key={t.id} href={`/admin/support/${t.id}`} className="mr-2 text-brand-700 hover:underline">
                    {t.number}
                  </Link>
                ))}
              </p>
            )}
          </Card>
          <Card title="Shipping address">
            <p className="whitespace-pre-line text-[13px] text-ink-800">{formatAddress(shipping).join("\n")}</p>
            {manage && order.fulfillmentStatus === "unfulfilled" && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-medium text-brand-700">Edit shipping address</summary>
                <div className="mt-3">
                  <OrderAddressForm orderId={order.id} which="shipping" address={shipping} countries={countries} />
                </div>
              </details>
            )}
          </Card>
          <Card title="Billing address">
            <p className="whitespace-pre-line text-[13px] text-ink-800">{formatAddress(billing).join("\n")}</p>
          </Card>
          <Card title="Internal notes">
            <ul className="grid gap-2 text-[13px]">
              {order.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-ink-50 px-3 py-2">
                  <p className="text-ink-800">{n.body}</p>
                  <p className="text-[11px] text-ink-500">
                    {n.author.name} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
              {order.notes.length === 0 && <li className="text-ink-500">No notes yet.</li>}
            </ul>
            <div className="mt-3">
              <ActionForm action={addOrderNoteAction} hidden={{ orderId: order.id }} submitLabel="Add note" variant="outline" resetOnSuccess>
                <textarea name="body" rows={2} required className={adminTextarea} placeholder="Visible to admins only" />
              </ActionForm>
            </div>
          </Card>
          {manage && (
            <Card title="Risk review">
              <ActionForm action={setRiskAction} hidden={{ orderId: order.id }} submitLabel="Save score" variant="outline">
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <Field label="Score">
                    <input name="riskScore" type="number" min={0} max={100} defaultValue={order.riskScore} className={adminInput} />
                  </Field>
                  <Field label="Note">
                    <input name="note" className={adminInput} placeholder="Verified by phone…" />
                  </Field>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
