import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RelatedGuides } from "@/components/guide-links";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { ProductCard } from "@/components/product-card";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { characterProducts, getCharacter, listCharacters, listGuides } from "@/lib/guides/data";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { slugify } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/characters/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCharacter(slug);
  if (!c) return pageMetadata({ title: "Character not found", description: "", path: `/characters/${slug}`, noIndex: true });
  const first = c.fact ? ` First appearance: ${c.fact.firstTitle} ${c.fact.firstIssue} (${c.fact.firstDate}).` : "";
  return pageMetadata({
    title: `${c.name} — First Appearance, Key Issues & Graded Comics for Sale`,
    description: `${c.name} comics explained.${first} Graded CGC and CBCS copies in stock, plus collector guides on the character's key issues and values.`,
    path: `/characters/${c.slug}`,
    keywords: [`${c.name} first appearance`, `${c.name} comics for sale`, `${c.name} key issues`, `${c.name} CGC`],
  });
}

export default async function CharacterPage({ params }: PageProps<"/characters/[slug]">) {
  const { slug } = await params;
  const c = await getCharacter(slug);
  if (!c) notFound();
  const [products, guides, all] = await Promise.all([characterProducts(c.name), listGuides({ character: c.name, take: 12 }), listCharacters()]);
  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Characters", href: "/characters" },
    { name: c.name, href: `/characters/${c.slug}` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/characters/${c.slug}#page`,
    name: `${c.name} comics`,
    url: `${site.url}/characters/${c.slug}`,
    isPartOf: { "@id": `${site.url}/#website` },
    about: { "@type": "Thing", name: c.name },
    mainEntity: itemListJsonLd([...products.map((p) => ({ url: `${site.url}/store/${p.slug}` })), ...guides.items.map((g) => ({ url: `${site.url}/guides/${g.slug}`, name: g.title }))]),
  };

  return (
    <>
      <JsonLd id="character-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="character-page" data={jsonLd} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-8">
              <SectionHeading
                as="h1"
                eyebrow="Character"
                title={`${c.name} comics`}
                lead={c.fact ? `${c.name} first appeared in ${c.fact.firstTitle} ${c.fact.firstIssue}, cover-dated ${c.fact.firstDate}, from ${c.fact.publisher}, created by ${c.fact.creators}.${c.fact.note ? ` ${c.fact.note}` : ""}` : `Graded books and collector guides featuring ${c.name}.`}
              />
            </div>
            {c.fact && (
              <dl className="grid gap-2 rounded-xl border border-ink-200 bg-white p-5 text-[14px] lg:col-span-4">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">First appearance</dt>
                  <dd className="text-right font-medium text-ink-900">
                    {c.fact.firstTitle} {c.fact.firstIssue}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Cover date</dt>
                  <dd className="text-right font-medium text-ink-900">{c.fact.firstDate}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Publisher</dt>
                  <dd className="text-right font-medium text-ink-900">
                    <Link href={`/publishers/${slugify(c.fact.publisher)}`} className="hover:text-brand-700">
                      {c.fact.publisher}
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Creators</dt>
                  <dd className="text-right font-medium text-ink-900">{c.fact.creators}</dd>
                </div>
              </dl>
            )}
          </div>
        </Container>
      </section>
      <Container className="py-10 lg:py-14">
        <section aria-labelledby="character-listings">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="character-listings" className="font-display text-2xl font-semibold text-ink-950">
              Graded {c.name} books in the vault
            </h2>
            <Link href={`/store?q=${encodeURIComponent(c.name)}`} className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
              Search the store →
            </Link>
          </div>
          {products.length === 0 ? (
            <p className="mt-4 text-[15px] text-ink-600">
              Nothing in stock right now.{" "}
              <Link href="/contact" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
                Send us a want list
              </Link>{" "}
              and we will source a copy.
            </p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p, i) => (
                <ProductCard key={p.slug} product={p} priority={i < 2} deferPaint={i >= 4} />
              ))}
            </div>
          )}
        </section>
        <div className="mt-14">
          <RelatedGuides guides={guides.items} heading={`${c.name} guides`} lead="First appearance, key issues and what drives the prices." />
        </div>
        <nav aria-label="Other characters" className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-ink-950">Other characters</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {all
              .filter((o) => o.slug !== c.slug)
              .slice(0, 30)
              .map((o) => (
                <li key={o.slug}>
                  <Link href={`/characters/${o.slug}`} className="inline-flex rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-300 hover:text-brand-700">
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
