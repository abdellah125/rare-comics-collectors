import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideGrid } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { listGuides } from "@/lib/guides/data";
import { GUIDE_TOPICS, topicBySlug } from "@/lib/guides/topics";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

export async function generateMetadata({ params, searchParams }: PageProps<"/guides/topics/[topic]">): Promise<Metadata> {
  const { topic } = await params;
  const t = topicBySlug(topic);
  if (!t) return pageMetadata({ title: "Topic not found", description: "", path: `/guides/topics/${topic}`, noIndex: true });
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  return pageMetadata({ title: `${t.name}${page > 1 ? ` — page ${page}` : ""} — Comic Collecting Guides`, description: t.description, path: `/guides/topics/${t.slug}${page > 1 ? `?page=${page}` : ""}` });
}

export default async function TopicPage({ params, searchParams }: PageProps<"/guides/topics/[topic]">) {
  const { topic } = await params;
  const t = topicBySlug(topic);
  if (!t) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const { items, total } = await listGuides({ topic: t.slug, take: PER_PAGE, skip: (page - 1) * PER_PAGE, order: t.slug === "news" ? "event" : "latest" });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages) notFound();

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/guides" },
    { name: t.name, href: `/guides/topics/${t.slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/guides/topics/${t.slug}#page`,
    name: t.name,
    description: t.description,
    url: `${site.url}/guides/topics/${t.slug}`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(items.map((g) => ({ url: `${site.url}/guides/${g.slug}`, name: g.title }))),
  };

  return (
    <>
      <JsonLd id="topic-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="topic-page" data={jsonLd} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6">
            <SectionHeading as="h1" eyebrow={`Guides · ${total} article${total === 1 ? "" : "s"}`} title={t.name} lead={t.description} />
          </div>
        </Container>
      </section>
      <Container className="py-10 lg:py-14">
        {items.length === 0 ? (
          <p className="text-[15px] text-ink-600">Guides for this topic are on their way.</p>
        ) : (
          <GuideGrid guides={items} />
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm text-ink-600">
            {page > 1 ? (
              <Link href={`/guides/topics/${t.slug}${page - 1 > 1 ? `?page=${page - 1}` : ""}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={`/guides/topics/${t.slug}?page=${page + 1}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <nav aria-label="Other topics" className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-ink-950">Other topics</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {GUIDE_TOPICS.filter((o) => o.slug !== t.slug).map((o) => (
              <li key={o.slug}>
                <Link href={`/guides/topics/${o.slug}`} className="inline-flex rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
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
