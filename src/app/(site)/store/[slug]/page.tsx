import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";

import { CoverArt } from "@/components/cover-art";
import { PurchasePanel } from "@/components/buy-buttons";
import { ProductCard } from "@/components/product-card";
import { Badge, Breadcrumbs, Container, Stars, ButtonLink, type Crumb } from "@/components/ui";
import { CheckIcon, ShieldIcon, TruckIcon, SearchIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { detailToSummary, getPublishedProduct, recordProductView, relatedProducts } from "@/lib/catalog/products";
import { shippingOptionsFor } from "@/lib/commerce/pricing";
import { priceFormatter } from "@/lib/currency";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney, schemaPrice } from "@/lib/money-format";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/store/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProduct(slug);
  if (!product) return pageMetadata({ title: "Comic not found", description: "This listing is no longer available.", path: `/store/${slug}`, noIndex: true });
  const settings = await getSettings();

  const gradeLabel = product.grader === "Raw" ? `Raw ${product.grade}` : `${product.grader} ${product.grade}`;
  const title = `${product.title} ${product.issue} — ${gradeLabel} (${product.year}) for Sale`;
  return {
    ...pageMetadata({
      title,
      description: `${product.title} ${product.issue}, ${product.publisher} ${product.year}. ${gradeLabel}${product.keyIssue ? ` — ${product.keyIssue}` : ""}. ${formatMoney(product.price, "USD", "en-US", { compact: true })}, insured shipping and a ${settings["commerce.returnWindowDays"]}-day return window from ${site.name}.`,
      path: `/store/${product.slug}`,
      type: "article",
      keywords: [`${product.title} ${product.issue}`, `${product.title} ${product.issue} ${product.grader} ${product.grade}`, `${product.publisher} ${product.era}`, "graded comic for sale"],
    }),
    other: {
      "product:price:amount": schemaPrice(product.price),
      "product:price:currency": site.currency,
      "product:availability": product.stock > 0 ? "in stock" : "out of stock",
    },
  };
}

const assurancesFor = (returnWindowDays: number) => [
  { icon: ShieldIcon, title: "Authenticity guaranteed", body: "Cert-verified against the grader's census. Undisclosed restoration refunded in full, forever." },
  { icon: TruckIcon, title: "Insured & tracked", body: "Double-boxed, signature required, insured to full value." },
  { icon: SearchIcon, title: `${returnWindowDays}-day inspection`, body: `Return in the original holder within ${returnWindowDays} days of delivery for a full refund.` },
];

export default async function ProductPage({ params }: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const product = await getPublishedProduct(slug);
  if (!product) notFound();
  after(() => recordProductView(product.id));

  const [related, settings, { format, formatExact }] = await Promise.all([relatedProducts(product), getSettings(), priceFormatterPair()]);
  const shippingOptions = await shippingOptionsFor(settings["marketplace.defaultCountry"], product.price);
  const cheapestShipping = shippingOptions.find((o) => o.price >= 0) ?? null;
  const reviews = await db.review.findMany({
    where: { productId: product.id, status: "published" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, rating: true, title: true, body: true, createdAt: true, isVerifiedPurchase: true, sellerReply: true, user: { select: { name: true } } },
  });

  const onSale = product.compareAt !== undefined && product.compareAt > product.price;
  const gradeLabel = product.grader === "Raw" ? `Raw · ${product.grade}` : `${product.grader} ${product.grade}`;
  const summary = detailToSummary(product);

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Store", href: "/store" },
    { name: `${product.title} ${product.issue}`, href: `/store/${product.slug}` },
  ];

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${site.url}/store/${product.slug}#product`,
    name: `${product.title} ${product.issue} — ${gradeLabel.replace(" · ", " ")}`,
    description: product.summary,
    sku: product.sku,
    mpn: product.certNumber ?? product.sku,
    category: "Collectible Comic Books",
    brand: { "@type": "Brand", name: product.publisher },
    itemCondition: "https://schema.org/UsedCondition",
    url: `${site.url}/store/${product.slug}`,
    image: product.images.length > 0 ? product.images.map((i) => (i.url.startsWith("http") ? i.url : `${site.url}${i.url}`)) : [`${site.url}/api/og?title=${encodeURIComponent(`${product.title} ${product.issue}`)}`],
    ...(product.reviewCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount, bestRating: 5, worstRating: 1 } }
      : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Publisher", value: product.publisher },
      { "@type": "PropertyValue", name: "Year", value: String(product.year) },
      { "@type": "PropertyValue", name: "Age / Era", value: product.era },
      { "@type": "PropertyValue", name: "Grading company", value: product.grader },
      { "@type": "PropertyValue", name: "Grade", value: product.grade },
      { "@type": "PropertyValue", name: "Label", value: product.label },
      ...(product.certNumber ? [{ "@type": "PropertyValue", name: "Certification number", value: product.certNumber }] : []),
    ],
    offers: {
      "@type": "Offer",
      "@id": `${site.url}/store/${product.slug}#offer`,
      price: schemaPrice(product.price),
      priceCurrency: site.currency,
      priceValidUntil: "2027-12-31",
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: `${site.url}/store/${product.slug}`,
      seller: product.seller ? { "@type": "Organization", name: product.seller.displayName } : { "@id": `${site.url}/#organization` },
      ...(cheapestShipping
        ? {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: schemaPrice(cheapestShipping.price), currency: site.currency },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: settings["marketplace.defaultCountry"] },
              deliveryTime: {
                "@type": "ShippingDeliveryTime",
                handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: product.seller?.handlingDays ?? 2, unitCode: "DAY" },
                transitTime: { "@type": "QuantitativeValue", minValue: cheapestShipping.estimatedDaysMin, maxValue: cheapestShipping.estimatedDaysMax, unitCode: "DAY" },
              },
            },
          }
        : {}),
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: settings["marketplace.defaultCountry"],
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: settings["commerce.returnWindowDays"],
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/FreeReturn",
      },
    },
  };

  return (
    <>
      <JsonLd id="product-schema" data={productJsonLd} />
      <JsonLd id="product-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />

      <Container className="py-8 lg:py-10">
        <Breadcrumbs items={crumbs} />

        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <CoverArt product={summary} priority className="aspect-[2/3] w-full max-w-md shadow-lift ring-1 ring-ink-950/10" />
              {product.images.length > 1 && (
                <ul className="mt-3 flex max-w-md gap-2 overflow-x-auto">
                  {product.images.slice(1, 6).map((img, i) => (
                    <li key={i} className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.alt ?? `${product.title} ${product.issue} photo ${i + 2}`} className="h-24 w-16 rounded-md object-cover ring-1 ring-ink-200" loading="lazy" />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 max-w-md text-center text-xs text-ink-500">
                Full multi-angle photography of this exact copy is sent before dispatch and is available on request.
              </p>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{product.era}</Badge>
              <Badge tone="neutral">{product.publisher}</Badge>
              {product.keyIssue && <Badge tone="gold">Key issue</Badge>}
              {onSale && <Badge tone="sale">Sale</Badge>}
              {product.label.startsWith("Signature") && <Badge tone="brand">Signature Series</Badge>}
            </div>

            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">
              {product.title} {product.issue}
            </h1>

            <p className="mt-2 text-[15px] text-ink-600">
              {product.publisher} · {product.year} · <span className="font-semibold text-ink-900">{gradeLabel}</span>
              {product.grader !== "Raw" && <> · {product.label}</>}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Stars rating={product.rating} count={product.reviewCount} />
              {product.certNumber && (
                <span className="text-xs text-ink-500">
                  Cert <span className="font-mono text-ink-700">{product.certNumber}</span>
                </span>
              )}
            </div>

            <p className="mt-5 text-[15px] leading-relaxed text-ink-700">{product.summary}</p>

            <div className="mt-7 rounded-xl border border-ink-200 bg-ink-50 p-5">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-display text-3xl font-semibold tabular-nums text-ink-950">{formatExact(product.price)}</span>
                {onSale && (
                  <>
                    <span className="text-lg text-ink-400 line-through tabular-nums">{formatExact(product.compareAt!)}</span>
                    <Badge tone="sale">Save {format(product.compareAt! - product.price)}</Badge>
                  </>
                )}
              </div>

              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-600">
                <span className={product.stock > 0 ? "font-semibold text-brand-700" : "font-semibold text-rose-700"}>
                  {product.stock > 0 ? `In stock — ${product.stock} available` : "Sold out"}
                </span>
                {cheapestShipping && (
                  <>
                    <span>·</span>
                    <span>{cheapestShipping.price === 0 ? "Free insured shipping" : `Insured shipping from ${formatExact(cheapestShipping.price)}`}</span>
                  </>
                )}
                <span>·</span>
                <span>Ships in {product.seller?.handlingDays ?? 2} business days</span>
              </p>

              <div className="mt-5">
                <PurchasePanel product={summary} />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Secure checkout · Card, PayPal and bank wire accepted · Need to track an existing order?{" "}
                <Link href="/track-order" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  Track it here
                </Link>
                .
              </p>
            </div>

            {product.seller && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Sold by</p>
                  <Link href={`/sellers/${product.seller.slug}`} className="mt-1 block font-display text-lg font-semibold text-ink-950 hover:text-brand-700">
                    {product.seller.displayName}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
                    <Stars rating={product.seller.ratingAvg} count={product.seller.ratingCount} />
                    <span>· {product.seller.salesCount} sales</span>
                    {product.seller.shipsFromCountry && <span>· Ships from {product.seller.shipsFromCountry}</span>}
                  </p>
                </div>
                <ButtonLink href={`/sellers/${product.seller.slug}`} size="sm" variant="outline">
                  Visit storefront
                </ButtonLink>
              </div>
            )}

            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {product.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {h}
                </li>
              ))}
            </ul>

            <div className="mt-8 grid gap-px overflow-hidden rounded-xl bg-ink-200 sm:grid-cols-3">
              {assurancesFor(settings["commerce.returnWindowDays"]).map((a) => (
                <div key={a.title} className="bg-white p-4">
                  <a.icon className="h-5 w-5 text-brand-600" />
                  <p className="mt-2 text-[13px] font-semibold text-ink-950">{a.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold text-ink-950">About this copy</h2>
            <div className="prose-doc mt-4">
              {product.description.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <h2 className="mt-10 font-display text-2xl font-semibold text-ink-950">Grading &amp; condition</h2>
            <div className="prose-doc mt-4">
              <p>
                {product.grader === "Raw" ? (
                  <>
                    This book is sold <strong>raw</strong> — unslabbed and graded in-house at <strong>{product.grade}</strong> using the standard 10-point scale. Every defect we can see is disclosed above and photographed. If you disagree with our assessment after inspecting the book, return it within {settings["commerce.returnWindowDays"]} days for a full refund.
                  </>
                ) : (
                  <>
                    This copy is encapsulated by <strong>{product.grader}</strong> at <strong>{product.grade}</strong> on a <strong>{product.label}</strong> label
                    {product.certNumber && (
                      <>
                        {" "}
                        under certification number <strong>{product.certNumber}</strong>, which you can verify independently on the {product.grader} website before you buy
                      </>
                    )}
                    . The holder is intact and has not been cracked, re-sealed or altered.
                  </>
                )}
              </p>
              <p>
                Want to grade a book of your own? <Link href="/services/grading-submission">Our submission service</Link> covers pre-screening, tier selection and insured round-trip shipping at dealer rates, and{" "}
                <Link href="/services/pressing-and-cleaning">professional pressing</Link> often adds a full grade point before the book is ever submitted.
              </p>
            </div>

            <h2 className="mt-10 font-display text-2xl font-semibold text-ink-950">Reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-ink-600">No reviews yet. Verified buyers can review this listing from their order page after delivery.</p>
            ) : (
              <ul className="mt-4 grid gap-4">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Stars rating={r.rating} />
                      <span className="text-xs text-ink-500">
                        {r.user.name} · {formatDateTime(r.createdAt, { dateOnly: true })}
                        {r.isVerifiedPurchase && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-800">Verified purchase</span>}
                      </span>
                    </div>
                    {r.title && <p className="mt-2 font-semibold text-ink-950">{r.title}</p>}
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{r.body}</p>
                    {r.sellerReply && (
                      <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
                        <span className="font-semibold text-ink-900">Seller reply:</span> {r.sellerReply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lg:col-span-5">
            <h2 className="font-display text-2xl font-semibold text-ink-950">Specifications</h2>
            <dl className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200">
              {[
                ["Title", `${product.title} ${product.issue}`],
                ["Publisher", product.publisher],
                ["Cover date", String(product.year)],
                ["Age / era", product.era],
                ["Grading company", product.grader === "Raw" ? "Ungraded (raw)" : product.grader],
                ["Grade", product.grade],
                ["Label", product.label],
                ...(product.certNumber ? [["Certification #", product.certNumber]] : []),
                ["SKU", product.sku],
                ["Writer", product.creators.writer],
                ["Interior art", product.creators.artist],
                ["Cover art", product.creators.cover],
                ...(product.keyIssue ? [["Key issue", product.keyIssue]] : []),
                ...Object.entries(product.attributes),
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-5 gap-3 px-4 py-3 text-sm odd:bg-ink-50">
                  <dt className="col-span-2 text-ink-500">{k}</dt>
                  <dd className="col-span-3 font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
              <h3 className="font-display text-lg font-semibold text-ink-950">Questions about this book?</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">
                Ask for additional photos, request a video walkaround of the slab, or book an in-person inspection at our {site.address.city} vault before you commit.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href={`/support?about=${encodeURIComponent(product.slug)}`} size="sm" variant="primary">
                  Contact support
                </ButtonLink>
                <ButtonLink href={`/report?type=listing&id=${product.id}`} size="sm" variant="quiet">
                  Report this listing
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-ink-950">Collectors also considered</h2>
              <Link href="/store" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
                Browse all inventory →
              </Link>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </>
  );
}

async function priceFormatterPair() {
  const { format, currency } = await priceFormatter();
  return {
    format: (baseMinor: number) => format(baseMinor, { compact: true }),
    formatExact: (baseMinor: number) => format(baseMinor),
    currency,
  };
}
