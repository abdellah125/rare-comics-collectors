import type { Metadata } from "next";
import Link from "next/link";
import { CollectionCards } from "@/components/catalog-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Comics by Publisher — Marvel, DC and Independent Keys for Sale",
  description: "Browse graded comic books by publisher. Marvel, DC, Timely, Image and independent key issues, cert-verified with insured shipping and a full return window.",
  path: "/publishers",
  keywords: ["marvel comics for sale", "dc comics for sale", "graded marvel keys", "comics by publisher"],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Store", href: "/store" },
  { name: "Publishers", href: "/publishers" },
];

export default async function PublishersPage() {
  const [publishers, collections] = await Promise.all([listPublishers(), listCollections()]);
  const total = publishers.reduce((n, p) => n + p.count, 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/publishers#page`,
    name: "Comics by publisher",
    url: `${site.url}/publishers`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(publishers.map((p) => ({ url: `${site.url}/publishers/${p.slug}`, name: p.name }))),
  };

  return (
    <>
      <JsonLd id="publishers-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="publishers-page" data={jsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6">
            <SectionHeading
              as="h1"
              eyebrow={`${publishers.length} publishers · ${total.toLocaleString("en-US")} listings`}
              title="Shop comics by publisher"
              lead="Marvel, DC and the independents, grouped by the company that printed them. Each publisher page lists only books that are in stock right now."
            />
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        {publishers.length === 0 ? (
          <p className="text-sm text-ink-600">
            No listings at the moment.{" "}
            <Link href="/store" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Browse the full store
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {publishers.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/publishers/${p.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-ink-200 bg-white px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <span className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">{p.name}</span>
                  <span className="text-[13px] font-semibold text-ink-500 tabular-nums">
                    {p.count} listing{p.count === 1 ? "" : "s"} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-14">
          <CollectionCards collections={collections} />
        </div>
      </Container>
    </>
  );
}
