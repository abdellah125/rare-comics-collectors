import type { Metadata } from "next";
import Link from "next/link";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, FilterBar, Field, StatusBadge, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { bulkReviewsAction, clearReviewReportsAction, moderateReviewAction, removeSellerReplyAction } from "@/lib/admin/actions/reviews";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { REVIEW_STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdmin("reviews.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "rating", "reportCount", "status"] });
  const status = p.get("status") || "";
  const rating = p.get("rating") || "";
  const flagged = p.get("flagged") === "1";
  const where: Prisma.ReviewWhereInput = {
    ...(status ? { status } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(flagged ? { OR: [{ reportCount: { gt: 0 } }, { spamScore: { gte: 50 } }] } : {}),
    ...(p.q ? { OR: [{ body: { contains: p.q } }, { title: { contains: p.q } }, { user: { email: { contains: p.q } } }, { product: { title: { contains: p.q } } }, { seller: { displayName: { contains: p.q } } }] } : {}),
  };
  const [rows, total, flaggedCount, pendingCount] = await Promise.all([
    db.review.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { user: { select: { id: true, name: true, email: true } }, product: { select: { id: true, title: true, slug: true } }, seller: { select: { id: true, displayName: true } }, order: { select: { id: true, number: true } } } }),
    db.review.count({ where }),
    db.review.count({ where: { status: "published", OR: [{ reportCount: { gt: 0 } }, { spamScore: { gte: 50 } }] } }),
    db.review.count({ where: { status: "pending" } }),
  ]);
  const base = "/admin/reviews";
  return (
    <>
      <AdminPageHeader title="Reviews" lead={`${flaggedCount} flagged by reports or spam score · ${pendingCount} awaiting approval. Hidden reviews stay attached to the order; removed ones are gone from every storefront.`} />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[220px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Text, reviewer, product, seller" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rating">
          <select name="rating" defaultValue={rating} className={adminSelect}>
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-800">
          <input type="checkbox" name="flagged" value="1" defaultChecked={flagged} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Flagged only
        </label>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No reviews match" />
      ) : (
        <BulkProvider>
          <BulkActionsBar run={bulkReviewsAction} actions={[{ id: "publish", label: "Publish" }, { id: "hide", label: "Hide" }, { id: "remove", label: "Remove", danger: true, confirm: "Remove {n} reviews? Reviewers are notified." }]} />
          <Table>
            <thead>
              <tr>
                <Th className="w-8">
                  <SelectAllCheckbox ids={rows.map((r) => r.id)} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="createdAt" label="Posted" current={p.sort} dir={p.dir} />
                </Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="rating" label="Rating" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Review</Th>
                <Th>About</Th>
                <Th>Reviewer</Th>
                <Th>
                  <SortLink base={base} params={p.params} sortKey="reportCount" label="Flags" current={p.sort} dir={p.dir} />
                </Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <RowCheckbox id={r.id} label={r.title ?? r.body.slice(0, 40)} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{formatDateTime(r.createdAt, { dateOnly: true })}</Td>
                  <Td className="whitespace-nowrap text-gold-600">{"★".repeat(r.rating)}<span className="text-ink-200">{"★".repeat(5 - r.rating)}</span></Td>
                  <Td className="max-w-[360px]">
                    {r.title && <span className="block font-semibold text-ink-950">{r.title}</span>}
                    <span className="line-clamp-3 text-ink-800">{r.body}</span>
                    {r.sellerReply && (
                      <span className="mt-1 block rounded bg-gold-400/10 px-2 py-1 text-[12px] text-ink-700">
                        <strong>Seller reply:</strong> {r.sellerReply} <ConfirmButton label="remove" message="Remove the seller's reply?" action={removeSellerReplyAction.bind(null, r.id)} variant="quiet" size="sm" />
                      </span>
                    )}
                    {r.moderationNote && <span className="mt-1 block text-[11px] text-rose-700">Mod: {r.moderationNote}</span>}
                  </Td>
                  <Td>
                    {r.product ? (
                      <Link href={`/admin/products/${r.product.id}`} className="line-clamp-2 text-brand-700">
                        {r.product.title}
                      </Link>
                    ) : r.seller ? (
                      <Link href={`/admin/sellers/${r.seller.id}`} className="text-brand-700">
                        {r.seller.displayName}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {r.order && (
                      <Link href={`/admin/orders/${r.order.id}`} className="block font-mono text-[11px] text-ink-500">
                        {r.order.number}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <Link href={`/admin/users/${r.user.id}`} className="text-ink-950 hover:text-brand-700">
                      {r.user.name}
                    </Link>
                    <span className="block text-[11px] text-ink-500">{r.isVerifiedPurchase ? "verified purchase" : "unverified"}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {r.reportCount > 0 && <Tone tone="danger">{r.reportCount} report{r.reportCount === 1 ? "" : "s"}</Tone>}
                      {r.spamScore >= 50 && <Tone tone="warning">spam {r.spamScore}</Tone>}
                      {(r.reportCount > 0 || r.spamScore >= 50) && <ConfirmButton label="clear" message="Keep the review and dismiss its reports." action={clearReviewReportsAction.bind(null, r.id)} variant="quiet" size="sm" />}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {r.status !== "published" && <ConfirmButton label="Publish" message="Make this review visible." action={moderateReviewAction.bind(null, r.id, "published")} size="sm" variant="primary" />}
                      {r.status === "published" && <ConfirmButton label="Hide" message="Hide from storefronts (reviewer is notified)." action={moderateReviewAction.bind(null, r.id, "hidden")} withReason size="sm" />}
                      {r.status !== "removed" && <ConfirmButton label="Remove" message="Remove the review permanently from storefronts." action={moderateReviewAction.bind(null, r.id, "removed")} withReason size="sm" variant="danger" />}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </BulkProvider>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
