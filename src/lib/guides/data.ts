import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { publishedWhere, summaryInclude, toSummary, type ProductSummary } from "@/lib/catalog/products";
import { db } from "@/lib/db";
import { isString, parseJsonArray } from "@/lib/json";
import { slugify } from "@/lib/validation";
import { CHARACTER_FACTS, type CharacterFact } from "@/lib/guides/characters";
import { GUIDE_TOPICS } from "@/lib/guides/topics";

export type Faq = { q: string; a: string };
export type Source = { label: string; url?: string };

export type GuideSummary = {
  id: string;
  slug: string;
  title: string;
  answer: string;
  topic: string;
  tags: string[];
  characters: string[];
  titles: string[];
  publishers: string[];
  publishedAt: Date | null;
  updatedAt: Date;
  eventDate: Date | null;
};

export type Guide = GuideSummary & {
  body: string;
  faq: Faq[];
  related: string[];
  sources: Source[];
  authorName: string | null;
};

export const publishedGuideWhere: Prisma.ArticleWhereInput = { status: "published", publishedAt: { lte: new Date() } };

const summarySelect = { id: true, slug: true, title: true, answer: true, topic: true, tagsJson: true, charactersJson: true, titlesJson: true, publishersJson: true, publishedAt: true, updatedAt: true, eventDate: true } as const;
type SummaryRow = Prisma.ArticleGetPayload<{ select: typeof summarySelect }>;

const strings = (json: string) => parseJsonArray(json, isString);

export function toGuideSummary(r: SummaryRow): GuideSummary {
  return { id: r.id, slug: r.slug, title: r.title, answer: r.answer, topic: r.topic, tags: strings(r.tagsJson), characters: strings(r.charactersJson), titles: strings(r.titlesJson), publishers: strings(r.publishersJson), publishedAt: r.publishedAt, updatedAt: r.updatedAt, eventDate: r.eventDate };
}

const isFaq = (v: unknown): v is Faq => typeof v === "object" && v !== null && typeof (v as Faq).q === "string" && typeof (v as Faq).a === "string";
const isSource = (v: unknown): v is Source => typeof v === "object" && v !== null && typeof (v as Source).label === "string";

export const getGuide = cache(async (slug: string): Promise<Guide | null> => {
  const r = await db.article.findFirst({ where: { slug, ...publishedGuideWhere } });
  if (!r) return null;
  return { ...toGuideSummary(r), body: r.body, faq: parseJsonArray(r.faqJson, isFaq), related: strings(r.relatedJson), sources: parseJsonArray(r.sourcesJson, isSource), authorName: r.authorName };
});

export async function listGuides(opts: { topic?: string; q?: string; character?: string; title?: string; publisher?: string; tag?: string; take?: number; skip?: number; order?: "latest" | "event" } = {}): Promise<{ items: GuideSummary[]; total: number }> {
  const where: Prisma.ArticleWhereInput = {
    ...publishedGuideWhere,
    ...(opts.topic ? { topic: opts.topic } : {}),
    ...(opts.character ? { charactersJson: { contains: `"${opts.character}"` } } : {}),
    ...(opts.title ? { titlesJson: { contains: `"${opts.title}"` } } : {}),
    ...(opts.publisher ? { publishersJson: { contains: `"${opts.publisher}"` } } : {}),
    ...(opts.tag ? { tagsJson: { contains: `"${opts.tag}"` } } : {}),
    ...(opts.q
      ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { answer: { contains: opts.q, mode: "insensitive" } }, { body: { contains: opts.q, mode: "insensitive" } }, { tagsJson: { contains: opts.q, mode: "insensitive" } }, { charactersJson: { contains: opts.q, mode: "insensitive" } }, { titlesJson: { contains: opts.q, mode: "insensitive" } }] }
      : {}),
  };
  const orderBy: Prisma.ArticleOrderByWithRelationInput[] = opts.order === "event" ? [{ eventDate: "desc" }, { publishedAt: "desc" }] : [{ publishedAt: "desc" }];
  const [rows, total] = await Promise.all([db.article.findMany({ where, select: summarySelect, orderBy, take: opts.take ?? 24, skip: opts.skip ?? 0 }), db.article.count({ where })]);
  return { items: rows.map(toGuideSummary), total };
}

export const topicCounts = cache(async (): Promise<Record<string, number>> => {
  const rows = await db.article.groupBy({ by: ["topic"], where: publishedGuideWhere, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.topic, r._count._all]));
});

export const guideCount = cache(async () => db.article.count({ where: publishedGuideWhere }));

/** Same topic first, then shared tags/characters/titles; never the article itself. */
export async function relatedGuides(guide: Guide, take = 6): Promise<GuideSummary[]> {
  const explicit = guide.related.length ? await db.article.findMany({ where: { slug: { in: guide.related }, ...publishedGuideWhere }, select: summarySelect }) : [];
  const keys = [...guide.characters, ...guide.titles, ...guide.tags].slice(0, 12);
  const byKeys = keys.length
    ? await db.article.findMany({
        where: { ...publishedGuideWhere, id: { not: guide.id }, OR: keys.flatMap((k) => [{ charactersJson: { contains: `"${k}"` } }, { titlesJson: { contains: `"${k}"` } }, { tagsJson: { contains: `"${k}"` } }]) },
        select: summarySelect,
        take: take * 2,
      })
    : [];
  const sameTopic = await db.article.findMany({ where: { ...publishedGuideWhere, topic: guide.topic, id: { not: guide.id } }, select: summarySelect, orderBy: { publishedAt: "desc" }, take });
  const seen = new Set<string>([guide.id]);
  const out: GuideSummary[] = [];
  for (const r of [...explicit, ...byKeys, ...sameTopic]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(toGuideSummary(r));
    if (out.length >= take) break;
  }
  return out;
}

/** Listings a guide talks about: matched on the titles and characters it is tagged with. */
export async function productsForGuide(guide: Pick<Guide, "titles" | "characters" | "publishers">, take = 4): Promise<ProductSummary[]> {
  const or: Prisma.ProductWhereInput[] = [
    ...guide.titles.map((t) => ({ title: { equals: t, mode: "insensitive" as const } })),
    ...guide.characters.map((c) => ({ attributesJson: { contains: c } })),
  ];
  if (or.length === 0 && guide.publishers.length) or.push(...guide.publishers.map((p) => ({ publisher: { equals: p, mode: "insensitive" as const } })));
  if (or.length === 0) return [];
  const rows = await db.product.findMany({ where: { ...publishedWhere, OR: or }, include: summaryInclude, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take });
  return rows.map(toSummary);
}

/** Guides that mention a listing: its title, publisher or the characters in its attributes. */
export async function guidesForProduct(p: { title: string; publisher: string; era: string; grader: string; characters: string[] }, take = 4): Promise<GuideSummary[]> {
  // Articles about the title itself (issue explainers, first appearances in that title) outrank
  // ones that merely tag one of its characters; within each group the newest comes first.
  const byTitle = await db.article.findMany({ where: { ...publishedGuideWhere, titlesJson: { contains: `"${p.title}"` } }, select: summarySelect, orderBy: { publishedAt: "desc" }, take });
  const seen = new Set(byTitle.map((r) => r.id));
  const byCharacter = p.characters.length > 0 && byTitle.length < take
    ? await db.article.findMany({ where: { ...publishedGuideWhere, id: { notIn: [...seen] }, OR: p.characters.map((c) => ({ charactersJson: { contains: `"${c}"` } })) }, select: summarySelect, orderBy: { publishedAt: "desc" }, take: take - byTitle.length })
    : [];
  const primary = [...byTitle, ...byCharacter];
  if (primary.length >= take) return primary.map(toGuideSummary);
  for (const r of byCharacter) seen.add(r.id);
  const backfill = await db.article.findMany({
    where: { ...publishedGuideWhere, id: { notIn: [...seen] }, OR: [{ publishersJson: { contains: `"${p.publisher}"` } }, { tagsJson: { contains: `"${p.era}"` } }, { tagsJson: { contains: `"${p.grader}"` } }] },
    select: summarySelect,
    orderBy: { publishedAt: "desc" },
    take: take - primary.length,
  });
  return [...primary, ...backfill].map(toGuideSummary);
}

/** Publisher pages lead with the publisher's own history article, then the newest guides that tag it. */
export async function guidesForPublisher(name: string, take = 4): Promise<GuideSummary[]> {
  const tagged = { ...publishedGuideWhere, publishersJson: { contains: `"${name}"` } };
  const history = await db.article.findMany({ where: { ...tagged, topic: "publishers" }, select: summarySelect, orderBy: { publishedAt: "desc" }, take });
  if (history.length >= take) return history.map(toGuideSummary);
  const rest = await db.article.findMany({ where: { ...tagged, id: { notIn: history.map((r) => r.id) } }, select: summarySelect, orderBy: { publishedAt: "desc" }, take: take - history.length });
  return [...history, ...rest].map(toGuideSummary);
}

export async function latestGuides(take = 3): Promise<GuideSummary[]> {
  const rows = await db.article.findMany({ where: publishedGuideWhere, select: summarySelect, orderBy: { publishedAt: "desc" }, take });
  return rows.map(toGuideSummary);
}

// ───────────────────────────── characters ─────────────────────────────

export type CharacterHub = { name: string; slug: string; productCount: number; guideCount: number; fact: CharacterFact | null };

/** Characters known to the store: the curated fact list plus anything products or guides are tagged with. */
export const listCharacters = cache(async (): Promise<CharacterHub[]> => {
  const [products, guides] = await Promise.all([
    db.product.findMany({ where: publishedWhere, select: { attributesJson: true } }),
    db.article.findMany({ where: publishedGuideWhere, select: { charactersJson: true } }),
  ]);
  const counts = new Map<string, { name: string; products: number; guides: number }>();
  const bump = (name: string, key: "products" | "guides") => {
    const n = name.trim();
    if (!n) return;
    // Known characters key by their fact slug so "Riri Williams (Ironheart)" and "Riri Williams" share one hub.
    const slug = CHARACTER_FACTS.find((f) => f.name.toLowerCase() === n.toLowerCase())?.slug ?? slugify(n);
    const entry = counts.get(slug) ?? { name: n, products: 0, guides: 0 };
    entry[key] += 1;
    counts.set(slug, entry);
  };
  for (const p of products) {
    const attrs = (() => { try { return JSON.parse(p.attributesJson) as Record<string, unknown>; } catch { return {}; } })();
    const value = attrs["Character"];
    if (typeof value === "string") value.split(",").forEach((c) => bump(c, "products"));
  }
  for (const g of guides) strings(g.charactersJson).forEach((c) => bump(c, "guides"));
  for (const f of CHARACTER_FACTS) if (!counts.has(f.slug)) counts.set(f.slug, { name: f.name, products: 0, guides: 0 });
  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, name: CHARACTER_FACTS.find((f) => f.slug === slug)?.name ?? v.name, productCount: v.products, guideCount: v.guides, fact: CHARACTER_FACTS.find((f) => f.slug === slug) ?? null }))
    .filter((c) => c.productCount > 0 || c.guideCount > 0 || c.fact)
    .sort((a, b) => b.productCount + b.guideCount - (a.productCount + a.guideCount) || a.name.localeCompare(b.name));
});

export const getCharacter = cache(async (slug: string): Promise<CharacterHub | null> => (await listCharacters()).find((c) => c.slug === slug) ?? null);

export async function characterProducts(name: string, take = 24): Promise<ProductSummary[]> {
  const rows = await db.product.findMany({ where: { ...publishedWhere, attributesJson: { contains: name } }, include: summaryInclude, orderBy: [{ featured: "desc" }, { year: "asc" }], take });
  // attributesJson "contains" is a substring match; keep only exact character entries.
  return rows.filter((r) => { try { const v = (JSON.parse(r.attributesJson) as Record<string, unknown>)["Character"]; return typeof v === "string" && v.split(",").map((s) => s.trim().toLowerCase()).includes(name.toLowerCase()); } catch { return false; } }).map(toSummary);
}

export const topicName = (slug: string) => GUIDE_TOPICS.find((t) => t.slug === slug)?.name ?? slug;
