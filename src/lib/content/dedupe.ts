/**
 * Duplicate detection, in two places: before a topic is chosen (does the site already answer
 * this?) and after an article is written (does it repeat text the site already has?). Pure.
 */
import { normPhrase } from "@/lib/seo/intel/entities";
import { articleTokens } from "@/lib/seo/intel/strategy";

export type ExistingPage = {
  /** site path, e.g. /guides/what-is-a-cgc-graded-comic */
  url: string;
  title: string;
  kind: "article" | "product" | "collection" | "character" | "publisher" | "service" | "task";
  /** normalised keywords the page already targets */
  keywords: string[];
};

export type DuplicateHit = { url: string; title: string; kind: ExistingPage["kind"]; why: string };

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  return hit / (a.size + b.size - hit);
};

/** How alike two headlines or keywords are, 0–1, ignoring word order, plurals and filler words. */
export const phraseSimilarity = (a: string, b: string) => jaccard(articleTokens(a), articleTokens(b));

/**
 * The page that already covers a keyword, if any: the same keyword, a keyword that differs only
 * in filler words, a headline made of the same words, or the address the article would get.
 */
export function findDuplicate(topic: { keyword: string; title?: string; url?: string; also?: string[] }, pages: ExistingPage[], threshold = 0.8): DuplicateHit | null {
  const norm = normPhrase(topic.keyword);
  const want = articleTokens(topic.keyword);
  const titleTokens = topic.title ? articleTokens(topic.title) : null;
  let best: { page: ExistingPage; why: string; strength: number } | null = null;
  const offer = (page: ExistingPage, why: string, strength: number) => {
    if (!best || strength > best.strength) best = { page, why, strength };
  };
  for (const page of pages) {
    if (topic.url && page.url === topic.url) offer(page, "the address already exists", 1);
    if (page.keywords.includes(norm)) offer(page, "it already targets this keyword", 0.99);
    for (const k of page.keywords) {
      const s = jaccard(want, articleTokens(k));
      if (s >= threshold) offer(page, `it targets the near-identical keyword "${k}"`, s * 0.97);
    }
    const pageTokens = articleTokens(page.title);
    // A keyword whose every distinctive word is in an article's headline is answered by that article.
    if (page.kind === "article" || page.kind === "task") {
      const s = jaccard(want, pageTokens);
      if (s >= threshold) offer(page, "its headline covers the same subject", s * 0.95);
      if (titleTokens && jaccard(titleTokens, pageTokens) >= threshold) offer(page, "the headlines are near-identical", 0.94);
    }
  }
  const found = best as { page: ExistingPage; why: string; strength: number } | null;
  return found ? { url: found.page.url, title: found.page.title, kind: found.page.kind, why: found.why } : null;
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9#' ]+/g, " ").split(/\s+/).filter(Boolean);

/** Overlapping runs of `size` words: the fingerprint of a text. */
export function shingles(text: string, size = 6): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(" "));
  return out;
}

/** Share of `text`'s six-word runs that also appear in `other`, 0–1. */
export function overlap(text: Set<string>, other: Set<string>): number {
  if (text.size === 0) return 0;
  let hit = 0;
  for (const s of text) if (other.has(s)) hit += 1;
  return hit / text.size;
}

/** The existing text a draft repeats most, and by how much. */
export function mostSimilar(body: string, corpus: { slug: string; body: string }[]): { slug: string | null; share: number } {
  const mine = shingles(body);
  let best = { slug: null as string | null, share: 0 };
  for (const doc of corpus) {
    const share = overlap(mine, shingles(doc.body));
    if (share > best.share) best = { slug: doc.slug, share };
  }
  return best;
}

/** Share of sentences that appear more than once in the same text, 0–1. */
export function repeatedSentenceShare(body: string): number {
  const sentences = body.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim().toLowerCase()).filter((s) => s.split(" ").length >= 6);
  if (sentences.length === 0) return 0;
  const seen = new Map<string, number>();
  for (const s of sentences) seen.set(s, (seen.get(s) ?? 0) + 1);
  let repeated = 0;
  for (const n of seen.values()) if (n > 1) repeated += n - 1;
  return repeated / sentences.length;
}
