import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, Stars, type Crumb } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { toSummary } from "@/lib/catalog/products";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/sellers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const seller = await db.sellerProfile.findFirst({ where: { slug, status: "approved" }, select: { displayName: true, bio: true } });
  if (!seller) return pageMetadata({ title: "Seller not found", description: "", path: `/sellers/${slug}`, noIndex: true });
  return pageMetadata({ title: `${seller.displayName} — Seller storefront`, description: seller.bio ?? `Graded comics from ${seller.displayName} on ${site.name}.`, path: `/sellers/${slug}` });
}

export default async function SellerStorefrontPage({ params }: PageProps<"/sellers/[slug]">) {
  const { slug } = await params;
  const settings = await getSettings();
  if (!settings["features.sellerStorefronts"]) notFound();
  const seller = await db.sellerProfile.findFirst({
    where: { slug, status: "approved" },
    include: {
      products: { where: { status: "published", deletedAt: null }, include: { images: { orderBy: { position: "asc" }, take: 1, select: { url: true, alt: true } } }, orderBy: { publishedAt: "desc" } },
      reviews: { where: { status: "published" }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } },
    },
  });
  if (!seller) notFound();
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Store", href: "/store" },
    { name: seller.displayName, href: `/sellers/${seller.slug}` },
  ];
  return (
    <>
      <JsonLd id="seller-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 flex flex-wrap items-start gap-6">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-600 font-display text-2xl font-semibold text-white">
              {seller.logoMediaId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(seller.logoMediaId)} alt="" className="h-full w-full object-cover" />
              ) : (
                seller.displayName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Seller storefront</p>
              <h1 className="mt-1 font-display text-3xl font-semibold text-ink-950 sm:text-4xl">{seller.displayName}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                <Stars rating={seller.ratingAvg} count={seller.ratingCount} />
                <span>· {seller.salesCount} sales</span>
                {seller.verificationStatus === "verified" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-brand-800">Verified</span>}
                <span>· Member since {formatDateTime(seller.createdAt, { dateOnly: true })}</span>
                {seller.shipsFromCountry && <span>· Ships from {seller.shipsFromCountry}</span>}
              </p>
              {seller.bio && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-700">{seller.bio}</p>}
              <p className="mt-3 text-[13px] text-ink-500">
                Handling time {seller.handlingDays} business day{seller.handlingDays === 1 ? "" : "s"} ·{" "}
                <Link href={`/report?type=seller&id=${seller.id}`} className="underline underline-offset-2 hover:text-ink-800">
                  Report this seller
                </Link>
              </p>
            </div>
          </div>
        </Container>
      </section>
      <Container className="py-10 lg:py-14">
        <h2 className="font-display text-2xl font-semibold text-ink-950">
          Listings <span className="text-base font-normal text-ink-500">({seller.products.length})</span>
        </h2>
        {seller.products.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">No active listings right now.</p>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {seller.products.map((p) => (
              <ProductCard key={p.id} product={toSummary(p)} />
            ))}
          </div>
        )}
        {(seller.shippingPolicy || seller.returnPolicy) && (
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {seller.shippingPolicy && (
              <div className="rounded-xl border border-ink-200 p-5">
                <h3 className="font-display text-lg font-semibold text-ink-950">Shipping policy</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{seller.shippingPolicy}</p>
              </div>
            )}
            {seller.returnPolicy && (
              <div className="rounded-xl border border-ink-200 p-5">
                <h3 className="font-display text-lg font-semibold text-ink-950">Return policy</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{seller.returnPolicy}</p>
              </div>
            )}
          </div>
        )}
        <h2 className="mt-12 font-display text-2xl font-semibold text-ink-950">Seller reviews</h2>
        {seller.reviews.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No reviews yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {seller.reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-center justify-between gap-2">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-ink-500">
                    {r.user.name} · {formatDateTime(r.createdAt, { dateOnly: true })}
                  </span>
                </div>
                {r.title && <p className="mt-2 font-semibold text-ink-950">{r.title}</p>}
                <p className="mt-1 text-sm text-ink-700">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}
