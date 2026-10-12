import type { Metadata } from "next";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { HubPagination, pageHref, readPage } from "@/components/hub-pagination";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { RelatedGuides } from "@/components/guide-links";
import { guidesForPublisher } from "@/lib/guides/data";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { HUB_PAGE_SIZE, getPublisher, hubPages, listCollections, listPublishers, lowestPrice, publisherProducts, publisherSpan } from "@/lib/catalog/collections";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** "Marvel Comics" already says comics; "Timely" does not. */
const publisherLabel = (name: string) => (/comics?$/i.test(name.trim()) ? name : `${name} Comics`);

export async function generateMetadata({ params, searchParams }: PageProps<"/publishers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const publisher = await getPublisher(slug);
  const page = publisher ? readPage((await searchParams).page, hubPages(publisher.count)) : null;
  if (!publisher || page === null) return pageMetadata({ title: "Publisher not found", description: "No listings from this publisher right now.", path: `/publishers/${slug}`, noIndex: true });
  const settings = await getSettings();
  const pages = hubPages(publisher.count);
  return pageMetadata({
    title: page > 1 ? `${publisherLabel(publisher.name)} for Sale — Page ${page} of ${pages}` : `${publisherLabel(publisher.name)} for Sale — Graded Key Issues`,
    description: `${page > 1 ? `Page ${page} of ${pages}. ` : ""}${publisher.count.toLocaleString("en-US")} ${publisher.name} comic book${publisher.count === 1 ? "" : "s"} for sale: CGC and CBCS graded keys and raw copies. Free insured US shipping and ${settings["commerce.returnWindowDays"]}-day returns.`,
    path: pageHref(`/publishers/${publisher.slug}`, page),
    keywords: [`${publisher.name} comics for sale`, `${publisher.name} key issues`, `CGC ${publisher.name} comics`, "graded comics for sale"],
  });
}

export default async function PublisherPage({ params, searchParams }: PageProps<"/publishers/[slug]">) {
  const { slug } = await params;
  const publisher = await getPublisher(slug);
  if (!publisher) notFound();
  const pages = hubPages(publisher.count);
  const page = readPage((await searchParams).page, pages);
  if (page === null) notFound();
  const base = `/publishers/${publisher.slug}`;

  const [products, collections, publishers, settings, guides, years, lowestForPublisher] = await Promise.all([publisherProducts(publisher.name, page), listCollections(), listPublishers(), getSettings(), guidesForPublisher(publisher.name), publisherSpan(publisher.name), lowestPrice({ publisher: publisher.name })]);
  const span = years.minYear !== null && years.maxYear !== null ? `${years.minYear}–${years.maxYear}` : null;
  const lowest = lowestForPublisher ?? Number.POSITIVE_INFINITY;
  const eras = years.eras;

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Store", href: "/store" },
    { name: "Publishers", href: "/publishers" },
    { name: publisher.name, href: `/publishers/${publisher.slug}` },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/publishers/${publisher.slug}#page`,
    name: `${publisherLabel(publisher.name)} for sale`,
    url: `${site.url}${pageHref(base, page)}`,
    isPartOf: { "@id": `${site.url}/#website` },
    about: { "@type": "Organization", name: publisher.name },
    mainEntity: itemListJsonLd(products.map((p) => ({ url: `${site.url}/store/${p.slug}` }))),
  };

  return (
    <>
      <JsonLd id="publisher-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="publisher-page" data={jsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              as="h1"
              eyebrow={`Publisher · ${publisher.count.toLocaleString("en-US")} listing${publisher.count === 1 ? "" : "s"}`}
              title={publisherLabel(publisher.name)}
              lead={`Graded and raw ${publisher.name} books${span ? ` from ${span}` : ""}${eras.length > 0 ? `, spanning the ${eras.join(", ")}` : ""}. Every slab is cert-verified before listing and every raw copy is graded in-house with its defects disclosed.`}
            />
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">From</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{Number.isFinite(lowest) ? formatPrice(lowest) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Returns</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink-950">{settings["commerce.returnWindowDays"]} days</dd>
              </div>
            </dl>
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.slug} product={p} priority={i < 2} deferPaint={i >= 4} />
          ))}
        </div>

        <HubPagination base={base} page={page} pages={pages} label={`${publisher.name} pages`} />

        {pages > 1 && (
          <p className="mt-8 text-sm text-ink-500">
            Showing {((page - 1) * HUB_PAGE_SIZE + 1).toLocaleString("en-US")}–{((page - 1) * HUB_PAGE_SIZE + products.length).toLocaleString("en-US")} of {publisher.count.toLocaleString("en-US")} listings.{" "}
            <Link href="/store" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Browse and filter all of them in the store
            </Link>
            .
          </p>
        )}

        <p className="mt-8 text-sm text-ink-500">
          Looking for a specific {publisher.name} issue we don&apos;t have listed?{" "}
          <Link href="/contact" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            Send us a want list
          </Link>{" "}
          — we source books privately for clients every week.
        </p>

        <div className="mt-14">
          <PublisherChips publishers={publishers} current={publisher.slug} heading="Other publishers" />
        </div>

        <div className="mt-14">
          <CollectionCards collections={collections} />
        </div>
        {guides.length > 0 && (
          <div className="mt-14">
            <RelatedGuides guides={guides} heading={`${publisher.name} guides`} />
          </div>
        )}
      </Container>
    </>
  );
}
