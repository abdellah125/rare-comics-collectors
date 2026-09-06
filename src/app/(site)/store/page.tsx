import type { Metadata } from "next";
import Link from "next/link";

import { StoreBrowser } from "@/components/store-browser";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { listPublishedProducts, storeFacets } from "@/lib/catalog/products";
import type { Era } from "@/lib/products";
import { formatPrice } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Graded Comics for Sale — CGC & CBCS Key Issues",
  description:
    "Browse CGC-graded Golden Age and Silver Age key issues for sale. Cert-verified, restoration-checked, insured shipping and a 14-day return window. Buy now or add to cart.",
  path: "/store",
  keywords: [
    "graded comics for sale",
    "CGC comics for sale",
    "CBCS slabbed comics",
    "silver age key issues",
    "golden age key issues",
    "buy comic books online",
  ],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Store", href: "/store" },
];

export default async function StorePage({ searchParams }: PageProps<"/store">) {
  // Deep links like /store?q=… or /store?era=Golden+Age (footer links, SearchAction
  // structured data) are read on the server so the first page of results is in
  // the HTML rather than rendered client-side after hydration.
  const sp = await searchParams;
  const [summaries, facets, settings, collections, publisherPages] = await Promise.all([listPublishedProducts(), storeFacets(), getSettings(), listCollections(), listPublishers()]);
  const freeShippingThreshold = settings["commerce.freeShippingThreshold"];
  const returnWindowDays = settings["commerce.returnWindowDays"];
  const { eras, publishers, graders, lowestPrice } = facets;
  const inventoryCount = summaries.length;
  const initialQuery = typeof sp.q === "string" ? sp.q : "";
  const eraParam = typeof sp.era === "string" ? sp.era : null;
  const initialEra: Era | "all" = eraParam !== null && eras.includes(eraParam as Era) ? (eraParam as Era) : "all";


  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Graded comics for sale",
    description:
      "CGC and CBCS graded comic books for sale, plus honestly graded raw books with full defect disclosure.",
    url: `${site.url}/store`,
    isPartOf: { "@id": `${site.url}/#website` },
    // Summary-page pattern: each entry links to the product page that carries the full Product/Offer markup.
    mainEntity: itemListJsonLd(summaries.map((p) => ({ url: `${site.url}/store/${p.slug}` }))),
  };

  return (
    <>
      <JsonLd id="store-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="store-collection" data={collectionJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              as="h1"
              eyebrow={`${inventoryCount.toLocaleString("en-US")} listings in the vault`}
              title="Graded comics for sale"
              lead="Every slab is cert-verified against the grader's census before listing, and every raw book is graded in-house with its defects photographed and disclosed. Buy now to check out immediately, or add to cart and keep browsing."
            />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">From</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{formatPrice(lowestPrice)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Eras</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{eras.length}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{freeShippingThreshold > 0 ? "Free shipping" : "Shipping"}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">
                  {freeShippingThreshold > 0 ? `${formatPrice(freeShippingThreshold)}+` : "Insured"}
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        {/* Keyed on the deep-link params so following a new link while on /store resets the filters. */}
        <StoreBrowser
          key={`${initialQuery} ${initialEra}`}
          products={summaries}
          eras={[...eras]}
          publishers={publishers}
          graders={[...graders]}
          initialQuery={initialQuery}
          initialEra={initialEra}
        />
      </Container>

      <section className="border-t border-ink-200">
        <Container className="py-12">
          <CollectionCards collections={collections} />
          <div className="mt-10">
            <PublisherChips publishers={publisherPages} />
          </div>
        </Container>
      </section>

      {/* SEO copy — real, useful context for the category page */}
      <section className="border-t border-ink-200 bg-ink-50">
        <Container className="py-14">
          <div className="prose-doc max-w-3xl">
            <h2>Buying graded comic books online</h2>
            <p>
              A graded comic is a book that has been authenticated, assessed on a 0.5–10.0 scale and sealed in a
              tamper-evident holder by a third-party grading company. The two that matter in the US market are{" "}
              <strong>CGC</strong> (Certified Guaranty Company) and <strong>CBCS</strong> (Comic Book Certification
              Service). Grading removes the two biggest risks in buying a comic sight-unseen: disagreement about
              condition, and undisclosed restoration.
            </p>
            <h3>What the label colour tells you</h3>
            <ul>
              <li>
                <strong>Universal (blue)</strong> — no restoration, no qualifying defects. This is the baseline and
                the most liquid label at resale.
              </li>
              <li>
                <strong>Signature Series (yellow)</strong> — signed with a grading-company witness present. Carries a
                premium over an unwitnessed signature, which is otherwise unverifiable.
              </li>
              <li>
                <strong>Restored (purple)</strong> — colour touch, glue, tear seals or trimming. Typically trades well
                below the same grade in blue.
              </li>
              <li>
                <strong>Qualified (green)</strong> — an otherwise universal book with one significant, disclosed
                defect such as a missing coupon.
              </li>
            </ul>
            <h3>Grade matters more than you think</h3>
            <p>
              For modern books, the market is concentrated almost entirely at 9.8. A 9.6 of the same issue can trade at
              a third of the 9.8 price. For Golden and Silver Age books the curve is flatter — scarcity does more work
              than condition — which is why a 6.0 Golden Age key can outperform a 9.8 modern. We list the census
              position on every high-value book so you can see where a copy sits in the surviving population.
            </p>
            <h3>How we price</h3>
            <p>
              Every listing is priced against realised public sales from the previous twelve months, adjusted for
              label type, page quality and census position — not against guide values, which lag the market by months.
              If you think a price is wrong, tell us which comparable you&apos;re looking at and we&apos;ll talk about it.
            </p>
            <h3>Buying with confidence</h3>
            <p>
              Orders ship double-boxed, signature-required and insured to full value
              {freeShippingThreshold > 0 ? `, free within the US above ${formatPrice(freeShippingThreshold)}` : ""}. You have {returnWindowDays} days from
              delivery to inspect any book and return it in its original holder for a full refund. Undisclosed restoration is refundable in full with no time limit under our{" "}
              <Link href="/policies/authenticity-guarantee">authenticity guarantee</Link>.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
