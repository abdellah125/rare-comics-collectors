/**
 * Short hub addresses under /guides (for example /guides/cgc-grading or /guides/spider-man).
 * They do not get pages of their own: each one is a permanent redirect to the page that
 * already is the hub for that subject (a category page or a character page), so two pages
 * never compete for the same search.
 */
import { CATEGORY_SLUGS } from "@/lib/content/categories";

const ALIASES: Record<string, string> = {
  "cgc-grading": "/guides/category/cgc-cbcs",
  "cgc-guides": "/guides/category/cgc-cbcs",
  "cbcs-grading": "/guides/category/cgc-cbcs",
  "comic-grading": "/guides/category/grading-guides",
  "comic-book-values": "/guides/category/values-market",
  "comic-values": "/guides/category/values-market",
  "golden-age-comics": "/guides/category/golden-age",
  "silver-age-comics": "/guides/category/silver-age",
  "bronze-age-comics": "/guides/category/bronze-age",
  "comic-news": "/guides/category/comic-news",
  news: "/guides/category/comic-news",
  "buying-comics": "/guides/category/buying-guides",
  "selling-comics": "/guides/category/selling-guides",
  "comic-history": "/guides/category/comic-history",
};

/** Where a hub address leads, or null when it is not one. `characters` are the character pages that exist. */
export function hubTarget(slug: string, characters: readonly string[]): string | null {
  if (ALIASES[slug]) return ALIASES[slug];
  if (CATEGORY_SLUGS.includes(slug)) return `/guides/category/${slug}`;
  if (characters.includes(slug)) return `/characters/${slug}`;
  return null;
}
