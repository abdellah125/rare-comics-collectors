import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Panel } from "@/components/account/ui";
import { ReviewReplyForm } from "@/components/seller/review-reply-form";
import { Stars } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Reviews", description: "Reviews on your listings.", path: "/dashboard/reviews", noIndex: true });

export default async function SellerReviewsPage() {
  const user = await requireSeller({ next: "/dashboard/reviews" });
  const [reviews, profile] = await Promise.all([
    db.review.findMany({ where: { status: "published", OR: [{ sellerId: user.seller.id }, { product: { sellerId: user.seller.id } }] }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } }, product: { select: { slug: true, title: true, issue: true } } } }),
    db.sellerProfile.findUniqueOrThrow({ where: { id: user.seller.id }, select: { ratingAvg: true, ratingCount: true } }),
  ]);
  return (
    <div className="grid gap-8">
      <PageHeader title="Reviews" lead={`${profile.ratingCount} review${profile.ratingCount === 1 ? "" : "s"} · average ${profile.ratingAvg.toFixed(1)} / 5. Public replies show under the review.`} />
      <Panel>
        {reviews.length === 0 ? (
          <EmptyState title="No reviews yet" body="Buyers can review a book once it's delivered." />
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
                    ) : (
                      "Store review"
                    )}
                  </p>
                  <span className="flex items-center gap-2 text-xs text-ink-500">
                    <Stars rating={r.rating} /> {r.user.name} · {formatDateTime(r.createdAt, { timeZone: user.timezone, dateOnly: true })}
                  </span>
                </div>
                {r.title && <p className="mt-1 text-sm font-medium text-ink-900">{r.title}</p>}
                <p className="mt-1 text-sm text-ink-700">{r.body}</p>
                {r.sellerReply ? (
                  <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
                    <span className="font-semibold text-ink-900">Your reply:</span> {r.sellerReply}
                  </p>
                ) : (
                  <div className="mt-3">
                    <ReviewReplyForm reviewId={r.id} />
                  </div>
                )}
                <p className="mt-2 text-[12px]">
                  <Link href={`/report?type=review&id=${r.id}`} className="text-ink-500 underline-offset-2 hover:underline">
                    Report this review
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
