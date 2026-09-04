import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { Badge, Stars } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "My reviews", description: "Reviews you have written.", path: "/account/reviews", noIndex: true });

export default async function MyReviewsPage() {
  const user = await requireUser({ next: "/account/reviews" });
  const reviews = await db.review.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { slug: true, title: true, issue: true } }, seller: { select: { displayName: true, slug: true } } },
  });
  return (
    <div className="grid gap-8">
      <PageHeader title="My reviews" lead="Reviews you've left on books you bought. Sellers can reply publicly." />
      <Panel>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" body="Once an order is delivered you can review it from the order page." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-950">
                    {r.product ? (
                      <Link href={`/store/${r.product.slug}`} className="hover:text-brand-700">
                        {r.product.title} {r.product.issue}
                      </Link>
                    ) : r.seller ? (
                      <Link href={`/sellers/${r.seller.slug}`} className="hover:text-brand-700">
                        {r.seller.displayName}
                      </Link>
                    ) : (
                      "Review"
                    )}
                  </p>
                  <span className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <Badge tone={r.status === "published" ? "brand" : "neutral"}>{statusLabel(r.status)}</Badge>
                  </span>
                </div>
                {r.title && <p className="mt-1 text-sm font-medium text-ink-900">{r.title}</p>}
                <p className="mt-1 text-sm text-ink-700">{r.body}</p>
                <p className="mt-1 text-[12px] text-ink-500">{formatDateTime(r.createdAt, { timeZone: user.timezone, dateOnly: true })}</p>
                {r.sellerReply && <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700"><span className="font-semibold text-ink-900">Seller reply:</span> {r.sellerReply}</p>}
                {r.moderationNote && r.status !== "published" && <p className="mt-2 text-[13px] text-rose-700">Moderation note: {r.moderationNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
