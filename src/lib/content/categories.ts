/**
 * The content categories of the Guides section and the formats an article can take.
 * A category is what the reader browses by; the older, broader "topic" (src/lib/guides/topics.ts)
 * stays as the hub every category rolls up to, so nothing that already links to a topic breaks.
 */
import type { GuideTopic } from "@/lib/guides/topics";

export type ContentCategory = {
  slug: string;
  name: string;
  short: string;
  icon: string;
  /** the topic hub this category belongs to */
  topic: GuideTopic;
  description: string;
  /** dated content (news, market notes) as opposed to evergreen */
  fresh?: boolean;
};

export const CATEGORIES: ContentCategory[] = [
  { slug: "comic-news", name: "Comic News", short: "News", icon: "📰", topic: "news", fresh: true, description: "Industry news, each item with the sources it rests on and a label that says whether it is confirmed, reported or analysis." },
  { slug: "collecting-guides", name: "Collecting Guides", short: "Collecting", icon: "📚", topic: "collecting", description: "How a comic collection is built: what to look for, what to avoid and where to start." },
  { slug: "grading-guides", name: "Grading Guides", short: "Grading", icon: "🏆", topic: "grading", description: "How comics are graded, what each grade means and how condition is judged." },
  { slug: "values-market", name: "Comic Values & Market Trends", short: "Values", icon: "💰", topic: "values", description: "What decides the price of a comic and how to check what a book really sells for." },
  { slug: "investment-analysis", name: "Investment & Market Analysis", short: "Analysis", icon: "📈", topic: "values", description: "How collectors think about scarcity, demand and risk. Analysis, never financial advice." },
  { slug: "character-stories", name: "Character Stories", short: "Characters", icon: "🦸", topic: "characters", description: "Where the characters come from: first appearances, creators and the issues that matter." },
  { slug: "creator-stories", name: "Creator & Artist Stories", short: "Creators", icon: "✍️", topic: "publishers", description: "The writers and artists behind the books, and the work collectors look for." },
  { slug: "comic-history", name: "Comic History", short: "History", icon: "📖", topic: "publishers", description: "Publishers, eras and the events that shaped the comic book industry." },
  { slug: "golden-age", name: "Golden Age", short: "Golden Age", icon: "🏛️", topic: "collecting", description: "Comics of 1938 to 1956: the first superheroes and the books that survive from the period." },
  { slug: "silver-age", name: "Silver Age", short: "Silver Age", icon: "🥈", topic: "collecting", description: "Comics of 1956 to 1970: the Marvel Age, the return of the DC heroes and their key issues." },
  { slug: "bronze-age", name: "Bronze Age", short: "Bronze Age", icon: "🥉", topic: "collecting", description: "Comics of 1970 to 1985: darker stories, new characters and affordable keys." },
  { slug: "key-issues", name: "Rare & Key Issues", short: "Key issues", icon: "💎", topic: "titles", description: "The individual books collectors chase, why they matter and what to check before buying." },
  { slug: "cgc-cbcs", name: "CGC & CBCS Guides", short: "CGC / CBCS", icon: "🔎", topic: "grading", description: "The two grading companies: labels, holders, certification numbers and how to read a slab." },
  { slug: "buying-guides", name: "Buying Guides", short: "Buying", icon: "🧾", topic: "values", description: "How to buy a comic safely: where, what to ask and how to compare copies." },
  { slug: "selling-guides", name: "Selling Guides", short: "Selling", icon: "💵", topic: "values", description: "How to sell or consign comics, and what to prepare before you do." },
  { slug: "auction-marketplace", name: "Auction & Marketplace News", short: "Auctions", icon: "🏷️", topic: "news", fresh: true, description: "Notable sales and marketplace changes, with the auction house or source named." },
  { slug: "collector-tips", name: "Collector Tips", short: "Tips", icon: "🧠", topic: "care", description: "Storage, handling, shipping and the small habits that protect a collection." },
  { slug: "faq", name: "Frequently Asked Questions", short: "FAQ", icon: "❓", topic: "faq", description: "Short, direct answers to the questions collectors search for." },
  { slug: "trending", name: "Trending Topics", short: "Trending", icon: "🔥", topic: "news", fresh: true, description: "What collectors are searching for right now, and the facts behind it." },
  { slug: "releases-events", name: "Comic Releases & Events", short: "Releases", icon: "🗓️", topic: "news", fresh: true, description: "Announced releases, conventions and dates, from the publishers and organisers themselves." },
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
export const categoryBySlug = (slug: string): ContentCategory | null => CATEGORIES.find((c) => c.slug === slug) ?? null;
export const FRESH_CATEGORIES = CATEGORIES.filter((c) => c.fresh).map((c) => c.slug);

/** Categories shown when an article was filed by topic only (the hand-written seed articles). */
export const TOPIC_DEFAULT_CATEGORY: Record<GuideTopic, string> = { grading: "grading-guides", collecting: "collecting-guides", values: "values-market", characters: "character-stories", titles: "key-issues", publishers: "comic-history", care: "collector-tips", news: "comic-news", faq: "faq" };

/** An article's category, falling back to its topic's default for older articles. */
export const categoryOf = (a: { category: string; topic: string }): ContentCategory => categoryBySlug(a.category) ?? categoryBySlug(TOPIC_DEFAULT_CATEGORY[a.topic as GuideTopic] ?? "collecting-guides")!;

export type ContentFormat = "news" | "faq" | "article" | "guide" | "longform" | "profile" | "list" | "comparison" | "market";
export const FORMATS: Record<ContentFormat, { name: string; minWords: number; maxWords: number; maxTokens: number; brief: string }> = {
  news: { name: "News update", minWords: 150, maxWords: 450, maxTokens: 1800, brief: "A short news update: what happened, when, who says so, and why a collector should care. No padding." },
  faq: { name: "Quick answer", minWords: 220, maxWords: 550, maxTokens: 1800, brief: "A direct answer to one question in the first sentence, then the few details that make the answer usable." },
  article: { name: "Article", minWords: 500, maxWords: 900, maxTokens: 3000, brief: "A focused article on one subject, 500 to 800 words." },
  guide: { name: "Guide", minWords: 800, maxWords: 1600, maxTokens: 4500, brief: "A practical guide, 800 to 1,500 words, organised so a reader can act on it." },
  longform: { name: "Long-form guide", minWords: 1600, maxWords: 3000, maxTokens: 7500, brief: "A complete evergreen reference, 1,800 to 2,600 words, that a reader would bookmark." },
  profile: { name: "Profile", minWords: 500, maxWords: 1100, maxTokens: 3200, brief: "A profile of one character or creator: origin, the work that matters, and the comics collectors look for." },
  list: { name: "List", minWords: 600, maxWords: 1400, maxTokens: 4000, brief: "A list article where every entry earns its place with a specific reason. No filler entries." },
  comparison: { name: "Comparison", minWords: 600, maxWords: 1300, maxTokens: 3800, brief: "A side-by-side comparison with a Markdown table and a plain recommendation for each kind of reader." },
  market: { name: "Market note", minWords: 350, maxWords: 800, maxTokens: 2600, brief: "A market note that explains a trend using only the figures supplied. Analysis is labelled as analysis." },
};
export const FORMAT_KEYS = Object.keys(FORMATS) as ContentFormat[];
export const isFormat = (v: string): v is ContentFormat => (FORMAT_KEYS as string[]).includes(v);

/** Schema.org type for an article: news is NewsArticle, short notes BlogPosting, the rest Article. */
export const schemaTypeFor = (format: string): "NewsArticle" | "BlogPosting" | "Article" => (format === "news" ? "NewsArticle" : format === "market" ? "BlogPosting" : "Article");

export const CLAIM_LEVELS = { confirmed: "Confirmed", reported: "Reported", analysis: "Analysis", rumor: "Unconfirmed" } as const;
export type ClaimLevel = keyof typeof CLAIM_LEVELS;
