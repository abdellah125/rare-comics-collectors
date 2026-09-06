import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { getPublisher, listCollections, listPublishers, publisherProducts } from "@/lib/catalog/collections";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/publishers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const publisher = await getPublisher(slug);
  if (!publisher) return pageMetadata({ title: "Publisher not found", description: "No listings from this publisher right now.", path: `/publishers/${slug}`, noIndex: true });
  const settings = await getSettings();
  return pageMetadata({
    title: `${publisher.name} Comics for Sale — Graded Key Issues`,
    description: `${publisher.count} ${publisher.name} comic book${publisher.count === 1 ? "" : "s"} for sale: CGC and CBCS graded keys plus honestly graded raw copies. Cert-verified, insured shipping and a ${settings["commerce.returnWindowDays"]}-day return window from ${site.name}.`,
    path: `/publishers/${publisher.slug}`,
    keywords: [`${publisher.name} comics for sale`, `${publisher.name} key issues`, `CGC ${publisher.name} comics`, "graded comics for sale"],
  });
}

export default async function PublisherPage({ params }: PageProps<"/publishers/[slug]">) {
  const { slug } = await params;
  const publisher = await getPublisher(slug);
  if (!publisher) notFound();

  const [products, collections, publishers, settings] = await Promise.all([publisherProducts(publisher.name), listCollections(), listPublishers(), getSettings()]);
  const years = products.map((p) => p.year);
  const span = years.length > 0 ? `${Math.min(...years)}–${Math.max(...years)}` : null;
  const lowest = products.reduce((min, p) => Math.min(min, p.price), Number.POSITIVE_INFINITY);
  const eras = [...new Set(products.map((p) => p.era))];

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
    name: `${publisher.name} comics for sale`,
    url: `${site.url}/publishers/${publisher.slug}`,
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
              eyebrow={`Publisher · ${products.length} listing${products.length === 1 ? "" : "s"}`}
              title={`${publisher.name} comics`}
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p, i) => (
            <ProductCard key={p.slug} product={p} priority={i < 4} />
          ))}
        </div>

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
      </Container>
    </>
  );
}
