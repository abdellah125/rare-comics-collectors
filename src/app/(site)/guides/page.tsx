import type { Metadata } from "next";
import Link from "@/components/link";
import { GuideGrid } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { CATEGORIES, FRESH_CATEGORIES, categoryBySlug } from "@/lib/content/categories";
import { categoryCounts, featuredGuides, guideCount, listCharacters, listGuides, type GuideSummary } from "@/lib/guides/data";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Guides", href: "/guides" },
];

type Filters = { q: string; category: string; page: number };
function read(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
  const category = categoryBySlug(one(sp.category))?.slug ?? "";
  return { q: one(sp.q).slice(0, 80), category, page: Math.max(1, Math.min(500, Number.parseInt(one(sp.page), 10) || 1)) };
}
const href = (f: Partial<Filters>) => {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/guides?${s}` : "/guides";
};

export async function generateMetadata({ searchParams }: PageProps<"/guides">): Promise<Metadata> {
  const f = read(await searchParams);
  // Search results and filtered or later pages are for visitors, not for the index.
  if (f.q || f.category || f.page > 1) return pageMetadata({ title: f.q ? `Guides matching “${f.q}”` : `Comic collecting guides${f.page > 1 ? `, page ${f.page}` : ""}`, description: "Guides, news and stories for comic collectors.", path: "/guides", noIndex: true });
  return pageMetadata({
    title: "Comic Guides, News & Stories: Grading, Key Issues, Values and History",
    description: "Guides, news and stories for comic collectors: how CGC and CBCS grading works, what drives a comic's value, key issues, first appearances, comic history and sourced industry news.",
    path: "/guides",
    keywords: ["comic collecting guide", "comic book news", "what is a CGC graded comic", "how are comics graded", "comic first appearances", "how much is my comic worth", "key issue comics"],
  });
}

function Row({ id, title, more, guides, columns = 4 }: { id: string; title: string; more?: { href: string; label: string }; guides: GuideSummary[]; columns?: 3 | 4 }) {
  if (guides.length === 0) return null;
  return (
    <section className="mt-14 first:mt-0" aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id={id} className="font-display text-2xl font-semibold text-ink-950">
          {title}
        </h2>
        {more && (
          <Link href={more.href} className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            {more.label} →
          </Link>
        )}
      </div>
      <div className="mt-5">
        <GuideGrid guides={guides} compact columns={columns} />
      </div>
    </section>
  );
}

function Pager({ f, pages }: { f: Filters; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm text-ink-600">
      {f.page > 1 ? (
        <Link href={href({ ...f, page: f.page - 1 })} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {f.page} of {pages}
      </span>
      {f.page < pages ? (
        <Link href={href({ ...f, page: f.page + 1 })} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default async function GuidesPage({ searchParams }: PageProps<"/guides">) {
  const f = read(await searchParams);
  const listing = Boolean(f.q || f.category || f.page > 1);
  const [counts, total] = await Promise.all([categoryCounts(), guideCount()]);
  const shown = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0);

  const search = (
    <form action="/guides" method="get" role="search" className="flex w-full max-w-xl flex-wrap gap-2">
      <label htmlFor="guide-q" className="sr-only">
        Search the guides
      </label>
      <input id="guide-q" name="q" type="search" defaultValue={f.q} placeholder="Search: CGC 9.8, first appearance, Silver Age…" className="h-11 min-w-0 flex-1 basis-56 rounded-lg border border-ink-300 bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-brand-500" />
      <label htmlFor="guide-category" className="sr-only">
        Category
      </label>
      <select id="guide-category" name="category" defaultValue={f.category} className="h-11 rounded-lg border border-ink-300 bg-white px-3 text-[15px] text-ink-900 focus:border-brand-500">
        <option value="">All categories</option>
        {shown.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="submit" className="h-11 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white hover:bg-ink-800">
        Search
      </button>
    </form>
  );

  const header = (
    <section className="border-b border-ink-200 bg-ink-50">
      <Container className="py-10 lg:py-14">
        <Breadcrumbs items={crumbs} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            as="h1"
            eyebrow={`${total.toLocaleString("en-US")} articles · ${shown.length} categories`}
            title="Guides, news & stories"
            lead="Straight answers for comic collectors: grading, values, key issues, first appearances and comic history, plus industry news with its sources. Every piece opens with the answer and links to the books it talks about."
          />
          {search}
        </div>
        <nav aria-label="Categories" className="mt-7">
          <ul className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {shown.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link href={`/guides/category/${c.slug}`} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                  <span aria-hidden>{c.icon}</span>
                  {c.short}
                  <span className="text-xs text-ink-500">{counts[c.slug]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </section>
  );

  if (listing) {
    const results = await listGuides({ q: f.q || undefined, category: f.category || undefined, take: PER_PAGE, skip: (f.page - 1) * PER_PAGE });
    const pages = Math.max(1, Math.ceil(results.total / PER_PAGE));
    const what = f.q ? `matching “${f.q}”` : "";
    const where = f.category ? ` in ${categoryBySlug(f.category)!.name}` : "";
    return (
      <>
        <JsonLd id="guides-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
        {header}
        <Container className="py-10 lg:py-14">
          <section aria-labelledby="results-heading">
            <h2 id="results-heading" className="font-display text-2xl font-semibold text-ink-950">
              {results.total === 0 ? `Nothing ${what || "found"}${where}` : `${results.total.toLocaleString("en-US")} article${results.total === 1 ? "" : "s"} ${what}${where}`.replace(/\s+/g, " ")}
            </h2>
            {results.total === 0 ? (
              <p className="mt-3 text-[15px] text-ink-600">
                Try a character, a title or a grading term, or{" "}
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
            <Pager f={f} pages={pages} />
            <p className="mt-8">
              <Link href="/guides" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
                ← Guides home
              </Link>
            </p>
          </section>
        </Container>
      </>
    );
  }

  const [featured, news, stories, popular, collecting, grading, market, characters, latest, hubs] = await Promise.all([
    featuredGuides(3),
    listGuides({ categories: FRESH_CATEGORIES, take: 4, order: "event" }),
    listGuides({ categories: ["character-stories", "creator-stories", "comic-history"], take: 4 }),
    listGuides({ take: 4, order: "popular" }),
    listGuides({ categories: ["collecting-guides", "collector-tips", "golden-age", "silver-age", "bronze-age"], take: 4 }),
    listGuides({ categories: ["grading-guides", "cgc-cbcs"], take: 4 }),
    listGuides({ categories: ["values-market", "investment-analysis", "buying-guides", "selling-guides"], take: 4 }),
    listGuides({ category: "character-stories", take: 4, order: "popular" }),
    listGuides({ take: PER_PAGE }),
    listCharacters(),
  ]);
  const pages = Math.max(1, Math.ceil(latest.total / PER_PAGE));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/guides#page`,
    name: "Comic guides, news and stories",
    url: `${site.url}/guides`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(shown.map((c) => ({ url: `${site.url}/guides/category/${c.slug}`, name: c.name }))),
  };

  return (
    <>
      <JsonLd id="guides-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="guides-page" data={jsonLd} />
      {header}

      <Container className="py-10 lg:py-14">
        <Row id="featured-heading" title="Featured guides" guides={featured} columns={3} />
        <Row id="news-heading" title="Latest news" more={{ href: "/guides/category/comic-news", label: "All news" }} guides={news.items} />
        <Row id="stories-heading" title="Latest stories" more={{ href: "/guides/category/character-stories", label: "All stories" }} guides={stories.items} />
        <Row id="popular-heading" title="Most popular guides" guides={popular.items} />
        <Row id="collecting-heading" title="Comic collecting guides" more={{ href: "/guides/category/collecting-guides", label: "All collecting guides" }} guides={collecting.items} />
        <Row id="grading-heading" title="Grading guides" more={{ href: "/guides/category/grading-guides", label: "All grading guides" }} guides={grading.items} />
        <Row id="market-heading" title="Market insights" more={{ href: "/guides/category/values-market", label: "All value guides" }} guides={market.items} />
        <Row id="characters-heading" title="Character stories" more={{ href: "/characters", label: "All characters" }} guides={characters.items} />

        {hubs.length > 0 && (
          <section className="below-fold mt-14" aria-labelledby="trending-heading">
            <h2 id="trending-heading" className="font-display text-2xl font-semibold text-ink-950">
              Trending topics
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {hubs.slice(0, 24).map((c) => (
                <li key={c.slug}>
                  <Link href={`/characters/${c.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
                    {c.name}
                    {c.guideCount > 0 && <span className="text-xs text-ink-500">{c.guideCount}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="below-fold mt-14" aria-labelledby="categories-heading">
          <h2 id="categories-heading" className="font-display text-2xl font-semibold text-ink-950">
            Browse by category
          </h2>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <li key={c.slug}>
                <Link href={`/guides/category/${c.slug}`} className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                  <span className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">
                    <span aria-hidden className="mr-1.5">
                      {c.icon}
                    </span>
                    {c.name}
                  </span>
                  <span className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-600">{c.description}</span>
                  <span className="mt-4 text-[13px] font-semibold text-brand-700">
                    {counts[c.slug]} article{counts[c.slug] === 1 ? "" : "s"} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="below-fold mt-14" aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="font-display text-2xl font-semibold text-ink-950">
            Everything, newest first
          </h2>
          <div className="mt-5">
            <GuideGrid guides={latest.items} compact columns={4} />
          </div>
          <Pager f={f} pages={pages} />
        </section>
      </Container>
    </>
  );
}
