import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/print-button";
import { requireUser } from "@/lib/auth/session";
import { formatAddress } from "@/lib/commerce/pricing";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { countryLabel, countryNames } from "@/lib/geo";
import { getOrderForUser, orderAddress } from "@/lib/orders/queries";
import { pageMetadata } from "@/lib/seo";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({ title: "Invoice", description: "Printable invoice.", path: "/account/orders", noIndex: true });

export default async function InvoicePage({ params }: PageProps<"/account/orders/[number]/invoice">) {
  const { number } = await params;
  const user = await requireUser({ next: `/account/orders/${number}/invoice` });
  const order = await getOrderForUser(number, user.id);
  if (!order) notFound();
  const names = await countryNames();
  const shipping = orderAddress(order.shippingAddressJson);
  const billing = orderAddress(order.billingAddressJson);
  const payment = order.payments.find((p) => p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded") ?? order.payments[0];
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-ink-200 bg-white p-8 print:border-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 pb-6">
        <div>
          <p className="font-logo text-lg font-black uppercase tracking-tight text-brand-600">{site.name}</p>
          <p className="mt-1 text-[13px] text-ink-600">{site.legalName}</p>
          <p className="text-[13px] text-ink-600">{fullAddress}</p>
          <p className="text-[13px] text-ink-600">{site.email}</p>
        </div>
        <div className="text-right">
          <h1 className="font-display text-2xl font-semibold text-ink-950">Invoice</h1>
          <p className="font-mono text-sm text-ink-800">{order.number}</p>
          <p className="text-[13px] text-ink-600">{formatDateTime(order.paidAt ?? order.placedAt, { dateOnly: true })}</p>
          <div className="mt-2 print:hidden">
            <PrintButton />
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Bill to</p>
          <p className="mt-1 whitespace-pre-line text-ink-800">{formatAddress(billing ?? shipping).join("\n")}</p>
          <p className="mt-1 text-ink-600">{order.email}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Ship to</p>
          <p className="mt-1 whitespace-pre-line text-ink-800">{formatAddress(shipping).join("\n")}</p>
        </div>
      </div>
      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
            <th className="py-2">Item</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {order.items.map((i) => (
            <tr key={i.id}>
              <td className="py-2">
                {i.title}
                {i.sku && <span className="block text-[12px] text-ink-500">SKU {i.sku}</span>}
                {i.seller && <span className="block text-[12px] text-ink-500">Sold by {i.seller.displayName} · ships from {countryLabel(names, i.seller.shipsFromCountry ?? i.seller.countryCode)}</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{i.qty}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(i.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(i.subtotal - i.discountAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 grid max-w-xs gap-1 text-sm">
        <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd className="tabular-nums">{formatMoney(order.subtotal)}</dd></div>
        {order.discountTotal > 0 && <div className="flex justify-between"><dt className="text-ink-600">Discount</dt><dd className="tabular-nums">− {formatMoney(order.discountTotal)}</dd></div>}
        <div className="flex justify-between"><dt className="text-ink-600">Shipping</dt><dd className="tabular-nums">{formatMoney(order.shippingTotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-600">Tax</dt><dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd></div>
        <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(order.total)}</dd></div>
        {order.currency !== "USD" && <div className="flex justify-between text-ink-600"><dt>Charged</dt><dd className="tabular-nums">{formatMoney(order.presentmentTotal, order.currency)}</dd></div>}
        {order.currency !== "USD" && <div className="flex justify-between text-[12px] text-ink-500"><dt>Rate</dt><dd className="tabular-nums">1 USD = {order.exchangeRate.toFixed(4)} {order.currency}</dd></div>}
        {payment && payment.refundedAmount > 0 && <div className="flex justify-between text-ink-600"><dt>Refunded</dt><dd className="tabular-nums">− {formatMoney(payment.refundedAmount)}</dd></div>}
      </dl>
      <p className="mt-8 text-[12px] text-ink-500">
        Paid via {payment ? (payment.provider === "stripe" ? "card" : payment.provider === "paypal" ? "PayPal" : payment.provider === "bank_transfer" ? "bank transfer" : payment.provider) : "—"}
        {payment?.capturedAt ? ` on ${formatDateTime(payment.capturedAt, { dateOnly: true })}` : ""}. Thank you for your order.
      </p>
    </div>
  );
}
