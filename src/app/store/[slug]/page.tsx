import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CoverArt } from "@/components/cover-art";
import { PurchasePanel } from "@/components/buy-buttons";
import { ProductCard } from "@/components/product-card";
import { Badge, Breadcrumbs, Container, Stars, ButtonLink, type Crumb } from "@/components/ui";
import { CheckIcon, ShieldIcon, TruckIcon, SearchIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { formatPrice, formatPriceExact, schemaPrice } from "@/lib/format";
import { getProduct, products } from "@/lib/products";
import { FLAT_SHIPPING, FREE_SHIPPING_THRESHOLD } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return pageMetadata({ title: "Comic not found", description: "This listing is no longer available.", path: `/store/${slug}`, noIndex: true });

  const gradeLabel = product.grader === "Raw" ? `Raw ${product.grade}` : `${product.grader} ${product.grade}`;
  const title = `${product.title} ${product.issue} — ${gradeLabel} (${product.year}) for Sale`;

  return {
    ...pageMetadata({
      title,
      description: `${product.title} ${product.issue}, ${product.publisher} ${product.year}. ${gradeLabel}${
        product.keyIssue ? ` — ${product.keyIssue}` : ""
      }. ${formatPrice(product.price)}, insured shipping and a 14-day return window from ${site.name}.`,
      path: `/store/${product.slug}`,
      type: "article",
      keywords: [
        `${product.title} ${product.issue}`,
        `${product.title} ${product.issue} ${product.grader} ${product.grade}`,
        `${product.publisher} ${product.era}`,
        "graded comic for sale",
      ],
    }),
    other: {
      "product:price:amount": schemaPrice(product.price),
      "product:price:currency": site.currency,
      "product:availability": product.stock > 0 ? "in stock" : "out of stock",
    },
  };
}

const assurances = [
  { icon: ShieldIcon, title: "Authenticity guaranteed", body: "Cert-verified against the grader's census. Undisclosed restoration refunded in full, forever." },
  { icon: TruckIcon, title: "Insured & tracked", body: `Double-boxed, signature required, insured to full value. Free on US orders over ${formatPrice(FREE_SHIPPING_THRESHOLD)}.` },
  { icon: SearchIcon, title: "14-day inspection", body: "Return in the original holder within 14 days of delivery for a full refund." },
];

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  // Other issues of the same title first, then books from the same era.
  const others = products.filter((p) => p.slug !== slug);
  const sameTitle = others.filter((p) => p.title === product.title && p.publisher === product.publisher);
  const sameEra = others.filter((p) => p.era === product.era && !sameTitle.includes(p));
  const related = [...sameTitle, ...sameEra].slice(0, 4);
  const onSale = product.compareAt !== undefined && product.compareAt > product.price;
  const gradeLabel = product.grader === "Raw" ? `Raw · ${product.grade}` : `${product.grader} ${product.grade}`;

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
    image: [`${site.url}/api/og?title=${encodeURIComponent(`${product.title} ${product.issue}`)}&badge=${encodeURIComponent(gradeLabel)}`],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Publisher", value: product.publisher },
      { "@type": "PropertyValue", name: "Year", value: String(product.year) },
      { "@type": "PropertyValue", name: "Age / Era", value: product.era },
      { "@type": "PropertyValue", name: "Grading company", value: product.grader },
      { "@type": "PropertyValue", name: "Grade", value: product.grade },
      { "@type": "PropertyValue", name: "Label", value: product.label },
      ...(product.certNumber
        ? [{ "@type": "PropertyValue", name: "Certification number", value: product.certNumber }]
        : []),
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
      seller: { "@id": `${site.url}/#organization` },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: schemaPrice(product.price >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING),
          currency: site.currency,
        },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 5, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "US",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
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
          {/* Cover */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <CoverArt
                product={product}
                priority
                className="aspect-[2/3] w-full max-w-md shadow-lift ring-1 ring-ink-950/10"
              />
              <p className="mt-3 max-w-md text-center text-xs text-ink-500">
                Representative image. Full multi-angle photography of this exact copy is sent before dispatch and is
                available on request.
              </p>
            </div>
          </div>

          {/* Buy box */}
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
              {product.publisher} · {product.year} ·{" "}
              <span className="font-semibold text-ink-900">{gradeLabel}</span>
              {product.grader !== "Raw" && <> · {product.label}</>}
            </p>

            <div className="mt-3 flex items-center gap-3">
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
                <span className="font-display text-3xl font-semibold tabular-nums text-ink-950">
                  {formatPriceExact(product.price)}
                </span>
                {onSale && (
                  <>
                    <span className="text-lg text-ink-400 line-through tabular-nums">
                      {formatPriceExact(product.compareAt!)}
                    </span>
                    <Badge tone="sale">
                      Save {formatPrice(product.compareAt! - product.price)}
                    </Badge>
                  </>
                )}
              </div>

              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-600">
                <span className={product.stock > 0 ? "font-semibold text-brand-700" : "font-semibold text-rose-700"}>
                  {product.stock > 0 ? `In stock — ${product.stock} available` : "Sold out"}
                </span>
                <span>·</span>
                <span>
                  {product.price >= FREE_SHIPPING_THRESHOLD
                    ? "Free insured US shipping"
                    : `Insured shipping ${formatPriceExact(FLAT_SHIPPING)}`}
                </span>
                <span>·</span>
                <span>Ships in 1–2 business days</span>
              </p>

              <div className="mt-5">
                <PurchasePanel product={product} />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-ink-500">
                Secure checkout · Card, ACH, wire and PayPal accepted · Payment plans available on orders over
                $2,500 —{" "}
                <Link href="/contact" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  ask us
                </Link>
                . Need to track an existing order?{" "}
                <Link href="/track-order" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                  Track it here
                </Link>
                .
              </p>
            </div>

            {/* Highlights */}
            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {product.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {h}
                </li>
              ))}
            </ul>

            {/* Assurances */}
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl bg-ink-200 sm:grid-cols-3">
              {assurances.map((a) => (
                <div key={a.title} className="bg-white p-4">
                  <a.icon className="h-5 w-5 text-brand-600" />
                  <p className="mt-2 text-[13px] font-semibold text-ink-950">{a.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Description + spec table */}
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
                    This book is sold <strong>raw</strong> — unslabbed and graded in-house at{" "}
                    <strong>{product.grade}</strong> using the standard 10-point scale. Every defect we can see is
                    disclosed above and photographed. If you disagree with our assessment after inspecting the book,
                    return it within 14 days for a full refund.
                  </>
                ) : (
                  <>
                    This copy is encapsulated by <strong>{product.grader}</strong> at{" "}
                    <strong>{product.grade}</strong> on a <strong>{product.label}</strong> label
                    {product.certNumber && (
                      <>
                        {" "}
                        under certification number <strong>{product.certNumber}</strong>, which you can verify
                        independently on the {product.grader} website before you buy
                      </>
                    )}
                    . The holder is intact and has not been cracked, re-sealed or altered.
                  </>
                )}
              </p>
              <p>
                Want to grade a book of your own?{" "}
                <Link href="/services/grading-submission">Our submission service</Link> covers pre-screening, tier
                selection and insured round-trip shipping at dealer rates, and{" "}
                <Link href="/services/pressing-and-cleaning">professional pressing</Link> often adds a full grade
                point before the book is ever submitted.
              </p>
            </div>
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
                Ask for additional photos, request a video walkaround of the slab, or book an in-person inspection at
                our {site.address.city} vault before you commit.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/support" size="sm" variant="primary">
                  Contact support
                </ButtonLink>
                <ButtonLink href="/contact" size="sm" variant="outline">
                  Book a viewing
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>

        {/* Related */}
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
