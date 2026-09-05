import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActionsPanel } from "@/components/account/order-actions-panel";
import { CaseThread } from "@/components/account/case-thread";
import { BankDetails } from "@/components/bank-details";
import { DescriptionList, PageHeader, Panel } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatAddress } from "@/lib/commerce/pricing";
import { statusLabel, statusTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { DEFAULT_CUSTOMS_NOTE, countryLabel, countryNames, deliveryWindow, isInternational } from "@/lib/geo";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { bankTransferDetails } from "@/lib/payments/bank-details";
import { caseMessages, getOrderForUser, orderAddress } from "@/lib/orders/queries";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "Order details", description: "Order status, tracking and support options.", path: "/account/orders", noIndex: true });

const tone = (s: string) => {
  const t = statusTone(s);
  return t === "danger" ? "sale" : t === "success" ? "brand" : t === "warning" ? "gold" : "neutral";
};

export default async function OrderDetailPage({ params }: PageProps<"/account/orders/[number]">) {
  const { number } = await params;
  const user = await requireUser({ next: `/account/orders/${number}` });
  const order = await getOrderForUser(number, user.id);
  if (!order) notFound();
  const [settings, names, method] = await Promise.all([getSettings(), countryNames(), order.shippingMethodId ? db.shippingMethod.findUnique({ where: { id: order.shippingMethodId }, select: { estimatedDaysMin: true, estimatedDaysMax: true } }) : Promise.resolve(null)]);
  const shipping = orderAddress(order.shippingAddressJson);
  const crossBorder = order.items.filter((i) => isInternational(i.seller?.shipsFromCountry ?? i.seller?.countryCode, order.countryCode));
  const handling = Math.max(0, ...order.items.map((i) => i.seller?.handlingDays ?? 1));
  const paidBase = order.paidAt ?? (order.paymentStatus === "paid" ? order.placedAt : null);
  const eta = paidBase && method && !["cancelled", "failed", "refunded", "completed", "delivered"].includes(order.status) ? deliveryWindow(paidBase, handling, method.estimatedDaysMin, method.estimatedDaysMax) : null;
  const billing = orderAddress(order.billingAddressJson);
  const payment = order.payments[0];
  const openReturns = order.returns.filter((r) => !["closed", "refunded", "rejected"].includes(r.status));
  const openDispute = order.disputes.find((d) => !["resolved", "closed"].includes(d.status));
  const threads = await Promise.all([
    ...order.disputes.map(async (d) => ({ kind: "dispute" as const, id: d.id, title: `Dispute — ${statusLabel(d.reason)}`, status: d.status, decision: d.decision, messages: await caseMessages("dispute", d.id, { includeInternal: false }) })),
    ...order.returns.map(async (r) => ({ kind: "return" as const, id: r.id, title: `Return — ${statusLabel(r.reason)} (qty ${r.qty})`, status: r.status, decision: r.adminNote, messages: await caseMessages("return", r.id, { includeInternal: false }) })),
  ]);
  const deliveredAt = order.shipments.map((s) => s.deliveredAt).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const returnWindowOpen = deliveredAt ? new Date().getTime() - deliveredAt.getTime() <= settings["commerce.returnWindowDays"] * 86_400_000 : false;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Order ${order.number}`}
        lead={`Placed ${formatDateTime(order.placedAt, { timeZone: user.timezone })} · ${formatMoney(order.presentmentTotal, order.currency)}`}
        actions={
          <>
            <Badge tone={tone(order.status)}>{statusLabel(order.status)}</Badge>
            {order.paymentStatus === "paid" && (
              <ButtonLink href={`/account/orders/${order.number}/invoice`} size="sm" variant="outline">
                Invoice
              </ButtonLink>
            )}
          </>
        }
      />

      {order.status === "pending_payment" && payment?.provider === "bank_transfer" && (
        <Panel tone="muted" title="Awaiting your bank transfer" description="Wire the order total using these details. The reservation is released if the funds don't arrive in time.">
          <BankDetails {...(({ lines, note }) => ({ lines, note }))(bankTransferDetails(settings, order.number))} compact />
          <p className="mt-3 text-[13px] text-ink-600">Reservation expires {settings["commerce.autoCancelUnpaidHours"]} hours after the order was placed ({formatDateTime(new Date(order.placedAt.getTime() + settings["commerce.autoCancelUnpaidHours"] * 3_600_000), { timeZone: user.timezone })}).</p>
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Items" className="lg:col-span-2">
          <ul className="divide-y divide-ink-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-4">
                {i.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imageUrl} alt="" className="h-20 w-14 shrink-0 rounded-md object-cover ring-1 ring-ink-200" />
                ) : (
                  <span className="h-20 w-14 shrink-0 rounded-md bg-ink-100" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-950">
                    <Link href={`/store/${i.slug}`} className="hover:text-brand-700">
                      {i.title}
                    </Link>
                  </p>
                  <p className="text-[13px] text-ink-600">{i.subtitle}</p>
                  <p className="mt-1 text-[13px] text-ink-600">
                    Qty {i.qty} · {formatMoney(i.unitPrice)} each
                    {i.seller && (
                      <>
                        {" "}
                        · Sold by{" "}
                        <Link href={`/sellers/${i.seller.slug}`} className="text-brand-700 hover:underline">
                          {i.seller.displayName}
                        </Link>
                        {(i.seller.shipsFromCountry ?? i.seller.countryCode) && <> · Ships from {countryLabel(names, i.seller.shipsFromCountry ?? i.seller.countryCode)}</>}
                      </>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={tone(i.status)}>{statusLabel(i.status)}</Badge>
                    {i.refundedQty > 0 && <Badge tone="neutral">{i.refundedQty} refunded</Badge>}
                    {order.reviews.some((r) => r.orderItemId === i.id) && <Badge tone="brand">Reviewed</Badge>}
                  </div>
                </div>
                <p className="font-semibold tabular-nums text-ink-950">{formatMoney(i.subtotal - i.discountAmount)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 grid gap-2 border-t border-ink-200 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
            {order.discountTotal > 0 && <div className="flex justify-between"><dt className="text-ink-600">Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd className="tabular-nums">− {formatMoney(order.discountTotal)}</dd></div>}
            <div className="flex justify-between"><dt className="text-ink-600">Shipping ({order.shippingMethodName ?? "n/a"})</dt><dd className="tabular-nums">{order.shippingTotal === 0 ? "Free" : formatMoney(order.shippingTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-600">Tax</dt><dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd></div>
            {order.currency !== "USD" && <div className="flex justify-between text-[13px] text-ink-500"><dt>Exchange rate at checkout</dt><dd className="tabular-nums">1 USD = {order.exchangeRate.toFixed(4)} {order.currency}</dd></div>}
            <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.total)}{order.currency !== "USD" && <span className="ml-1 text-ink-500">({formatMoney(order.presentmentTotal, order.currency)})</span>}</dd></div>
          </dl>
        </Panel>

        <div className="grid gap-6">
          <Panel title="Shipping to">
            <p className="whitespace-pre-line text-sm text-ink-800">{formatAddress(shipping).join("\n")}</p>
            {order.phone && <p className="mt-2 text-[13px] text-ink-600">{order.phone}</p>}
            {eta && (
              <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">
                Estimated delivery {formatDateTime(eta.from, { dateOnly: true, timeZone: user.timezone })} – {formatDateTime(eta.to, { dateOnly: true, timeZone: user.timezone })}
                <span className="block text-[12px] text-ink-500">{order.shippingMethodName ?? "Shipping"} · {handling} handling + {method?.estimatedDaysMin}–{method?.estimatedDaysMax} transit days</span>
              </p>
            )}
          </Panel>
          {crossBorder.length > 0 && (
            <Panel title="International delivery" tone="muted">
              <p className="text-[13px] leading-relaxed text-ink-700">{crossBorder.find((i) => i.seller?.customsNote)?.seller?.customsNote ?? DEFAULT_CUSTOMS_NOTE}</p>
              <ul className="mt-2 grid gap-1 text-[13px] text-ink-600">
                {crossBorder.map((i) => (
                  <li key={i.id}>
                    {i.title}: from {countryLabel(names, i.seller?.shipsFromCountry ?? i.seller?.countryCode)} to {countryLabel(names, order.countryCode)}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Payment">
            <DescriptionList
              items={[
                { label: "Method", value: payment ? (payment.provider === "stripe" ? `Card${payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ""}` : payment.provider === "paypal" ? "PayPal" : payment.provider === "bank_transfer" ? "Bank transfer" : "Test") : "—" },
                { label: "Status", value: statusLabel(order.paymentStatus) },
                ...(payment?.refundedAmount ? [{ label: "Refunded", value: formatMoney(payment.refundedAmount) }] : []),
              ]}
            />
            {billing && <p className="mt-3 whitespace-pre-line text-[13px] text-ink-600">Billing: {formatAddress(billing).join(", ")}</p>}
          </Panel>
        </div>
      </div>

      {order.shipments.length > 0 && (
        <Panel title="Shipments">
          <ul className="grid gap-3">
            {order.shipments.map((s) => (
              <li key={s.id} className="rounded-lg border border-ink-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-950">
                    {s.carrier?.name ?? s.carrierName ?? "Carrier"} · {statusLabel(s.status)}
                  </span>
                  {s.trackingNumber &&
                    (s.trackingUrl ? (
                      <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-brand-700 underline-offset-2 hover:underline">
                        {s.trackingNumber}
                      </a>
                    ) : (
                      <span className="font-mono">{s.trackingNumber}</span>
                    ))}
                </div>
                <p className="mt-1 text-[13px] text-ink-600">{s.items.map((i) => `${i.title} × ${i.qty}`).join(", ")}</p>
                {s.events.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-[13px] text-ink-600">
                    {s.events.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        {formatDateTime(e.occurredAt, { timeZone: user.timezone })} — {statusLabel(e.status)}
                        {e.message ? `: ${e.message}` : ""}
                        {e.location ? ` (${e.location})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <OrderActionsPanel
        order={{ id: order.id, number: order.number, status: order.status, paymentStatus: order.paymentStatus }}
        items={order.items.map((i) => ({ id: i.id, title: i.title, qty: i.qty, refundedQty: i.refundedQty, status: i.status, productId: i.productId, reviewed: order.reviews.some((r) => r.orderItemId === i.id), returnOpen: openReturns.some((r) => r.orderItemId === i.id) }))}
        returnWindowOpen={returnWindowOpen}
        returnWindowDays={settings["commerce.returnWindowDays"]}
        disputeOpen={Boolean(openDispute)}
        disputesEnabled={settings["features.disputes"]}
        reviewsEnabled={settings["features.reviews"] && settings["buyers.allowReviews"]}
      />

      {threads.map((t) => (
        <Panel key={t.id} title={t.title} description={<>Status: <strong>{statusLabel(t.status)}</strong>{t.decision ? ` — ${t.decision}` : ""}</>}>
          <CaseThread caseType={t.kind} caseId={t.id} messages={t.messages.map((m) => ({ id: m.id, authorRole: m.authorRole, authorName: m.author?.name ?? (m.authorRole === "admin" ? "Support" : "System"), body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))} closed={["resolved", "closed", "refunded", "rejected"].includes(t.status)} />
        </Panel>
      ))}

      <Panel title="Timeline">
        <ol className="grid gap-2 text-sm">
          {order.events.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink-800">{e.message}</span>
              <span className="text-ink-500">{formatDateTime(e.createdAt, { timeZone: user.timezone })}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
