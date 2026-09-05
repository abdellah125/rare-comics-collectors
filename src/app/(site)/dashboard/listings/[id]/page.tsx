import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/seller/listing-form";
import { PageHeader } from "@/components/account/ui";
import { Badge } from "@/components/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { parseJsonArray, isString } from "@/lib/json";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "Edit listing", description: "Edit a listing.", path: "/dashboard/listings", noIndex: true });

export default async function EditListingPage({ params, searchParams }: PageProps<"/dashboard/listings/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSeller({ next: `/dashboard/listings/${id}` });
  const [product, settings, categories, adjustments] = await Promise.all([
    db.product.findFirst({ where: { id, sellerId: user.seller.id, deletedAt: null }, include: { images: { orderBy: { position: "asc" } } } }),
    getSettings(),
    db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.inventoryAdjustment.findMany({ where: { productId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  if (!product) notFound();
  const created = typeof sp.created === "string" ? sp.created : null;
  return (
    <div className="grid gap-6">
      <PageHeader
        title={`${product.title} ${product.issue}`}
        lead={
          <>
            SKU {product.sku} · {product.soldCount} sold · {product.viewCount} views ·{" "}
            <Link href={`/store/${product.slug}`} className="text-brand-700 underline-offset-2 hover:underline">
              view in store
            </Link>
          </>
        }
        actions={<Badge tone={product.status === "published" ? "brand" : product.status === "pending" ? "gold" : product.status === "suspended" ? "sale" : "neutral"}>{statusLabel(product.status)}</Badge>}
      />
      {created && (
        <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {created === "publish" ? (product.status === "pending" ? "Listing created and queued for review." : "Listing created and published.") : "Draft saved. Publish it when the photos and details are ready."}
        </p>
      )}
      {product.status === "suspended" && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
          This listing was suspended by the marketplace{product.moderationNote ? `: ${product.moderationNote}` : ""}. Edits are saved but it stays hidden until a moderator reinstates it.
        </p>
      )}
      {product.status === "pending" && product.moderationNote && <p className="rounded-lg bg-gold-400/15 px-4 py-3 text-sm text-gold-800">Moderator note: {product.moderationNote}</p>}
      <ListingForm
        initial={{
          id: product.id,
          title: product.title,
          issue: product.issue,
          publisher: product.publisher,
          year: product.year,
          era: product.era,
          grader: product.grader,
          grade: product.grade,
          label: product.label,
          certNumber: product.certNumber,
          price: product.price,
          compareAt: product.compareAt,
          stock: product.stock,
          keyIssue: product.keyIssue,
          writer: product.writer,
          artist: product.artist,
          coverArtist: product.coverArtist,
          summary: product.summary,
          description: product.description,
          highlights: parseJsonArray(product.highlightsJson, isString),
          categoryId: product.categoryId,
          weightGrams: product.weightGrams,
          restrictedCountries: parseJsonArray(product.restrictedCountriesJson, isString),
          allowedCountries: parseJsonArray(product.allowedCountriesJson, isString),
          tags: parseJsonArray(product.tagsJson, isString),
          status: product.status,
          images: product.images.map((i) => ({ id: i.id, url: i.url })),
        }}
        categories={categories}
        maxImages={settings["listings.maxImages"]}
        minPriceLabel={formatMoney(settings["listings.minPrice"])}
      />
      {adjustments.length > 0 && (
        <section className="rounded-xl border border-ink-200 bg-white p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-950">Stock history</h2>
          <ul className="mt-3 divide-y divide-ink-100 text-[13px] text-ink-700">
            {adjustments.map((a) => (
              <li key={a.id} className="flex justify-between py-1.5">
                <span>
                  {a.delta > 0 ? "+" : ""}
                  {a.delta} · {a.reason.replace(/_/g, " ")}
                  {a.note ? ` — ${a.note}` : ""}
                </span>
                <span className="text-ink-500">{a.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
