import type { Metadata } from "next";
import Link from "@/components/link";
import { notFound } from "next/navigation";
import { GuideGrid } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { CATEGORIES, categoryBySlug } from "@/lib/content/categories";
import { categoryCounts, listGuides } from "@/lib/guides/data";
import { topicBySlug } from "@/lib/guides/topics";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

const pageOf = (v: string | string[] | undefined) => Math.max(1, Math.min(500, Number.parseInt(typeof v === "string" ? v : "1", 10) || 1));

export async function generateMetadata({ params, searchParams }: PageProps<"/guides/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = categoryBySlug(slug);
  if (!c) return pageMetadata({ title: "Category not found", description: "", path: `/guides/category/${slug}`, noIndex: true });
  const page = pageOf((await searchParams).page);
  const count = (await categoryCounts())[c.slug] ?? 0;
  // A category with nothing in it yet is not offered to search engines.
  return pageMetadata({ title: `${c.name}${page > 1 ? `, page ${page}` : ""}: Comic Guides and Articles`, description: c.description, path: `/guides/category/${c.slug}${page > 1 ? `?page=${page}` : ""}`, noIndex: count === 0 });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/guides/category/[slug]">) {
  const { slug } = await params;
  const c = categoryBySlug(slug);
  if (!c) notFound();
  const page = pageOf((await searchParams).page);
  const [{ items, total }, counts] = await Promise.all([listGuides({ category: c.slug, take: PER_PAGE, skip: (page - 1) * PER_PAGE, order: c.fresh ? "event" : "latest" }), categoryCounts()]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages) notFound();
  const topic = topicBySlug(c.topic);

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/guides" },
    { name: c.name, href: `/guides/category/${c.slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/guides/category/${c.slug}#page`,
    name: c.name,
    description: c.description,
    url: `${site.url}/guides/category/${c.slug}`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(items.map((g) => ({ url: `${site.url}/guides/${g.slug}`, name: g.title }))),
  };
  const related = CATEGORIES.filter((o) => o.slug !== c.slug && (counts[o.slug] ?? 0) > 0).sort((a, b) => Number(b.topic === c.topic) - Number(a.topic === c.topic));

  return (
    <>
      <JsonLd id="category-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      {items.length > 0 && <JsonLd id="category-page" data={jsonLd} />}
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6">
            <SectionHeading as="h1" eyebrow={`${c.icon} ${total.toLocaleString("en-US")} article${total === 1 ? "" : "s"}`} title={c.name} lead={c.description} />
          </div>
        </Container>
      </section>
      <Container className="py-10 lg:py-14">
        {items.length === 0 ? <p className="text-[15px] text-ink-600">Articles for this category are on their way.</p> : <GuideGrid guides={items} />}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm text-ink-600">
            {page > 1 ? (
              <Link href={`/guides/category/${c.slug}${page - 1 > 1 ? `?page=${page - 1}` : ""}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={`/guides/category/${c.slug}?page=${page + 1}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <nav aria-label="Related topics" className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-ink-950">Related topics</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {topic && (
              <li>
                <Link href={`/guides/topics/${topic.slug}`} className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-sm font-medium text-brand-800 hover:border-brand-300">
                  {topic.name}
                </Link>
              </li>
            )}
            {related.map((o) => (
              <li key={o.slug}>
                <Link href={`/guides/category/${o.slug}`} className="inline-flex rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                  <span aria-hidden className="mr-1.5">
                    {o.icon}
                  </span>
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </>
  );
}
