import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { HubPagination, pageHref, readPage } from "@/components/hub-pagination";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { listPriceGuides } from "@/lib/catalog/price-guide";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Key issues per page of the index. */
const PER_PAGE = 120;

export async function generateMetadata({ searchParams }: PageProps<"/price-guide">): Promise<Metadata> {
  const guides = await listPriceGuides();
  const pages = Math.max(1, Math.ceil(guides.length / PER_PAGE));
  const page = readPage((await searchParams).page, pages);
  if (page === null) return pageMetadata({ title: "Price guide", description: "This page does not exist.", path: "/price-guide", noIndex: true });
  return pageMetadata({
    title: page > 1 ? `Comic Book Price Guide — Key Issues, Page ${page}` : "Comic Book Price Guide — Key Issues",
    description: `Asking prices by grade for ${guides.length.toLocaleString("en-US")} key issue comics on sale now, from the copies in our store, with the sales completed on this site.`,
    path: pageHref("/price-guide", page),
    keywords: ["comic book price guide", "key issue comic values", "CGC comic prices", "what is my comic worth"],
  });
}

export default async function PriceGuideIndex({ searchParams }: PageProps<"/price-guide">) {
  const guides = await listPriceGuides();
  const pages = Math.max(1, Math.ceil(guides.length / PER_PAGE));
  const page = readPage((await searchParams).page, pages);
  if (page === null) notFound();
  const shown = guides.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Price guide", href: "/price-guide" },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/price-guide#page`,
    name: "Comic book price guide — key issues",
    url: `${site.url}${pageHref("/price-guide", page)}`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(shown.map((g) => ({ url: `${site.url}/price-guide/${g.slug}`, name: `${g.title} ${g.issue}` }))),
  };

  return (
    <>
      <JsonLd id="price-guide-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="price-guide-page" data={jsonLd} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs items={crumbs} />
          <SectionHeading
            as="h1"
            className="mt-5"
            eyebrow={`${guides.length.toLocaleString("en-US")} key issues`}
            title="Comic book price guide"
            lead="What key issues sell for here, grade by grade: the asking prices of the copies in our store right now and the sales completed on this site. These are our own prices, not auction results or an estimate of market value."
          />
        </Container>
      </section>
      <Container className="py-8 lg:py-12">
        {shown.length === 0 ? (
          <p className="text-sm text-ink-600">No key issues are on sale right now.</p>
        ) : (
          <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((g) => (
              <li key={g.slug} className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-2.5 text-sm">
                <Link href={`/price-guide/${g.slug}`} className="font-medium text-ink-900 hover:text-brand-700">
                  {g.title} {g.issue}
                </Link>
                <span className="shrink-0 text-[13px] tabular-nums text-ink-500">
                  {g.minPrice === g.maxPrice ? formatPrice(g.minPrice) : `${formatPrice(g.minPrice)}–${formatPrice(g.maxPrice)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <HubPagination base="/price-guide" page={page} pages={pages} label="Price guide pages" />
      </Container>
    </>
  );
}
