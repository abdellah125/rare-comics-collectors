import type { Metadata } from "next";
import Link from "next/link";
import { GuideGrid } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { guideCount, listCharacters, listGuides, topicCounts } from "@/lib/guides/data";
import { GUIDE_TOPICS } from "@/lib/guides/topics";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Guides", href: "/guides" },
];

export async function generateMetadata({ searchParams }: PageProps<"/guides">): Promise<Metadata> {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  if (q) return pageMetadata({ title: `Guides matching “${q}”`, description: `Knowledge-base articles about ${q}.`, path: "/guides", noIndex: true });
  return pageMetadata({
    title: "Comic Collecting Guides — Grading, Key Issues, First Appearances & Values",
    description: "Plain-English answers for comic collectors: how CGC and CBCS grading works, what the comic ages mean, where characters first appeared, what drives a book's value and how to buy, sell, store and ship graded comics.",
    path: "/guides",
    keywords: ["comic collecting guide", "what is a CGC graded comic", "how are comics graded", "comic first appearances", "how much is my comic worth", "comic book grading explained"],
  });
}

export default async function GuidesPage({ searchParams }: PageProps<"/guides">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const [counts, total, latest, characters, results] = await Promise.all([topicCounts(), guideCount(), listGuides({ take: 12 }), listCharacters(), q ? listGuides({ q, take: 40 }) : Promise.resolve(null)]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/guides#page`,
    name: "Comic collecting guides",
    url: `${site.url}/guides`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(GUIDE_TOPICS.map((t) => ({ url: `${site.url}/guides/topics/${t.slug}`, name: t.name }))),
  };

  return (
    <>
      <JsonLd id="guides-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      {!q && <JsonLd id="guides-page" data={jsonLd} />}

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              as="h1"
              eyebrow={`${total.toLocaleString("en-US")} guides · ${GUIDE_TOPICS.length} topics`}
              title="Comic collecting guides"
              lead="Straight answers to the questions collectors actually search for: grading, the comic ages, first appearances, values, storage and selling. Every guide opens with the answer and links to the books it talks about."
            />
            <form action="/guides" method="get" role="search" className="flex w-full max-w-md gap-2">
              <label htmlFor="guide-q" className="sr-only">
                Search the guides
              </label>
              <input id="guide-q" name="q" type="search" defaultValue={q} placeholder="Search: CGC 9.8, first appearance, Silver Age…" className="h-11 flex-1 rounded-lg border border-ink-300 bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-brand-500" />
              <button type="submit" className="h-11 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white hover:bg-ink-800">
                Search
              </button>
            </form>
          </div>
        </Container>
      </section>

      <Container className="py-10 lg:py-14">
        {results ? (
          <section aria-labelledby="results-heading">
            <h2 id="results-heading" className="font-display text-2xl font-semibold text-ink-950">
              {results.total === 0 ? `Nothing matched “${q}”` : `${results.total} guide${results.total === 1 ? "" : "s"} matching “${q}”`}
            </h2>
            {results.total === 0 ? (
              <p className="mt-3 text-[15px] text-ink-600">
                Try a character, a title or a grading term — or{" "}
                <Link href="/contact" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                  ask us directly
                </Link>{" "}
                and we will write the answer up.
              </p>
            ) : (
              <div className="mt-6">
                <GuideGrid guides={results.items} />
              </div>
            )}
            <p className="mt-8">
              <Link href="/guides" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
                ← Browse all topics
              </Link>
            </p>
          </section>
        ) : (
          <>
            <section aria-labelledby="topics-heading">
              <h2 id="topics-heading" className="font-display text-2xl font-semibold text-ink-950">
                Browse by topic
              </h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {GUIDE_TOPICS.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/guides/topics/${t.slug}`} className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                      <span className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">{t.name}</span>
                      <span className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-600">{t.description}</span>
                      <span className="mt-4 text-[13px] font-semibold text-brand-700">
                        {counts[t.slug] ?? 0} guide{(counts[t.slug] ?? 0) === 1 ? "" : "s"} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {latest.items.length > 0 && (
              <section className="mt-14" aria-labelledby="latest-heading">
                <h2 id="latest-heading" className="font-display text-2xl font-semibold text-ink-950">
                  Latest guides
                </h2>
                <div className="mt-5">
                  <GuideGrid guides={latest.items} compact columns={4} />
                </div>
              </section>
            )}

            {characters.length > 0 && (
              <section className="mt-14" aria-labelledby="characters-heading">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h2 id="characters-heading" className="font-display text-2xl font-semibold text-ink-950">
                    Characters & first appearances
                  </h2>
                  <Link href="/characters" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
                    All characters →
                  </Link>
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {characters.slice(0, 24).map((c) => (
                    <li key={c.slug}>
                      <Link href={`/characters/${c.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                        {c.name}
                        {c.fact && <span className="text-xs text-ink-500">{c.fact.firstDate.replace(/^.* /, "")}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Container>
    </>
  );
}
