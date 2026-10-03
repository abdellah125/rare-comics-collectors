import { describe, expect, it } from "vitest";
import { analysePhrase, extractEntity, normPhrase, type Catalog } from "@/lib/seo/intel/entities";
import { classifyIntent, intentValue } from "@/lib/seo/intel/intent";
import { demandFromVolume, priorityFor, scoreKeyword } from "@/lib/seo/intel/score";
import { articleTokens, planPage, type SiteInventory } from "@/lib/seo/intel/strategy";

const catalog: Catalog = {
  series: ["amazing spider man", "incredible hulk", "hulk", "x men", "giant size x men", "batman", "avengers", "silver surfer"],
  stockedSeries: new Set(["amazing spider man", "incredible hulk", "x men"]),
  stockedIssues: new Set(["amazing spider man|300", "incredible hulk|181", "x men|1"]),
  characters: ["wolverine", "venom", "deadpool", "spider man"],
  publishers: ["marvel", "dc"],
};
const article = (slug: string, title: string) => ({ slug, title, topic: "titles", tokens: articleTokens(`${title} ${slug.replace(/-/g, " ")}`) });
const inventory: SiteInventory = {
  products: [
    { series: "amazing spider man", issue: "300", slug: "amazing-spider-man-300-cgc-9-8", label: "Amazing Spider-Man #300 CGC 9.8" },
    { series: "x men", issue: "1", slug: "x-men-1-cgc-4-0", label: "X-Men #1 CGC 4.0" },
    { series: "x men", issue: "1", slug: "x-men-1-cgc-6-0", label: "X-Men #1 CGC 6.0" },
  ],
  articles: [article("incredible-hulk-181-first-wolverine", "Incredible Hulk #181: the first Wolverine"), article("giant-size-x-men-1-vs-x-men-94", "Giant-Size X-Men #1 vs X-Men #94"), article("first-appearance-of-deadpool", "What is the first appearance of Deadpool?"), article("cgc-vs-cbcs", "CGC vs CBCS")],
  collections: [{ slug: "silver-age", era: "silver age" }],
  publishers: [{ slug: "marvel-comics", name: "Marvel Comics" }],
  characters: [{ slug: "wolverine", name: "Wolverine" }],
};

describe("intent", () => {
  it("separates buying, research, questions and other sites", () => {
    expect(classifyIntent("buy cgc graded comics").intent).toBe("transactional");
    expect(classifyIntent("silver age comics for sale").specific).toContain("buying");
    expect(classifyIntent("incredible hulk 181 value")).toMatchObject({ intent: "commercial" });
    expect(classifyIntent("incredible hulk 181 value").specific).toContain("price_value");
    expect(classifyIntent("when did deadpool first appear").intent).toBe("informational");
    expect(classifyIntent("first appearance of wolverine").specific).toContain("first_appearance");
    expect(classifyIntent("cgc vs cbcs").specific).toContain("comparison");
    expect(classifyIntent("mycomicshop coupon")).toMatchObject({ intent: "navigational", brand: "mycomicshop" });
    expect(classifyIntent("cgc cert lookup").intent).toBe("navigational");
  });

  it("treats grading words as shopping only when the phrase is about a book", () => {
    expect(classifyIntent("avengers 4 cgc").intent).toBe("commercial");
    expect(classifyIntent("cgc newton rings").intent).toBe("informational");
    expect(classifyIntent("sell my comic collection").specific).not.toContain("buying");
  });

  it("values buyers above readers and ignores other sites' brand searches", () => {
    expect(intentValue(classifyIntent("buy graded comics"))).toBe(100);
    expect(intentValue(classifyIntent("what is a key issue"))).toBeLessThan(50);
    expect(intentValue(classifyIntent("ebay comics"))).toBeLessThanOrEqual(15);
  });
});

describe("entities, relevance and clusters", () => {
  it("normalises spellings so variants meet", () => {
    expect(normPhrase("Amazing Spider-Man #300")).toBe("amazing spider man 300");
    expect(normPhrase("spiderman 300 CGC 9.8")).toBe("spider man 300 cgc 9.8");
  });

  it("puts every variant of an issue in one cluster", () => {
    const keys = ["Amazing Spider-Man 300", "amazing spider-man #300", "amazing spider man 300 cgc", "amazing spider-man 300 price", "amazing spider-man 300 value", "buy amazing spider-man 300", "asm 300 first venom"].map((p) => analysePhrase(p, catalog).clusterKey);
    expect(new Set(keys)).toEqual(new Set(["issue:amazing spider man:300"]));
  });

  it("reads issues, shorthand, grades and years correctly", () => {
    expect(extractEntity("hulk 181 value", catalog)).toMatchObject({ type: "issue", series: "incredible hulk", issue: "181", inStock: true });
    expect(extractEntity("batman cgc 9.8", catalog).type).toBe("series");
    expect(extractEntity("batman 1989", catalog).type).toBe("series");
    expect(extractEntity("giant size x men 1", catalog)).toMatchObject({ type: "issue", series: "giant size x men" });
    expect(extractEntity("first appearance of wolverine", catalog)).toMatchObject({ type: "first_appearance", key: "first-appearance:wolverine" });
    expect(extractEntity("silver age comics for sale", catalog).type).toBe("era");
  });

  it("separates buying pages from learning pages for the same subject", () => {
    expect(analysePhrase("silver age comics for sale", catalog).clusterKey).toBe("era:silver age|buy");
    expect(analysePhrase("what is the silver age of comics", catalog).clusterKey).toBe("era:silver age|learn");
    expect(analysePhrase("cgc newton rings", catalog).bucket).toBe("learn");
  });

  it("scores relevance by what the shop sells, not by popularity", () => {
    expect(analysePhrase("incredible hulk 181 cgc", catalog).relevance.score).toBe(100);
    expect(analysePhrase("batman 5 value", catalog).relevance.score).toBeGreaterThanOrEqual(80);
    expect(analysePhrase("wolverine vs hulk", catalog).relevance.score).toBeLessThan(45);
    expect(analysePhrase("read batman comics online free", catalog).relevance.score).toBeLessThan(10);
    expect(analysePhrase("deadpool movie cast", catalog).relevance.score).toBeLessThan(10);
    expect(analysePhrase("ebay comics", catalog).relevance.score).toBeLessThan(45);
  });
});

describe("opportunity score", () => {
  const base = { impressions: null, cpc: null, words: 3, position: null, serpDomainRank: null, intentValue: 82, relevance: 100 };

  it("prefers a winnable 500-search keyword to a 50,000-search one held by big sites", () => {
    const small = scoreKeyword({ ...base, volume: 500, difficulty: 12 });
    const huge = scoreKeyword({ ...base, volume: 50_000, difficulty: 88 });
    expect(small.score!).toBeGreaterThan(huge.score!);
    expect(demandFromVolume(50_000)).toBe(100);
  });

  it("never scores a keyword that has no data, and says what is missing", () => {
    const s = scoreKeyword({ ...base, volume: null, difficulty: null });
    expect(s.score).toBeNull();
    expect(s.missing).toEqual(["search volume", "keyword difficulty"]);
    expect(priorityFor(s, { position: null, buyerIntent: true }).priority).toBe("low");
  });

  it("uses Search Console impressions as demand and a current position as rankability when metrics are missing", () => {
    const s = scoreKeyword({ ...base, volume: null, difficulty: null, impressions: 40, position: 9 });
    expect(s.score).not.toBeNull();
    expect(s.demandBasis).toMatch(/Search Console impressions/);
    expect(s.rankabilityBasis).toMatch(/already ranking/);
  });

  it("multiplies by relevance, so off-topic volume is worth nothing", () => {
    expect(scoreKeyword({ ...base, volume: 30_000, difficulty: 5, relevance: 8 }).score!).toBeLessThan(10);
  });

  it("sets priorities from the same figures", () => {
    const win = scoreKeyword({ ...base, volume: 300, difficulty: 10 });
    expect(priorityFor(win, { position: null, buyerIntent: true }).priority).toBe("high");
    expect(priorityFor(win, { position: null, buyerIntent: false }).priority).toBe("medium");
    const hard = scoreKeyword({ ...base, volume: 20_000, difficulty: 80 });
    expect(priorityFor(hard, { position: null, buyerIntent: true }).priority).toBe("long_term");
    const edge = scoreKeyword({ ...base, volume: 90, difficulty: 55, position: 11 });
    expect(priorityFor(edge, { position: 11, buyerIntent: false })).toMatchObject({ priority: "high" });
    expect(priorityFor(scoreKeyword({ ...base, volume: 900, difficulty: 5, relevance: 20 }), { position: null, buyerIntent: true }).priority).toBe("low");
  });
});

describe("page strategy", () => {
  const plan = (phrase: string) => {
    const a = analysePhrase(phrase, catalog);
    return planPage({ entity: a.entity, bucket: a.bucket, primary: phrase, intent: a.intent.intent, specifics: a.intent.specific, inventory });
  };

  it("uses the guide that exists for an issue, matched exactly", () => {
    expect(plan("incredible hulk 181 value")).toMatchObject({ pageType: "Issue guide", recommendedUrl: "/guides/incredible-hulk-181-first-wolverine", exists: true });
    // "giant-size-x-men-1-…" is not a guide about X-Men #1.
    expect(plan("x men 1 cgc")).toMatchObject({ pageType: "Issue guide", recommendedUrl: "/guides/x-men-1-value-and-key-facts", exists: false });
    expect(plan("x men 1 cgc").note).toMatch(/2 product pages compete/);
  });

  it("targets the product page when one copy is in stock", () => {
    expect(plan("amazing spider man 300 cgc")).toMatchObject({ pageType: "Product page", recommendedUrl: "/store/amazing-spider-man-300-cgc-9-8", exists: true });
  });

  it("sends buying keywords to pages that already exist", () => {
    expect(plan("silver age comics for sale")).toMatchObject({ pageType: "Collection page", recommendedUrl: "/collections/silver-age", exists: true });
    expect(plan("cgc graded comics for sale")).toMatchObject({ pageType: "Category page", recommendedUrl: "/store" });
    expect(plan("first appearance of deadpool")).toMatchObject({ recommendedUrl: "/guides/first-appearance-of-deadpool", exists: true });
    expect(plan("comic book appraisal")).toMatchObject({ pageType: "Landing page", recommendedUrl: "/services/appraisal-and-valuation" });
    expect(plan("cgc vs cbcs")).toMatchObject({ pageType: "Comparison article", recommendedUrl: "/guides/cgc-vs-cbcs", exists: true });
  });

  it("flags a missing page type instead of inventing a URL that exists", () => {
    expect(plan("batman comics for sale")).toMatchObject({ pageType: "Comic title page", recommendedUrl: "/titles/batman", exists: false });
  });
});
