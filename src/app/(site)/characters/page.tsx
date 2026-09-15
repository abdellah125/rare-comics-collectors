import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from "@/components/json-ld";
import { Breadcrumbs, Container, SectionHeading, type Crumb } from "@/components/ui";
import { listCharacters } from "@/lib/guides/data";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Comic Characters — First Appearances, Key Issues & Graded Books",
  description: "Where Superman, Batman, Spider-Man, Wolverine, Deadpool and other major characters first appeared, with the issue, cover date and creators, plus the graded copies for sale and guides about each one.",
  path: "/characters",
  keywords: ["first appearance comics", "comic character first appearance", "wolverine first appearance", "spider-man first appearance", "key issue comics by character"],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Characters", href: "/characters" },
];

export default async function CharactersPage() {
  const characters = await listCharacters();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${site.url}/characters#page`,
    name: "Comic characters and first appearances",
    url: `${site.url}/characters`,
    isPartOf: { "@id": `${site.url}/#website` },
    mainEntity: itemListJsonLd(characters.map((c) => ({ url: `${site.url}/characters/${c.slug}`, name: c.name }))),
  };
  return (
    <>
      <JsonLd id="characters-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="characters-page" data={jsonLd} />
      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6">
            <SectionHeading as="h1" eyebrow={`${characters.length} characters`} title="Characters and first appearances" lead="Each character page gives the first appearance with its cover date and creators, the graded copies we have in the vault, and the guides that explain why those books matter." />
          </div>
        </Container>
      </section>
      <Container className="py-10 lg:py-14">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((c) => (
            <li key={c.slug}>
              <Link href={`/characters/${c.slug}`} className="group flex h-full flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                <span className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">{c.name}</span>
                {c.fact ? (
                  <span className="mt-1.5 text-[14px] text-ink-600">
                    First appearance: {c.fact.firstTitle} {c.fact.firstIssue} ({c.fact.firstDate})
                  </span>
                ) : (
                  <span className="mt-1.5 text-[14px] text-ink-600">Books and guides featuring {c.name}</span>
                )}
                <span className="mt-3 text-[13px] font-semibold text-brand-700">
                  {c.productCount} listing{c.productCount === 1 ? "" : "s"} · {c.guideCount} guide{c.guideCount === 1 ? "" : "s"} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
