import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/link";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { collectionHref, listPublishers, publisherHref } from "@/lib/catalog/collections";
import { getPriceGuide } from "@/lib/catalog/price-guide";
import { formatDateTime } from "@/lib/i18n";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const range = (min: number, max: number) => (min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`);

export async function generateMetadata({ params }: PageProps<"/price-guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const g = await getPriceGuide(slug);
  if (!g) return pageMetadata({ title: "Price guide not found", description: "No copies of this issue are on sale right now.", path: `/price-guide/${slug}`, noIndex: true });
  const book = `${g.title} ${g.issue}`;
  return pageMetadata({
    title: `${book} Value & Price Guide`,
    description: `What ${book}${g.year ? ` (${g.year})` : ""} sells for by grade: ${g.copies} cop${g.copies === 1 ? "y" : "ies"} on sale from ${range(g.minPrice, g.maxPrice)}${g.keyIssue ? `. ${g.keyIssue.replace(/\.$/, "")}` : ""}.`,
    path: `/price-guide/${g.slug}`,
    keywords: [`${book} value`, `${book} price`, `${book} price guide`, `${book} CGC`, `how much is ${book} worth`],
  });
}

export default async function PriceGuidePage({ params }: PageProps<"/price-guide/[slug]">) {
  const { slug } = await params;
  const g = await getPriceGuide(slug);
  if (!g) notFound();
  const book = `${g.title} ${g.issue}`;
  const publisher = g.publisher ? (await listPublishers()).find((p) => p.name === g.publisher) ?? null : null;
  const eraSlug = g.products.find((p) => p.era)?.era?.toLowerCase().replace(/\s+/g, "-") ?? null;

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Price guide", href: "/price-guide" },
    { name: book, href: `/price-guide/${g.slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${site.url}/price-guide/${g.slug}#page`,
    name: `${book} value and price guide`,
    url: `${site.url}/price-guide/${g.slug}`,
    isPartOf: { "@id": `${site.url}/#website` },
    about: { "@type": "Book", name: book, ...(g.publisher ? { publisher: { "@type": "Organization", name: g.publisher } } : {}), ...(g.year ? { datePublished: String(g.year) } : {}) },
    mainEntity: itemListJsonLd(g.products.map((p) => ({ url: `${site.url}/store/${p.slug}` }))),
  };

  return (
    <>
      <JsonLd id="price-guide-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="price-guide-item" data={jsonLd} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-8 lg:py-12">
          <Breadcrumbs items={crumbs} />
          <SectionHeading
            as="h1"
            className="mt-5"
            eyebrow={[g.publisher, g.year ? String(g.year) : null].filter(Boolean).join(" · ") || "Price guide"}
            title={`${book} value & price guide`}
            lead={g.keyIssue ?? undefined}
          />
          {g.character && (
            <p className="mt-4 max-w-2xl text-sm text-ink-600">
              First appearance of{" "}
              <Link href={`/characters/${g.character.slug}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                {g.character.name}
              </Link>{" "}
              ({g.character.firstDate}), created by {g.character.creators}.{g.character.note ? ` ${g.character.note}` : ""}
            </p>
          )}
        </Container>
      </section>

      <Container className="py-8 lg:py-12">
        <div className="grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="by-grade">
            <h2 id="by-grade" className="font-display text-xl font-semibold text-ink-950">
              Asking prices by grade
            </h2>
            <p className="mt-1 text-[13px] text-ink-500">Copies of {book} on sale in our store right now.</p>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[11px] uppercase tracking-[0.12em] text-ink-500">
                  <th className="py-2 font-semibold">Grade</th>
                  <th className="py-2 font-semibold">Copies</th>
                  <th className="py-2 text-right font-semibold">Price</th>
                </tr>
              </thead>
              <tbody>
                {g.grades.map((r) => (
                  <tr key={r.grade} className="border-b border-ink-100">
                    <td className="py-2.5 font-medium text-ink-900">{r.grade}</td>
                    <td className="py-2.5 tabular-nums text-ink-600">{r.copies}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink-900">{range(r.minPrice, r.maxPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="sold-here">
            <h2 id="sold-here" className="font-display text-xl font-semibold text-ink-950">
              Sold on this site
            </h2>
            {g.sales.length === 0 ? (
              <p className="mt-3 text-sm text-ink-600">No sales of {book} have been recorded on this site yet.</p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 text-left text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="py-2 font-semibold">Date</th>
                    <th className="py-2 font-semibold">Grade</th>
                    <th className="py-2 text-right font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {g.sales.map((s, i) => (
                    <tr key={i} className="border-b border-ink-100">
                      <td className="py-2.5 text-ink-600">{formatDateTime(s.date, { dateOnly: true })}</td>
                      <td className="py-2.5 text-ink-900">{s.grade}</td>
                      <td className="py-2.5 text-right tabular-nums text-ink-900">{formatPrice(s.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              These are our own asking prices and sales, not auction results or a market estimate. Condition, page quality and the label change what a copy is worth; for a valuation of your copy, ask for a{" "}
              <Link href="/services/appraisal-and-valuation" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                free appraisal
              </Link>
              .
            </p>
          </section>
        </div>

        <section className="mt-14" aria-labelledby="copies">
          <h2 id="copies" className="font-display text-2xl font-semibold text-ink-950">
            {book} for sale
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {g.products.map((p, i) => (
              <ProductCard key={p.slug} product={p} priority={i < 2} deferPaint={i >= 4} />
            ))}
          </div>
        </section>

        <nav aria-label="More to browse" className="mt-14 flex flex-wrap gap-2 text-sm">
          {publisher && (
            <Link href={publisherHref(publisher.name)} className="rounded-lg border border-ink-200 bg-white px-3.5 py-2 font-semibold text-ink-900 hover:border-ink-400">
              All {publisher.name} comics
            </Link>
          )}
          {eraSlug && (
            <Link href={collectionHref(eraSlug)} className="rounded-lg border border-ink-200 bg-white px-3.5 py-2 font-semibold text-ink-900 hover:border-ink-400">
              More from this era
            </Link>
          )}
          <Link href="/price-guide" className="rounded-lg border border-ink-200 bg-white px-3.5 py-2 font-semibold text-ink-900 hover:border-ink-400">
            All key issues in the price guide
          </Link>
        </nav>
      </Container>
    </>
  );
}
