import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideGrid } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, type Crumb } from "@/components/ui";
import { slugify } from "@/lib/validation";
import { getGuide, productsForGuide, relatedGuides, topicName } from "@/lib/guides/data";
import { characterFact } from "@/lib/guides/characters";
import { Markdown, outline, plainText } from "@/lib/guides/markdown";
import { formatDateTime } from "@/lib/i18n";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) return pageMetadata({ title: "Guide not found", description: "This guide is not available.", path: `/guides/${slug}`, noIndex: true });
  return {
    ...pageMetadata({ title: guide.title, description: guide.answer.length > 160 ? `${guide.answer.slice(0, 157).replace(/\s+\S*$/, "")}…` : guide.answer, path: `/guides/${guide.slug}`, type: "article", keywords: [...guide.tags, ...guide.characters, ...guide.titles].slice(0, 10) }),
    other: { "article:published_time": guide.publishedAt?.toISOString() ?? "", "article:modified_time": guide.updatedAt.toISOString(), "article:section": topicName(guide.topic) },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = await getGuide(slug);
  if (!guide) notFound();
  const [related, products] = await Promise.all([relatedGuides(guide), productsForGuide(guide)]);
  const toc = outline(guide.body).filter((h) => h.level === 2);
  const words = plainText(guide.body).split(" ").length;
  const facts = guide.characters.map((c) => characterFact(c)).filter((f): f is NonNullable<typeof f> => f !== null).slice(0, 3);

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Guides", href: "/guides" },
    { name: topicName(guide.topic), href: `/guides/topics/${guide.topic}` },
    { name: guide.title, href: `/guides/${guide.slug}` },
  ];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${site.url}/guides/${guide.slug}#article`,
    headline: guide.title,
    description: guide.answer,
    articleSection: topicName(guide.topic),
    keywords: [...guide.tags, ...guide.characters, ...guide.titles].join(", ") || undefined,
    wordCount: words,
    inLanguage: "en-US",
    datePublished: guide.publishedAt?.toISOString(),
    dateModified: guide.updatedAt.toISOString(),
    author: guide.authorName ? { "@type": "Person", name: guide.authorName, worksFor: { "@id": `${site.url}/#organization` } } : { "@id": `${site.url}/#organization` },
    publisher: { "@id": `${site.url}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${site.url}/guides/${guide.slug}` },
    image: [`${site.url}/api/og?title=${encodeURIComponent(guide.title)}`],
    isPartOf: { "@id": `${site.url}/#website` },
    ...(guide.characters.length ? { about: guide.characters.map((c) => ({ "@type": "Thing", name: c })) } : {}),
  };

  return (
    <>
      <JsonLd id="guide-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="guide-article" data={articleJsonLd} />
      {guide.faq.length > 0 && <JsonLd id="guide-faq" data={faqJsonLd(guide.faq)} />}

      <Container className="py-8 lg:py-10">
        <Breadcrumbs items={crumbs} />
        <article className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-8">
            <header>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">
                <Link href={`/guides/topics/${guide.topic}`} className="hover:underline">
                  {topicName(guide.topic)}
                </Link>
              </p>
              <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">{guide.title}</h1>
              <p className="mt-3 text-[13px] text-ink-500">
                {guide.publishedAt && <>Published {formatDateTime(guide.publishedAt, { dateOnly: true })} · </>}Updated {formatDateTime(guide.updatedAt, { dateOnly: true })}
                {guide.eventDate && <> · Event date {formatDateTime(guide.eventDate, { dateOnly: true })}</>} · {Math.max(1, Math.round(words / 220))} min read
              </p>
              <p className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5 text-[16px] leading-relaxed text-ink-900">
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Short answer</span>
                <span className="mt-1.5 block">{guide.answer}</span>
              </p>
            </header>

            {toc.length >= 3 && (
              <nav aria-label="In this guide" className="mt-6 rounded-xl border border-ink-200 bg-ink-50 p-4 text-[14px]">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">In this guide</p>
                <ol className="mt-2 grid gap-1 sm:grid-cols-2">
                  {toc.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="text-ink-700 underline-offset-4 hover:text-brand-700 hover:underline">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="prose-doc mt-8">
              <Markdown source={guide.body} />
            </div>

            {guide.faq.length > 0 && (
              <section className="mt-10" aria-labelledby="guide-faq-heading">
                <h2 id="guide-faq-heading" className="font-display text-2xl font-semibold text-ink-950">
                  Frequently asked
                </h2>
                <dl className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200">
                  {guide.faq.map((f) => (
                    <div key={f.q} className="p-5">
                      <dt className="font-semibold text-ink-950">{f.q}</dt>
                      <dd className="mt-2 text-[15px] leading-relaxed text-ink-700">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {guide.sources.length > 0 && (
              <section className="mt-10" aria-labelledby="guide-sources-heading">
                <h2 id="guide-sources-heading" className="text-sm font-semibold text-ink-950">
                  Sources and further reading
                </h2>
                <ul className="mt-2 grid gap-1 text-[14px] text-ink-700">
                  {guide.sources.map((s) => (
                    <li key={s.label}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-brand-700 hover:underline">
                          {s.label}
                        </a>
                      ) : (
                        s.label
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="mt-10 text-[13px] text-ink-500">
              Written by the {site.name} grading team. Spotted an error or have a question this guide does not answer?{" "}
              <Link href="/contact" className="font-medium text-brand-700 underline-offset-2 hover:underline">
                Tell us
              </Link>
              .
            </p>
          </div>

          <aside className="lg:col-span-4">
            {facts.length > 0 && (
              <div className="rounded-xl border border-ink-200 bg-white p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">First appearance</p>
                {facts.map((f) => (
                  <dl key={f.slug} className="mt-3 grid gap-1.5 text-[14px] [&:not(:first-of-type)]:mt-5 [&:not(:first-of-type)]:border-t [&:not(:first-of-type)]:border-ink-100 [&:not(:first-of-type)]:pt-4">
                    <div>
                      <dt className="sr-only">Character</dt>
                      <dd className="font-display text-lg font-semibold text-ink-950">
                        <Link href={`/characters/${f.slug}`} className="hover:text-brand-700">
                          {f.name}
                        </Link>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-500">Issue</dt>
                      <dd className="text-right font-medium text-ink-900">
                        {f.firstTitle} {f.firstIssue}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-500">Cover date</dt>
                      <dd className="text-right font-medium text-ink-900">{f.firstDate}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-500">Publisher</dt>
                      <dd className="text-right font-medium text-ink-900">
                        <Link href={`/publishers/${slugify(f.publisher)}`} className="hover:text-brand-700">
                          {f.publisher}
                        </Link>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-500">Creators</dt>
                      <dd className="text-right font-medium text-ink-900">{f.creators}</dd>
                    </div>
                  </dl>
                ))}
              </div>
            )}

            {(guide.characters.length > 0 || guide.publishers.length > 0 || guide.titles.length > 0) && (
              <div className={`rounded-xl border border-ink-200 bg-white p-5 ${facts.length ? "mt-5" : ""}`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Explore</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {guide.characters.map((c) => (
                    <li key={`c-${c}`}>
                      <Link href={`/characters/${characterFact(c)?.slug ?? slugify(c)}`} className="inline-flex rounded-full border border-ink-200 px-3 py-1 text-[13px] font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                        {c}
                      </Link>
                    </li>
                  ))}
                  {guide.publishers.map((p) => (
                    <li key={`p-${p}`}>
                      <Link href={`/publishers/${slugify(p)}`} className="inline-flex rounded-full border border-ink-200 px-3 py-1 text-[13px] font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                        {p}
                      </Link>
                    </li>
                  ))}
                  {guide.titles.map((t) => (
                    <li key={`t-${t}`}>
                      <Link href={`/store?q=${encodeURIComponent(t)}`} className="inline-flex rounded-full border border-ink-200 px-3 py-1 text-[13px] font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                        {t} listings
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50 p-5">
              <h2 className="font-display text-lg font-semibold text-ink-950">Have a book to grade or sell?</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
                We pre-screen, press and submit to CGC and CBCS at dealer rates, and consign graded books to collectors worldwide.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/services/grading-submission" className="rounded-lg bg-ink-950 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-ink-800">
                  Grading submission
                </Link>
                <Link href="/services/appraisal-and-valuation" className="rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-900 hover:bg-ink-50">
                  Free appraisal
                </Link>
              </div>
            </div>
          </aside>
        </article>

        {products.length > 0 && (
          <section className="mt-16" aria-labelledby="guide-products-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="guide-products-heading" className="font-display text-2xl font-semibold text-ink-950">
                In the vault right now
              </h2>
              <Link href="/store" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
                Browse all listings →
              </Link>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-16" aria-labelledby="guide-related-heading">
            <h2 id="guide-related-heading" className="font-display text-2xl font-semibold text-ink-950">
              Keep reading
            </h2>
            <div className="mt-6">
              <GuideGrid guides={related} compact columns={3} />
            </div>
          </section>
        )}
      </Container>
    </>
  );
}
