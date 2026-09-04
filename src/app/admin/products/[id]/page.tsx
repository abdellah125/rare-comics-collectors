import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminProductForm } from "@/components/admin/product-form";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, adminInput } from "@/components/admin/ui";
import { requireAdmin, can } from "@/lib/auth/session";
import { adjustStockAction, deleteProductAction, moderateListingAction } from "@/lib/admin/actions/products";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { parseJsonArray, isString } from "@/lib/json";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Listing" };
export const dynamic = "force-dynamic";

export default async function AdminProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const admin = await requireAdmin("products.view");
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      seller: { select: { id: true, displayName: true } },
      adjustments: { orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true } } } },
      orderItems: { orderBy: { createdAt: "desc" }, take: 8, include: { order: { select: { id: true, number: true, placedAt: true } } } },
      reviews: { orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { name: true } } } },
      _count: { select: { orderItems: true, reviews: true, wishlistItems: true } },
    },
  });
  if (!product) notFound();
  const [settings, sellers, brands, categories, reports] = await Promise.all([
    getSettings(),
    db.sellerProfile.findMany({ where: { status: "approved" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.report.count({ where: { targetType: "listing", targetId: id, status: { in: ["open", "reviewing"] } } }),
  ]);
  const manage = can(admin, "products.manage");
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Listings", href: "/admin/products" }, { label: `${product.title} ${product.issue}` }]}
        title={`${product.title} ${product.issue}`}
        lead={
          <>
            SKU <span className="font-mono">{product.sku}</span> · {product.seller ? <Link href={`/admin/sellers/${product.seller.id}`} className="text-brand-700 hover:underline">{product.seller.displayName}</Link> : "House inventory"} ·{" "}
            <Link href={`/store/${product.slug}`} className="text-brand-700 hover:underline">
              view in store ↗
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={product.status} />
            {reports > 0 && (
              <Link href={`/admin/moderation?target=${product.id}`} className="text-[13px] font-semibold text-rose-700 underline-offset-2 hover:underline">
                {reports} open report{reports === 1 ? "" : "s"}
              </Link>
            )}
          </>
        }
      />
      {sp.created && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-200">Listing created.</p>}
      {product.moderationNote && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">Moderation note: {product.moderationNote}</p>}

      {manage && (
        <Card title="Moderation" className="mb-6">
          <div className="flex flex-wrap gap-2">
            {product.status === "pending" && <ConfirmButton label="Approve & publish" message="Publish this listing to the store and notify the seller." action={moderateListingAction.bind(null, product.id, "approve")} variant="primary" />}
            {product.status === "pending" && <ConfirmButton label="Send back to seller" message="Return the listing to draft with a note about what to change." action={moderateListingAction.bind(null, product.id, "reject")} withReason reasonLabel="What needs changing" variant="outline" />}
            {product.status === "published" && <ConfirmButton label="Hide" message="Remove from the store without notifying anyone about a violation." action={moderateListingAction.bind(null, product.id, "hide")} />}
            {(product.status === "hidden" || product.status === "draft") && <ConfirmButton label="Publish" message="Make this listing live." action={moderateListingAction.bind(null, product.id, "publish")} variant="primary" />}
            {product.status !== "suspended" && product.status !== "archived" && <ConfirmButton label="Suspend" message="Suspend for a policy violation. The seller can't republish until reinstated." action={moderateListingAction.bind(null, product.id, "suspend")} withReason variant="danger" />}
            {product.status === "suspended" && <ConfirmButton label="Reinstate" message="Reinstate the listing as published." action={moderateListingAction.bind(null, product.id, "reinstate")} variant="primary" />}
            {product.status !== "archived" && <ConfirmButton label="Archive" message="Archive the listing." action={moderateListingAction.bind(null, product.id, "archive")} />}
            <ConfirmButton label="Delete" message="Delete the listing. If it has order history it is archived instead." action={deleteProductAction.bind(null, product.id)} withReason variant="danger" />
          </div>
        </Card>
      )}

      {manage ? (
        <AdminProductForm
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
            tags: parseJsonArray(product.tagsJson, isString),
            status: product.status,
            images: product.images.map((i) => ({ id: i.id, url: i.url })),
            sellerId: product.sellerId,
            brandId: product.brandId,
            featured: product.featured,
            bestseller: product.bestseller,
            featuredUntil: product.featuredUntil ? product.featuredUntil.toISOString().slice(0, 10) : null,
            allowedCountries: parseJsonArray(product.allowedCountriesJson, isString),
            moderationNote: product.moderationNote,
          }}
          sellers={sellers}
          brands={brands}
          categories={categories}
          maxImages={settings["listings.maxImages"]}
        />
      ) : (
        <Card title="Details">
          <Kv items={[{ label: "Price", value: formatMoney(product.price) }, { label: "Stock", value: product.stock }, { label: "Grade", value: `${product.grader} ${product.grade} · ${product.label}` }, { label: "Summary", value: product.summary }]} />
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Performance">
          <Kv items={[{ label: "Views", value: product.viewCount }, { label: "Sold", value: `${product.soldCount} (${product._count.orderItems} order lines)` }, { label: "Wishlisted", value: product._count.wishlistItems }, { label: "Rating", value: product.ratingCount ? `${product.ratingAvg.toFixed(1)} (${product.ratingCount})` : "—" }, { label: "Published", value: product.publishedAt ? formatDateTime(product.publishedAt) : "—" }, { label: "Updated", value: formatDateTime(product.updatedAt) }]} />
        </Card>
        <Card title="Inventory history">
          {manage && (
            <ActionForm action={adjustStockAction} hidden={{ id: product.id }} submitLabel="Adjust" variant="outline" resetOnSuccess className="mb-3">
              <div className="grid grid-cols-[100px_1fr] gap-2">
                <Field label="± Qty">
                  <input name="delta" type="number" required className={adminInput} placeholder="-1" />
                </Field>
                <Field label="Note">
                  <input name="note" className={adminInput} placeholder="Damaged in vault…" />
                </Field>
              </div>
            </ActionForm>
          )}
          <ul className="divide-y divide-ink-100 text-[12px] text-ink-700">
            {product.adjustments.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-1.5">
                <span>
                  {a.delta > 0 ? "+" : ""}
                  {a.delta} {a.reason}
                  {a.note ? ` — ${a.note}` : ""}
                  {a.actor ? ` (${a.actor.name})` : ""}
                </span>
                <span className="text-ink-500">{formatDateTime(a.createdAt, { dateOnly: true })}</span>
              </li>
            ))}
            {product.adjustments.length === 0 && <li className="py-1.5 text-ink-500">No adjustments</li>}
          </ul>
        </Card>
        <Card title="Recent orders">
          <ul className="divide-y divide-ink-100 text-[13px]">
            {product.orderItems.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-1.5">
                <Link href={`/admin/orders/${i.order.id}`} className="font-mono text-ink-900 hover:text-brand-700">
                  {i.order.number}
                </Link>
                <span className="flex items-center gap-2">
                  <StatusBadge status={i.status} />
                  <span className="tabular-nums">{formatMoney(i.subtotal)}</span>
                </span>
              </li>
            ))}
            {product.orderItems.length === 0 && <li className="py-1.5 text-ink-500">No sales yet</li>}
          </ul>
          {product.reviews.length > 0 && (
            <>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">Reviews</p>
              <ul className="mt-1 grid gap-1 text-[12px] text-ink-700">
                {product.reviews.map((r) => (
                  <li key={r.id}>
                    {r.rating}★ {r.user.name}: {r.body.slice(0, 80)} <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
