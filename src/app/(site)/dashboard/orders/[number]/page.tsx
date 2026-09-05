import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseThread } from "@/components/account/case-thread";
import { DescriptionList, PageHeader, Panel } from "@/components/account/ui";
import { SellerRefundForm } from "@/components/seller/seller-refund-form";
import { ShipForm } from "@/components/seller/ship-form";
import { ShipmentStatusButtons } from "@/components/seller/shipment-status-buttons";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { formatAddress } from "@/lib/commerce/pricing";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { countryLabel, countryNames, isInternational } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { caseMessages, orderAddress } from "@/lib/orders/queries";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Order", description: "Fulfil an order.", path: "/dashboard/orders", noIndex: true });

export default async function SellerOrderPage({ params }: PageProps<"/dashboard/orders/[number]">) {
  const { number } = await params;
  const user = await requireSeller({ next: `/dashboard/orders/${number}` });
  const sellerId = user.seller.id;
  const order = await db.order.findFirst({
    where: { number, items: { some: { sellerId } } },
    include: {
      items: { where: { sellerId }, include: { shipment: { include: { carrier: true, events: { orderBy: { occurredAt: "desc" }, take: 5 } } } } },
      user: { select: { name: true } },
      disputes: { where: { sellerId }, orderBy: { createdAt: "desc" } },
      returns: { where: { orderItem: { sellerId } }, orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!order) notFound();
  const [carriers, seller, names] = await Promise.all([db.carrier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), db.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, select: { handlingDays: true, shipsFromCountry: true, countryCode: true } }), countryNames()]);
  const shipsFrom = seller.shipsFromCountry ?? seller.countryCode;
  const crossBorder = isInternational(shipsFrom, order.countryCode);
  const declaredValue = order.items.reduce((n, i) => n + i.subtotal - i.discountAmount, 0);
  const shipping = orderAddress(order.shippingAddressJson);
  const unshipped = order.items.filter((i) => i.kind === "comic" && !i.shipmentId && ["paid", "processing"].includes(i.status));
  const shipments = [...new Map(order.items.filter((i) => i.shipment).map((i) => [i.shipment!.id, i.shipment!])).values()];
  const paid = ["paid", "partially_refunded"].includes(order.paymentStatus);
  const threads = await Promise.all([
    ...order.disputes.map(async (d) => ({ kind: "dispute" as const, id: d.id, title: `Dispute — ${statusLabel(d.reason)}`, status: d.status, messages: await caseMessages("dispute", d.id, { includeInternal: false }) })),
    ...order.returns.map(async (r) => ({ kind: "return" as const, id: r.id, title: `Return — ${statusLabel(r.reason)}`, status: r.status, messages: await caseMessages("return", r.id, { includeInternal: false }) })),
  ]);
  const maskedEmail = order.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2");

  return (
    <div className="grid gap-8">
      <PageHeader title={`Order ${order.number}`} lead={`Placed ${formatDateTime(order.placedAt, { timeZone: user.timezone })} · ${statusLabel(order.status)} · handling time ${seller.handlingDays} business day${seller.handlingDays === 1 ? "" : "s"}`} actions={<Badge tone={paid ? "brand" : "neutral"}>{statusLabel(order.paymentStatus)}</Badge>} />
      {!paid && <p className="rounded-lg bg-gold-400/15 px-4 py-3 text-sm text-gold-800">Don&apos;t ship yet — payment hasn&apos;t cleared.</p>}
      {paid && crossBorder && (
        <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-800">
          <p className="font-semibold">International shipment — {countryLabel(names, shipsFrom)} → {countryLabel(names, order.countryCode)}</p>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-ink-700">
            <li>Attach a customs declaration (CN22/CN23 or a commercial invoice) describing the books with a declared value of {formatMoney(declaredValue)}.</li>
            <li>Use a tracked, insured service and enter the tracking number below — untracked international parcels cannot be defended in a dispute.</li>
            <li>Duties and import taxes are paid by the buyer on delivery unless your listing says otherwise.</li>
          </ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Your items" className="lg:col-span-2">
          <ul className="divide-y divide-ink-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink-950">
                    {i.title} × {i.qty}
                  </p>
                  <p className="text-[13px] text-ink-600">
                    {i.subtitle} · SKU {i.sku ?? "—"}
                  </p>
                  <p className="text-[13px] text-ink-600">
                    Sold {formatMoney(i.subtotal - i.discountAmount)} · commission {formatMoney(i.commissionAmount)} · <strong>net {formatMoney(i.sellerNet)}</strong>
                  </p>
                </div>
                <Badge tone={i.status === "paid" ? "gold" : i.status === "delivered" ? "brand" : "neutral"}>{statusLabel(i.status)}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Ship to">
          <p className="whitespace-pre-line text-sm text-ink-800">{formatAddress(shipping).join("\n")}</p>
          <DescriptionList items={[{ label: "Buyer", value: order.user?.name ?? shipping?.firstName ?? "Guest" }, { label: "Email", value: maskedEmail }, { label: "Phone", value: order.phone ?? shipping?.phone ?? "—" }, { label: "Method", value: order.shippingMethodName ?? "—" }]} />
          {order.customerNote && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[13px] text-ink-700">Buyer note: {order.customerNote}</p>}
        </Panel>
      </div>

      {paid && unshipped.length > 0 && (
        <Panel title="Create shipment" description="Tracking numbers turn into live links for the buyer using the carrier's template.">
          <ShipForm orderId={order.id} items={unshipped.map((i) => ({ id: i.id, title: i.title, qty: i.qty }))} carriers={carriers.map((c) => ({ id: c.id, name: c.name }))} />
        </Panel>
      )}

      {shipments.length > 0 && (
        <Panel title="Shipments">
          <ul className="grid gap-3">
            {shipments.map((s) => (
              <li key={s.id} className="rounded-lg border border-ink-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-950">
                    {s.carrier?.name ?? s.carrierName ?? "Carrier"} · {statusLabel(s.status)}
                    {s.trackingNumber && <span className="ml-2 font-mono text-ink-600">{s.trackingNumber}</span>}
                  </span>
                  <ShipmentStatusButtons shipmentId={s.id} status={s.status} />
                </div>
                {s.events.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-[13px] text-ink-600">
                    {s.events.map((e) => (
                      <li key={e.id}>
                        {formatDateTime(e.occurredAt, { timeZone: user.timezone })} — {statusLabel(e.status)}
                        {e.message ? `: ${e.message}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {paid && (
        <Panel title="Refund an item" description="Refunds go back to the buyer's original payment method and reverse your commission proportionally.">
          <SellerRefundForm orderId={order.id} items={order.items.filter((i) => i.qty - i.refundedQty > 0 && !["cancelled"].includes(i.status)).map((i) => ({ id: i.id, title: i.title, remaining: i.qty - i.refundedQty, perUnit: Math.round((i.subtotal - i.discountAmount) / i.qty) }))} />
        </Panel>
      )}

      {threads.map((t) => (
        <Panel key={t.id} title={t.title} description={<>Status: <strong>{statusLabel(t.status)}</strong></>}>
          <CaseThread caseType={t.kind} caseId={t.id} closed={["resolved", "closed", "refunded", "rejected"].includes(t.status)} messages={t.messages.map((m) => ({ id: m.id, authorRole: m.authorRole, authorName: m.author?.name ?? (m.authorRole === "admin" ? "Marketplace" : "System"), body: m.body, createdAt: m.createdAt.toISOString(), attachments: JSON.parse(m.attachmentsJson) as string[] }))} />
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
