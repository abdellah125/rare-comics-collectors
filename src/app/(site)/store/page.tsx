import type { Metadata } from "next";

import { StoreBrowser } from "@/components/store-browser";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { storeFacets } from "@/lib/catalog/products";
import { parseStoreFilters } from "@/lib/catalog/store-filters";
import { searchStore } from "@/lib/catalog/store-search";
import { formatPrice } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { Rich } from "@/components/rich";
import { getTranslator } from "@/lib/i18n";
import { msg } from "@/lib/i18n/translate";
import { localizedMetadata } from "@/lib/seo-i18n";
import { site } from "@/lib/site";

/** Translated page: each language version is canonical for itself and lists the others (hreflang). */
export async function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
  title: msg("Graded Comics for Sale — CGC & CBCS Key Issues"),
  description: msg("Browse CGC-graded Golden Age and Silver Age key issues for sale. Cert-verified, restoration-checked, insured shipping and a 14-day return window. Buy now or add to cart."),
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
}

export default async function StorePage({ searchParams }: PageProps<"/store">) {
  // The filters live in the address (/store?q=…&era=…&sort=…) and the search runs here, in the
  // database: the page carries only the cards it shows, however large the catalogue is.
  const sp = await searchParams;
  const tr = await getTranslator();
  const crumbs: Crumb[] = [
    { name: tr("Home"), href: "/" },
    { name: tr("Store"), href: "/store" },
  ];
  const asked = parseStoreFilters(sp);
  const [facets, settings, collections, publisherPages] = await Promise.all([storeFacets(), getSettings(), listCollections(), listPublishers()]);
  // A filter value the catalogue does not have (an old or mistyped link) is dropped, not matched against nothing.
  const filters = {
    ...asked,
    era: (facets.eras as string[]).includes(asked.era) ? asked.era : "",
    publisher: facets.publishers.includes(asked.publisher) ? asked.publisher : "",
    grader: (facets.graders as string[]).includes(asked.grader) ? asked.grader : "",
  };
  const { products: shown, total } = await searchStore(filters);
  const freeShippingThreshold = settings["commerce.freeShippingThreshold"];
  const returnWindowDays = settings["commerce.returnWindowDays"];
  const { eras, publishers, graders, lowestPrice } = facets;
  const inventoryCount = facets.count;


  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: tr("Graded comics for sale"),
    description: tr("CGC and CBCS graded comic books for sale, plus honestly graded raw books with full defect disclosure."),
    url: `${site.url}/store`,
    isPartOf: { "@id": `${site.url}/#website` },
    // Summary-page pattern: each entry links to the product page that carries the full Product/Offer markup.
    // Every product is also in the sitemap; listing thousands of addresses here only made the page heavy.
    mainEntity: itemListJsonLd(shown.map((p) => ({ url: `${site.url}/store/${p.slug}` }))),
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
              eyebrow={tr("{count} listings in the vault", { count: inventoryCount.toLocaleString("en-US") })}
              title={tr("Graded comics for sale")}
              lead={tr("Every slab is cert-verified against the grader's census before listing, and every raw book is graded in-house with its defects photographed and disclosed. Buy now to check out immediately, or add to cart and keep browsing.")}
            />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("From")}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{formatPrice(lowestPrice)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{tr("Eras")}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{eras.length}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{freeShippingThreshold > 0 ? tr("Free shipping") : tr("Shipping")}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">
                  {freeShippingThreshold > 0 ? `${formatPrice(freeShippingThreshold)}+` : tr("Insured")}
                </dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        <StoreBrowser products={shown} total={total} filters={filters} eras={[...eras]} publishers={publishers} graders={[...graders]} />
      </Container>

      <section className="below-fold border-t border-ink-200">
        <Container className="py-12">
          <CollectionCards collections={collections} />
          <div className="mt-10">
            <PublisherChips publishers={publisherPages} />
          </div>
        </Container>
      </section>

      {/* SEO copy — real, useful context for the category page */}
      <section className="below-fold border-t border-ink-200 bg-ink-50">
        <Container className="py-14">
          <div className="prose-doc max-w-3xl">
            <h2>{tr("Buying graded comic books online")}</h2>
            <p>
              <Rich text={tr("A graded comic is a book that has been authenticated, assessed on a 0.5–10.0 scale and sealed in a tamper-evident holder by a third-party grading company. The two that matter in the US market are <b>CGC</b> (Certified Guaranty Company) and <b>CBCS</b> (Comic Book Certification Service). Grading removes the two biggest risks in buying a comic sight-unseen: disagreement about condition, and undisclosed restoration.")} />
            </p>
            <h3>{tr("What the label colour tells you")}</h3>
            <ul>
              <li>
                <Rich text={tr("<b>Universal (blue)</b> — no restoration, no qualifying defects. This is the baseline and the most liquid label at resale.")} />
              </li>
              <li>
                <Rich text={tr("<b>Signature Series (yellow)</b> — signed with a grading-company witness present. Carries a premium over an unwitnessed signature, which is otherwise unverifiable.")} />
              </li>
              <li>
                <Rich text={tr("<b>Restored (purple)</b> — colour touch, glue, tear seals or trimming. Typically trades well below the same grade in blue.")} />
              </li>
              <li>
                <Rich text={tr("<b>Qualified (green)</b> — an otherwise universal book with one significant, disclosed defect such as a missing coupon.")} />
              </li>
            </ul>
            <h3>{tr("Grade matters more than you think")}</h3>
            <p>
              {tr("For modern books, the market is concentrated almost entirely at 9.8. A 9.6 of the same issue can trade at a third of the 9.8 price. For Golden and Silver Age books the curve is flatter — scarcity does more work than condition — which is why a 6.0 Golden Age key can outperform a 9.8 modern. We list the census position on every high-value book so you can see where a copy sits in the surviving population.")}
            </p>
            <h3>{tr("How we price")}</h3>
            <p>
              {tr("Every listing is priced against realised public sales from the previous twelve months, adjusted for label type, page quality and census position — not against guide values, which lag the market by months. If you think a price is wrong, tell us which comparable you're looking at and we'll talk about it.")}
            </p>
            <h3>{tr("Buying with confidence")}</h3>
            <p>
              {freeShippingThreshold > 0
                ? tr("Orders ship double-boxed, signature-required and insured to full value, free within the US above {amount}.", { amount: formatPrice(freeShippingThreshold) })
                : tr("Orders ship double-boxed, signature-required and insured to full value.")}{" "}
              <Rich
                text={tr("You have {days} days from delivery to inspect any book and return it in its original holder for a full refund. Undisclosed restoration is refundable in full with no time limit under our <a>authenticity guarantee</a>.", { days: returnWindowDays })}
                hrefs={["/policies/authenticity-guarantee"]}
              />
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
