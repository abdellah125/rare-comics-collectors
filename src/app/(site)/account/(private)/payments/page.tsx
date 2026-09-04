import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel, statusTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Payments & refunds", description: "Every payment and refund on your account.", path: "/account/payments", noIndex: true });

const tone = (s: string) => {
  const t = statusTone(s);
  return t === "danger" ? "sale" : t === "success" ? "brand" : t === "warning" ? "gold" : "neutral";
};

export default async function PaymentsPage() {
  const user = await requireUser({ next: "/account/payments" });
  const [payments, refunds] = await Promise.all([
    db.payment.findMany({ where: { order: { userId: user.id } }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { number: true } } } }),
    db.refund.findMany({ where: { order: { userId: user.id } }, orderBy: { createdAt: "desc" }, take: 100, include: { order: { select: { number: true } } } }),
  ]);
  const method = (p: (typeof payments)[number]) => (p.provider === "stripe" ? `Card${p.cardLast4 ? ` •••• ${p.cardLast4}` : ""}` : p.provider === "paypal" ? "PayPal" : p.provider === "bank_transfer" ? "Bank transfer" : "Test");
  return (
    <div className="grid gap-8">
      <PageHeader title="Payments & refunds" lead="We never store card numbers — payments are processed by the provider you chose at checkout." />
      <Panel title="Payments">
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 text-ink-600">{formatDateTime(p.createdAt, { timeZone: user.timezone, dateOnly: true })}</td>
                    <td className="py-2.5 pr-4">
                      <Link href={`/account/orders/${p.order.number}`} className="font-mono text-ink-900 hover:text-brand-700">
                        {p.order.number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-ink-800">{method(p)}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={tone(p.status)}>{statusLabel(p.status)}</Badge>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-ink-950">{formatMoney(p.presentmentAmount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Refunds" description="Refunds return to the original payment method and usually appear within 5–10 business days.">
        {refunds.length === 0 ? (
          <EmptyState title="No refunds" />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <Link href={`/account/orders/${r.order.number}`} className="font-mono text-ink-900 hover:text-brand-700">
                    {r.order.number}
                  </Link>{" "}
                  · {statusLabel(r.reason)} · {formatDateTime(r.createdAt, { timeZone: user.timezone, dateOnly: true })}
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={tone(r.status)}>{statusLabel(r.status)}</Badge>
                  <span className="tabular-nums font-semibold text-ink-950">{formatMoney(r.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
