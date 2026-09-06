import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { collectionCopy } from "@/lib/catalog/collection-copy";
import { collectionProducts, getCollection, listCollections, listPublishers } from "@/lib/catalog/collections";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection || collection.count === 0) {
    return pageMetadata({ title: "Collection not found", description: "This collection has no listings right now.", path: `/collections/${slug}`, noIndex: true });
  }
  const settings = await getSettings();
  const copy = collectionCopy(collection);
  return pageMetadata({
    title: collection.seoTitle,
    description: `${copy.summary} ${collection.count} in stock, cert-verified, insured shipping and a ${settings["commerce.returnWindowDays"]}-day return window.`.slice(0, 300),
    path: `/collections/${collection.slug}`,
    keywords: [`${collection.shortName.toLowerCase()} comics for sale`, `${collection.shortName.toLowerCase()} key issues`, `CGC ${collection.shortName.toLowerCase()} comics`, "graded comics for sale"],
  });
}

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection || collection.count === 0) notFound();

  const [products, collections, publishers, settings] = await Promise.all([collectionProducts(collection.id), listCollections(), listPublishers(), getSettings()]);
  const copy = collectionCopy(collection);
  const publishersHere = publishers.filter((p) => products.some((x) => x.publisher === p.name));
  const lowest = products.reduce((min, p) => Math.min(min, p.price), Number.POSITIVE_INFINITY);

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Store", href: "/store" },
    { name: collection.shortName, href: `/collections/${collection.slug}` },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/collections/${collection.slug}#page`,
    name: collection.seoTitle,
    description: copy.summary,
    url: `${site.url}/collections/${collection.slug}`,
    isPartOf: { "@id": `${site.url}/#website` },
    // Summary-page pattern: each entry points at a product page that carries the full Product/Offer markup.
    mainEntity: itemListJsonLd(products.map((p) => ({ url: `${site.url}/store/${p.slug}` }))),
  };

  return (
    <>
      <JsonLd id="collection-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="collection-page" data={jsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading as="h1" eyebrow={`Collection · ${products.length} listing${products.length === 1 ? "" : "s"}`} title={collection.name} lead={copy.summary} />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">From</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{Number.isFinite(lowest) ? formatPrice(lowest) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Returns</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{settings["commerce.returnWindowDays"] } days</dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.slug} product={p} priority={i < 4} />
          ))}
        </div>

        <p className="mt-8 text-sm text-ink-500">
          Want to filter by grade, grader or price?{" "}
          <Link href="/store" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            Use the full store browser
          </Link>
          .
        </p>

        {publishersHere.length > 0 && (
          <div className="mt-14">
            <PublisherChips publishers={publishersHere} heading={`Publishers in ${collection.shortName}`} />
          </div>
        )}

        <div className="mt-14">
          <CollectionCards collections={collections} current={collection.slug} heading="More collections" />
        </div>
      </Container>

      <section className="border-t border-ink-200 bg-ink-50">
        <Container className="py-14">
          <div className="prose-doc max-w-3xl">
            <h2>About {collection.shortName} comics</h2>
            {copy.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <p>
              Every book ships double-boxed, signature-required and insured to full value, and you have {settings["commerce.returnWindowDays"]} days from delivery to inspect it. Undisclosed restoration is refundable with no time limit under our{" "}
              <Link href="/policies/authenticity-guarantee">authenticity guarantee</Link>. Have {collection.shortName} books of your own to grade or sell?{" "}
              <Link href="/services/grading-submission">Start a grading submission</Link> or <Link href="/services/appraisal-and-valuation">request an appraisal</Link>.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
