import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { sellerBalance } from "@/lib/finance/ledger";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "Balance & payouts", description: "Your earnings, ledger and payouts.", path: "/dashboard/balance", noIndex: true });

export default async function BalancePage({ searchParams }: PageProps<"/dashboard/balance">) {
  const user = await requireSeller({ next: "/dashboard/balance" });
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const PAGE = 50;
  const [balance, entries, total, payouts, profile, settings] = await Promise.all([
    sellerBalance(user.seller.id),
    db.ledgerEntry.findMany({ where: { sellerId: user.seller.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { order: { select: { number: true } } } }),
    db.ledgerEntry.count({ where: { sellerId: user.seller.id } }),
    db.payout.findMany({ where: { sellerId: user.seller.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id }, select: { payoutMethod: true, payoutDetailsMasked: true, payoutSchedule: true, minPayout: true, verificationStatus: true } }),
    getSettings(),
  ]);
  const schedule = profile.payoutSchedule ?? settings["payouts.schedule"];
  const min = Math.max(profile.minPayout ?? 0, settings["payouts.minAmount"]);
  return (
    <div className="grid gap-8">
      <PageHeader title="Balance & payouts" lead={`Sales clear after ${settings["payouts.holdDays"]} days. Payouts run ${schedule === "manual" ? "on request" : schedule} once your available balance reaches ${formatMoney(min)}.`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Available", value: balance.available },
          { label: "Pending (clearing)", value: balance.pending },
          { label: "In payouts", value: balance.inPayout },
          { label: "Paid out to date", value: balance.paidOut },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-200 bg-ink-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-950">{formatMoney(s.value)}</p>
          </div>
        ))}
      </div>
      <Panel title="Payout method">
        {profile.payoutMethod ? (
          <p className="text-sm text-ink-800">
            {profile.payoutDetailsMasked ?? profile.payoutMethod} ·{" "}
            <Link href="/dashboard/settings#payouts" className="text-brand-700 underline-offset-2 hover:underline">
              change
            </Link>
          </p>
        ) : (
          <p className="text-sm text-rose-700">
            No payout method yet —{" "}
            <Link href="/dashboard/settings#payouts" className="underline">
              add one
            </Link>{" "}
            so scheduled payouts can run.
          </p>
        )}
        {profile.verificationStatus !== "verified" && <p className="mt-2 text-[13px] text-ink-600">Payouts are released once identity verification is complete ({profile.verificationStatus}).</p>}
      </Panel>
      <Panel title="Payouts">
        {payouts.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  {formatDateTime(p.createdAt, { timeZone: user.timezone, dateOnly: true })} · {p.destinationMasked ?? p.method ?? "—"}
                  {p.reference && <span className="ml-2 font-mono text-[12px] text-ink-500">{p.reference}</span>}
                  {p.scheduledFor && p.status === "scheduled" && <span className="ml-2 text-[12px] text-ink-500">scheduled {formatDateTime(p.scheduledFor, { dateOnly: true })}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={p.status === "paid" ? "brand" : p.status === "failed" || p.status === "cancelled" ? "sale" : "gold"}>{statusLabel(p.status)}</Badge>
                  <span className="tabular-nums font-semibold text-ink-950">{formatMoney(p.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Ledger" description={`${total} entries.`}>
        {entries.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Available</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 pr-4 text-ink-600">{formatDateTime(e.createdAt, { timeZone: user.timezone, dateOnly: true })}</td>
                    <td className="py-2 pr-4 text-ink-800">{statusLabel(e.type)}</td>
                    <td className="py-2 pr-4 text-ink-800">
                      {e.description}
                      {e.order && (
                        <Link href={`/dashboard/orders/${e.order.number}`} className="ml-1 font-mono text-[12px] text-brand-700">
                          {e.order.number}
                        </Link>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-ink-600">{e.payoutId ? "Paid out" : e.availableAt.getTime() <= new Date().getTime() ? "Yes" : formatDateTime(e.availableAt, { dateOnly: true })}</td>
                    <td className={`py-2 text-right tabular-nums ${e.amount < 0 ? "text-rose-700" : "text-ink-950"}`}>{formatMoney(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="mt-4 flex justify-between text-sm">
            {page > 1 ? <Link href={`/dashboard/balance?page=${page - 1}`} className="text-brand-700">← Newer</Link> : <span />}
            {page * PAGE < total && <Link href={`/dashboard/balance?page=${page + 1}`} className="text-brand-700">Older →</Link>}
          </div>
        )}
      </Panel>
    </div>
  );
}
