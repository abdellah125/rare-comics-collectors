import type { Metadata } from "next";
import Link from "@/components/link";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { can, requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { decideBidAction } from "@/lib/commerce/bid-actions";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Bids" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  active: { label: "Highest bid", tone: "warning" },
  outbid: { label: "Outbid", tone: "neutral" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export default async function AdminBidsPage({ searchParams }: PageProps<"/admin/bids">) {
  const admin = await requireAdmin("orders.view");
  const manage = can(admin, "orders.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "amount"] as const, per: 50 });
  const status = p.get("status") || "active";
  const where: Prisma.BidWhereInput = {
    ...(status === "all" ? {} : { status }),
    ...(p.q ? { OR: [{ email: { contains: p.q, mode: "insensitive" as const } }, { name: { contains: p.q, mode: "insensitive" as const } }, { product: { title: { contains: p.q, mode: "insensitive" as const } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.bid.findMany({ where, orderBy: [{ [p.sort]: p.dir }, { id: "asc" }], skip: p.skip, take: p.per, include: { product: { select: { id: true, slug: true, title: true, issue: true, price: true, stock: true, bidCount: true } } } }),
    db.bid.count({ where }),
  ]);
  const base = "/admin/bids";
  return (
    <>
      <AdminPageHeader title="Bids" lead="Bids placed on products sold by bidding. Nothing is charged when a bid is placed: accept the bid you want to sell at, then arrange payment with the bidder. Accepting a bid closes the bidding on that product." />
      <FilterBar action={base} reset>
        <Field label="Search">
          <input name="q" defaultValue={p.q} placeholder="Bidder or product…" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="active">Highest bids</option>
            <option value="all">All</option>
            <option value="outbid">Outbid</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Declined</option>
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No bids here" body={status === "active" ? "No product has an open highest bid right now." : "No bids match these filters."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th align="right">Bid</Th>
              <Th>Bidder</Th>
              <Th>Placed</Th>
              <Th>Status</Th>
              {manage && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const name = `${b.product.title} ${b.product.issue}`.trim();
              const s = STATUS[b.status] ?? { label: b.status, tone: "neutral" as const };
              return (
                <tr key={b.id}>
                  <Td className="max-w-[320px]">
                    <Link href={`/store/${b.product.slug}`} className="font-medium text-ink-950 hover:text-brand-700">
                      {name}
                    </Link>
                    <span className="block text-[12px] text-ink-500">
                      current bid {formatMoney(b.product.price)} · {b.product.bidCount} bid(s) · {b.product.stock > 0 ? "open" : "closed"} ·{" "}
                      <Link href={`/admin/products/${b.product.id}`} className="text-brand-700 hover:underline">
                        listing
                      </Link>
                    </span>
                  </Td>
                  <Td align="right" className="font-semibold tabular-nums text-ink-950">
                    {formatMoney(b.amount)}
                  </Td>
                  <Td>
                    {b.name}
                    <span className="block text-[12px] text-ink-600">
                      <a href={`mailto:${b.email}`} className="text-brand-700 hover:underline">
                        {b.email}
                      </a>
                      {b.phone ? ` · ${b.phone}` : ""}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-[12px]">{formatDateTime(b.createdAt)}</Td>
                  <Td>
                    <Tone tone={s.tone}>{s.label}</Tone>
                  </Td>
                  {manage && (
                    <Td className="whitespace-nowrap">
                      {["active", "outbid"].includes(b.status) && (
                        <span className="flex flex-wrap gap-1">
                          <ConfirmButton label="Accept" message={`Accept ${b.name}'s bid of ${formatMoney(b.amount)} on ${name}? Bidding on the product closes and the bidder is emailed. Nothing is charged: arrange payment with them.`} action={decideBidAction.bind(null, b.id, "accepted")} variant="primary" size="sm" confirmLabel="Accept bid" />
                          <ConfirmButton label="Decline" message={`Decline ${b.name}'s bid of ${formatMoney(b.amount)}? The bidder is not emailed.`} action={decideBidAction.bind(null, b.id, "rejected")} size="sm" variant="quiet" />
                        </span>
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
