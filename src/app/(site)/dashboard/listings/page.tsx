import type { Metadata } from "next";
import Link from "next/link";
import { ListingRowActions } from "@/components/seller/listing-row-actions";
import { EmptyState, PageHeader } from "@/components/account/ui";
import { Badge, ButtonLink } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "My listings", description: "Manage your listings.", path: "/dashboard/listings", noIndex: true });

const tone = (s: string) => (s === "published" ? "brand" : s === "pending" ? "gold" : s === "suspended" ? "sale" : "neutral");

export default async function SellerListingsPage({ searchParams }: PageProps<"/dashboard/listings">) {
  const user = await requireSeller({ next: "/dashboard/listings" });
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const where = { sellerId: user.seller.id, deletedAt: null, ...(status ? { status } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { issue: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [listings, counts] = await Promise.all([
    db.product.findMany({ where, orderBy: { updatedAt: "desc" }, take: 200, include: { images: { orderBy: { position: "asc" }, take: 1 } } }),
    db.product.groupBy({ by: ["status"], where: { sellerId: user.seller.id, deletedAt: null }, _count: { _all: true } }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const tabs = [
    { key: "", label: "All", n: counts.reduce((n, c) => n + c._count._all, 0) },
    { key: "published", label: "Live", n: countOf("published") },
    { key: "pending", label: "In review", n: countOf("pending") },
    { key: "draft", label: "Drafts", n: countOf("draft") },
    { key: "hidden", label: "Hidden", n: countOf("hidden") },
    { key: "suspended", label: "Suspended", n: countOf("suspended") },
    { key: "archived", label: "Archived", n: countOf("archived") },
  ];
  return (
    <div className="grid gap-6">
      <PageHeader title="Listings" lead="Your books, with photos and market details." actions={<ButtonLink href="/dashboard/listings/new" size="sm">+ New listing</ButtonLink>} />
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={`/dashboard/listings${t.key ? `?status=${t.key}` : ""}`} className={`rounded-full border px-3 py-1 text-[13px] ${status === t.key ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
            {t.label} <span className="text-ink-500">({t.n})</span>
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/dashboard/listings">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Search title, issue, SKU" aria-label="Search listings" className="h-9 rounded-lg border border-ink-300 px-3 text-sm" />
        </form>
      </div>
      {listings.length === 0 ? (
        <EmptyState title="No listings here" body="Add your first book with a cover photo to go live." action={<ButtonLink href="/dashboard/listings/new" size="sm">Add a listing</ButtonLink>} />
      ) : (
        <ul className="grid gap-3">
          {listings.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 bg-white p-4">
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0].url} alt="" className="h-20 w-14 shrink-0 rounded-md object-cover ring-1 ring-ink-200" />
              ) : (
                <span className="grid h-20 w-14 shrink-0 place-items-center rounded-md bg-ink-100 text-[10px] text-ink-400">no photo</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/listings/${p.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                    {p.title} {p.issue}
                  </Link>
                  <Badge tone={tone(p.status)}>{statusLabel(p.status)}</Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  {p.publisher} · {p.year} · {p.grader} {p.grade} · SKU {p.sku}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-600">
                  {formatMoney(p.price)} · {p.stock} in stock · {p.soldCount} sold · {p.viewCount} views
                </p>
                {p.moderationNote && p.status !== "published" && <p className="mt-1 text-[13px] text-rose-700">Moderator note: {p.moderationNote}</p>}
              </div>
              <ListingRowActions id={p.id} slug={p.slug} status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
