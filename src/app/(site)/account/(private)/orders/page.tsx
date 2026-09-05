import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel, statusTone } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { countryLabel, countryNames, isInternational } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Orders", description: "Every order with status, tracking and invoices.", path: "/account/orders", noIndex: true });

const PAGE = 20;

export default async function OrdersPage({ searchParams }: PageProps<"/account/orders">) {
  const user = await requireUser({ next: "/account/orders" });
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, number: true, status: true, paymentStatus: true, fulfillmentStatus: true, currency: true, presentmentTotal: true, placedAt: true, countryCode: true, items: { select: { title: true, qty: true, imageUrl: true, seller: { select: { shipsFromCountry: true, countryCode: true } } } } },
    }),
    db.order.count({ where: { userId: user.id } }),
  ]);
  const names = await countryNames();
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const tone = (s: string) => {
    const t = statusTone(s);
    return t === "danger" ? "sale" : t === "success" ? "brand" : t === "warning" ? "gold" : "neutral";
  };

  return (
    <div className="grid gap-8">
      <PageHeader title="Orders" lead={`${total} order${total === 1 ? "" : "s"} on this account.`} />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Books you buy will appear here with tracking and invoices." action={<ButtonLink href="/store" size="sm">Browse the store</ButtonLink>} />
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-ink-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/account/orders/${o.number}`} className="font-mono text-sm font-semibold text-ink-950 hover:text-brand-700">
                    {o.number}
                  </Link>
                  <p className="mt-0.5 text-[13px] text-ink-600">
                    Placed {formatDateTime(o.placedAt, { timeZone: user.timezone })} · to {countryLabel(names, o.countryCode)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.items.some((i) => isInternational(i.seller?.shipsFromCountry ?? i.seller?.countryCode, o.countryCode)) && <Badge tone="neutral">International</Badge>}
                  <Badge tone={tone(o.status)}>{statusLabel(o.status)}</Badge>
                  <span className="font-display text-lg font-semibold tabular-nums text-ink-950">{formatMoney(o.presentmentTotal, o.currency)}</span>
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-3">
                {o.items.map((i, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-[13px] text-ink-700">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.imageUrl} alt="" className="h-10 w-7 rounded object-cover ring-1 ring-ink-200" />
                    ) : (
                      <span className="h-10 w-7 rounded bg-ink-100" aria-hidden />
                    )}
                    {i.title} × {i.qty}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/account/orders/${o.number}`} size="sm" variant="outline">
                  View details
                </ButtonLink>
                {o.paymentStatus === "paid" && (
                  <ButtonLink href={`/account/orders/${o.number}/invoice`} size="sm" variant="quiet">
                    Invoice
                  </ButtonLink>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-ink-600">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/account/orders?page=${page - 1}`} className="rounded-lg border border-ink-300 px-3 py-1.5 hover:bg-ink-50">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={`/account/orders?page=${page + 1}`} className="rounded-lg border border-ink-300 px-3 py-1.5 hover:bg-ink-50">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
