import "server-only";
import { listCollections } from "@/lib/catalog/collections";
import { db } from "@/lib/db";
import { listCharacters } from "@/lib/guides/data";
import { candidateKeywords, defaultSeoDescription, defaultSeoTitle, seoChecks, type SeoFacts } from "@/lib/imports/seo-rules";
import { classifyIntent } from "@/lib/seo/intel/intent";
import { normPhrase } from "@/lib/seo/intel/entities";
import { getSettings } from "@/lib/settings";
import { slugify } from "@/lib/validation";

/**
 * SEO recommendation for a queued product, drawn from what the SEO system already holds: the
 * keyword table (search volumes and intents bought from OpenSEO or read from Search Console), the
 * guides, the character pages and the collection pages. No paid request is made here — a product
 * whose phrases were never measured says so instead of inventing a number.
 */
export type InternalLink = { href: string; label: string; why: string };
export type SeoRecommendation = {
  seoTitle: string;
  seoDescription: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  internalLinks: InternalLink[];
  notes: string[];
  status: "ok" | "review";
};

type KeywordRow = { phrase: string; volume: number | null; intent: string };
export type SeoContext = {
  keywords: Map<string, KeywordRow>;
  characters: { slug: string; name: string }[];
  guides: { slug: string; title: string }[];
  collections: { slug: string; shortName: string }[];
  publisherSlugs: Set<string>;
  returnWindowDays: number;
};

/** One set of queries for a whole batch of products. */
export async function loadSeoContext(facts: SeoFacts[]): Promise<SeoContext> {
  const norms = [...new Set(facts.flatMap((f) => candidateKeywords(f).map(normPhrase)))];
  const keywords = new Map<string, KeywordRow>();
  for (let i = 0; i < norms.length; i += 1000) {
    const rows = await db.seoKeyword.findMany({ where: { norm: { in: norms.slice(i, i + 1000) } }, select: { norm: true, phrase: true, volume: true, intent: true } });
    for (const r of rows) keywords.set(r.norm, r);
  }
  const [characters, guides, collections, publishers, settings] = await Promise.all([
    listCharacters().catch(() => [] as { slug: string; name: string }[]),
    db.article.findMany({ where: { status: "published" }, select: { slug: true, title: true } }),
    listCollections().catch(() => []),
    db.product.groupBy({ by: ["publisher"], where: { status: "published", deletedAt: null } }),
    getSettings(),
  ]);
  return {
    keywords,
    characters: characters.map((c) => ({ slug: c.slug, name: c.name })),
    guides,
    collections: collections.map((c) => ({ slug: c.slug, shortName: c.shortName })),
    publisherSlugs: new Set(publishers.map((p) => slugify(p.publisher))),
    returnWindowDays: settings["commerce.returnWindowDays"],
  };
}

export function recommendSeo(f: SeoFacts & { era: string }, ctx: SeoContext, current?: { seoTitle?: string; seoDescription?: string }): SeoRecommendation {
  const notes: string[] = [];
  const candidates = candidateKeywords(f);
  const measured = candidates
    .map((phrase) => ({ phrase, row: ctx.keywords.get(normPhrase(phrase)) }))
    .filter((c): c is { phrase: string; row: KeywordRow } => Boolean(c.row && c.row.volume && c.row.volume > 0))
    .sort((a, b) => (b.row.volume ?? 0) - (a.row.volume ?? 0));
  const primaryKeyword = measured[0]?.phrase ?? candidates[0] ?? "";
  if (candidates.length > 0 && measured.length === 0) notes.push("No search-volume data is held for this issue yet; the primary keyword is the book's own name.");
  const secondaryKeywords = candidates.filter((c) => c !== primaryKeyword).slice(0, 5);
  // A product page answers a buying search; the keyword table's own classification is used when it has one.
  const searchIntent = measured[0]?.row.intent === "informational" ? "commercial" : (measured[0]?.row.intent ?? (primaryKeyword ? classifyIntent(`${primaryKeyword} for sale`).intent : ""));

  const seoTitle = current?.seoTitle?.trim() || defaultSeoTitle(f);
  const seoDescription = current?.seoDescription?.trim() || defaultSeoDescription(f, ctx.returnWindowDays);

  const internalLinks: InternalLink[] = [];
  const collection = ctx.collections.find((c) => f.era && c.shortName.toLowerCase() === f.era.toLowerCase());
  if (collection) internalLinks.push({ href: `/collections/${collection.slug}`, label: `${collection.shortName} comics`, why: "the era collection this book belongs to" });
  const publisherSlug = slugify(f.publisher);
  if (publisherSlug && ctx.publisherSlugs.has(publisherSlug)) internalLinks.push({ href: `/publishers/${publisherSlug}`, label: f.publisher, why: "the publisher's page" });
  const haystack = ` ${normPhrase(`${f.title} ${f.keyIssue ?? ""}`)} `;
  for (const c of ctx.characters) {
    const name = normPhrase(c.name);
    if (name.length >= 4 && haystack.includes(` ${name} `)) internalLinks.push({ href: `/characters/${c.slug}`, label: c.name, why: "a character named on this listing" });
  }
  const issueSlug = `${slugify(f.title)}-${f.issue.replace(/^#/, "").trim()}`;
  for (const g of ctx.guides) {
    if (g.slug === issueSlug || g.slug.startsWith(`${issueSlug}-`)) internalLinks.push({ href: `/guides/${g.slug}`, label: g.title, why: "a guide about this exact issue" });
  }

  notes.push(...seoChecks({ seoTitle, seoDescription, slug: f.slug, primaryKeyword }, f));
  // Missing search data alone does not make the fields wrong; anything else needs a look.
  const blocking = notes.filter((n) => !n.startsWith("No search-volume data"));
  return { seoTitle, seoDescription, primaryKeyword, secondaryKeywords, searchIntent, internalLinks: internalLinks.slice(0, 6), notes, status: blocking.length === 0 ? "ok" : "review" };
}
