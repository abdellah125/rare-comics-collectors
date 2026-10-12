import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { publishedWhere, summaryInclude, toSummary } from "@/lib/catalog/products";
import { gradeLabel, isKnown, yearKnown } from "@/lib/catalog/labels";
import { CHARACTER_FACTS, type CharacterFact } from "@/lib/guides/characters";
import type { ProductSummary } from "@/lib/products";
import { slugify } from "@/lib/validation";

/**
 * Price guide pages: one per key issue the store has copies of (title + issue number), e.g.
 * /price-guide/amazing-fantasy-15. Everything on them is our own data: the asking prices of the
 * copies on sale here and the sales completed on this site. No outside auction result or market
 * estimate is shown, because none is held.
 */
export type PriceGuideSummary = {
  slug: string;
  title: string;
  issue: string;
  copies: number;
  minPrice: number;
  maxPrice: number;
  /** last visible change among its copies, for the sitemap */
  changedAt: Date;
};

export const priceGuideSlug = (title: string, issue: string) => slugify(`${title} ${issue.replace(/^#/, "")}`);

/** "#15" before "#100"; non-numeric issues after. */
const issueNumber = (issue: string) => {
  const n = Number.parseFloat(issue.replace(/^#/, ""));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};

/** Key issues with at least one copy on sale at a fixed price. */
export const listPriceGuides = cache(async (): Promise<PriceGuideSummary[]> => {
  const rows = await db.product.groupBy({
    by: ["title", "issue"],
    where: { ...publishedWhere, keyIssue: { not: null }, saleType: "fixed", stock: { gt: 0 }, NOT: [{ issue: "nn" }, { issue: "" }] },
    _count: { _all: true },
    _min: { price: true },
    _max: { price: true, contentUpdatedAt: true },
  });
  const bySlug = new Map<string, PriceGuideSummary>();
  for (const r of rows) {
    const slug = priceGuideSlug(r.title, r.issue);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { slug, title: r.title, issue: r.issue, copies: r._count._all, minPrice: r._min.price ?? 0, maxPrice: r._max.price ?? 0, changedAt: r._max.contentUpdatedAt ?? new Date() });
  }
  return [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title, "en") || issueNumber(a.issue) - issueNumber(b.issue));
});

export const priceGuideFor = async (title: string, issue: string): Promise<PriceGuideSummary | null> => {
  const slug = priceGuideSlug(title, issue);
  return (await listPriceGuides()).find((g) => g.slug === slug) ?? null;
};

export type GradeRow = { grade: string; copies: number; minPrice: number; maxPrice: number };
export type SaleRow = { date: Date; grade: string; price: number };

export type PriceGuide = PriceGuideSummary & {
  publisher: string | null;
  year: number | null;
  keyIssue: string | null;
  grades: GradeRow[];
  sales: SaleRow[];
  products: ProductSummary[];
  character: CharacterFact | null;
};

const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
/** Sort key for a grade label: CGC 9.8 above CGC 9.6 above raw. */
const gradeRank = (label: string) => {
  const n = Number.parseFloat(label.replace(/^[^\d]*/, ""));
  return (label.startsWith("Raw") ? 0 : 100) + (Number.isFinite(n) ? n : 0);
};

export const getPriceGuide = cache(async (slug: string): Promise<PriceGuide | null> => {
  const g = (await listPriceGuides()).find((x) => x.slug === slug);
  if (!g) return null;
  const rows = await db.product.findMany({ where: { ...publishedWhere, title: g.title, issue: g.issue, saleType: "fixed", stock: { gt: 0 } }, include: summaryInclude, orderBy: [{ price: "asc" }, { id: "asc" }], take: 96 });
  const products = rows.map(toSummary);

  const grades = new Map<string, GradeRow>();
  for (const p of rows) {
    const label = gradeLabel(p.grader, p.grade);
    const row = grades.get(label) ?? { grade: label, copies: 0, minPrice: p.price, maxPrice: p.price };
    row.copies += 1;
    row.minPrice = Math.min(row.minPrice, p.price);
    row.maxPrice = Math.max(row.maxPrice, p.price);
    grades.set(label, row);
  }

  // Completed sales on this site of the same title and issue (paid, not cancelled or refunded).
  const sold = await db.orderItem.findMany({
    where: { product: { title: g.title, issue: g.issue }, order: { paymentStatus: "paid", status: { notIn: ["cancelled", "failed", "refunded"] } } },
    select: { unitPrice: true, order: { select: { placedAt: true } }, product: { select: { grader: true, grade: true } } },
    orderBy: { order: { placedAt: "desc" } },
    take: 20,
  });

  const facts = rows.find((p) => isKnown(p.publisher) && yearKnown(p.year)) ?? rows[0];
  const keyCounts = new Map<string, number>();
  for (const p of rows) if (p.keyIssue) keyCounts.set(p.keyIssue, (keyCounts.get(p.keyIssue) ?? 0) + 1);
  const keyIssue = [...keyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const character = CHARACTER_FACTS.find((f) => norm(f.firstTitle) === norm(g.title) && f.firstIssue === g.issue) ?? null;

  return {
    ...g,
    publisher: facts && isKnown(facts.publisher) ? facts.publisher : null,
    year: facts && yearKnown(facts.year) ? facts.year : null,
    keyIssue,
    grades: [...grades.values()].sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade)),
    sales: sold.filter((s) => s.product).map((s) => ({ date: s.order.placedAt, grade: gradeLabel(s.product!.grader, s.product!.grade), price: s.unitPrice })),
    products,
    character,
  };
});
