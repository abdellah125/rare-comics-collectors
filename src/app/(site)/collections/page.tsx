import type { Metadata } from "next";
import Link from "next/link";
import { PublisherChips } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { collectionCopy } from "@/lib/catalog/collection-copy";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Comic Collections by Era — Golden, Silver, Bronze, Copper & Modern Age",
  description: "Browse graded comics by era and collection: Golden Age, Silver Age, Bronze Age, Copper Age and Modern Age keys, raw books and complete sets. Cert-verified with insured shipping.",
  path: "/collections",
  keywords: ["golden age comics for sale", "silver age comics for sale", "bronze age comics for sale", "modern age comics 9.8", "comic book collections"],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Store", href: "/store" },
  { name: "Collections", href: "/collections" },
];

export default async function CollectionsPage() {
  const [collections, publishers] = await Promise.all([listCollections(), listPublishers()]);
  const total = collections.reduce((n, c) => n + c.count, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/collections#page`,
    name: "Comic collections by era",
    url: `${site.url}/collections`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(collections.map((c) => ({ url: `${site.url}/collections/${c.slug}`, name: c.name }))),
  };

  return (
    <>
      <JsonLd id="collections-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="collections-page" data={jsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6">
            <SectionHeading
              as="h1"
              eyebrow={`${collections.length} collections · ${total.toLocaleString("en-US")} listings`}
              title="Shop comics by era and collection"
              lead="Every era of the hobby, from the first Golden Age superheroes to modern 9.8 keys, plus raw books and complete sets. Each collection page lists only books that are in stock right now."
            />
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        {collections.length === 0 ? (
          <p className="text-sm text-ink-600">
            No collections have listings at the moment.{" "}
            <Link href="/store" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Browse the full store
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2">
            {collections.map((c) => {
              const copy = collectionCopy(c);
              return (
                <li key={c.slug}>
                  <article className="group relative flex h-full flex-col rounded-xl border border-ink-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
                      {c.count} listing{c.count === 1 ? "" : "s"}
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-ink-950">
                      <Link href={`/collections/${c.slug}`} className="hover:text-brand-700">
                        <span className="absolute inset-0" aria-hidden />
                        {c.name}
                      </Link>
                    </h2>
                    <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ink-600">{copy.summary}</p>
                    <p className="mt-5 text-[13px] font-semibold text-brand-700 group-hover:underline">Browse {c.shortName} →</p>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-14">
          <PublisherChips publishers={publishers} />
        </div>
      </Container>
    </>
  );
}

