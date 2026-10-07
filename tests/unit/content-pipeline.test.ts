import { describe, expect, it } from "vitest";
import { CATEGORIES, FORMATS, TOPIC_DEFAULT_CATEGORY, categoryBySlug, categoryOf, schemaTypeFor } from "@/lib/content/categories";
import { findDuplicate, mostSimilar, overlap, phraseSimilarity, repeatedSentenceShare, shingles, type ExistingPage } from "@/lib/content/dedupe";
import { hubTarget } from "@/lib/content/hubs";
import { MIN_RELEVANCE, WEIGHTS, categoryFor, formatFor, hasDemand, mergeByUrl, scoreOpportunity, selectTopics, type Candidate } from "@/lib/content/opportunity";
import { rampTarget } from "@/lib/content/plan";
import { applyVerdict, claimLevelFor, cleanSlug, parseDraft, parseVerdict, writerSystem, writerUser, type Brief } from "@/lib/content/prompt";
import { checkQuality, sanitizeLinks, validateJsonLd, type Draft, type QualityContext } from "@/lib/content/quality";
import { GUIDE_TOPIC_SLUGS } from "@/lib/guides/topics";

const cand = (over: Partial<Candidate> = {}): Candidate => ({ keyword: "amazing spider man 300 value", norm: "amazing spider man 300 value", clusterKey: "issue:asm|300|value", label: "Amazing Spider-Man 300", entityType: "issue", bucket: "value", intent: "commercial", specifics: ["price_value"], volume: 1900, difficulty: 12, relevance: 90, impressions: 40, position: 24, secondary: [], supporting: [], pageType: "Issue guide", recommendedUrl: "/guides/amazing-spider-man-300-value-and-key-facts", planTitle: "Amazing Spider-Man 300: Value, Key Facts and Graded Copies for Sale", planH1: "", planTopics: [], planLinks: [{ label: "ASM 300 CGC 9.6", url: "/store/asm-300-cgc-9-6" }], supportArticles: 3, productCount: 2, competitorGap: false, ...over });

describe("content categories", () => {
  it("has the twenty categories, each filed under an existing topic hub", () => {
    expect(CATEGORIES).toHaveLength(20);
    expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(20);
    for (const c of CATEGORIES) expect(GUIDE_TOPIC_SLUGS, c.slug).toContain(c.topic);
    for (const slug of Object.values(TOPIC_DEFAULT_CATEGORY)) expect(categoryBySlug(slug), slug).not.toBeNull();
  });
  it("files older articles under their topic's category", () => {
    expect(categoryOf({ category: "", topic: "grading" }).slug).toBe("grading-guides");
    expect(categoryOf({ category: "cgc-cbcs", topic: "grading" }).slug).toBe("cgc-cbcs");
    expect(categoryOf({ category: "nonsense", topic: "news" }).slug).toBe("comic-news");
  });
  it("uses NewsArticle only for news", () => {
    expect(schemaTypeFor("news")).toBe("NewsArticle");
    expect(schemaTypeFor("market")).toBe("BlogPosting");
    expect(schemaTypeFor("guide")).toBe("Article");
    for (const f of Object.values(FORMATS)) expect(f.minWords).toBeLessThan(f.maxWords);
  });
});

describe("opportunity scoring", () => {
  it("adds up to 100 at most and explains itself", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const s = scoreOpportunity(cand());
    expect(s.score).toBeGreaterThan(60);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.reason).toMatch(/1,900 searches a month/);
    expect(s.reason).toMatch(/position 24/);
  });
  it("needs evidence of demand", () => {
    expect(hasDemand(cand({ volume: null, impressions: null }))).toBe(false);
    expect(hasDemand(cand({ volume: null, impressions: 12 }))).toBe(true);
    expect(selectTopics([cand({ volume: null, impressions: null })], { target: 10, minScore: 0 })).toHaveLength(0);
  });
  it("drops topics that are not about what the shop does, whatever their volume", () => {
    const offTopic = cand({ keyword: "luann comic strip", norm: "luann comic strip", label: "Luann", volume: 90500, relevance: MIN_RELEVANCE - 1 });
    expect(selectTopics([offTopic], { target: 10, minScore: 0 })).toHaveLength(0);
    expect(selectTopics([cand({ intent: "navigational" })], { target: 10, minScore: 0 })).toHaveLength(0);
  });
  it("prefers easier, more relevant, better supported topics", () => {
    const easy = scoreOpportunity(cand({ difficulty: 5 })).score;
    const hard = scoreOpportunity(cand({ difficulty: 85 })).score;
    expect(easy).toBeGreaterThan(hard);
    expect(scoreOpportunity(cand({ relevance: 95 })).score).toBeGreaterThan(scoreOpportunity(cand({ relevance: 62 })).score);
    expect(scoreOpportunity(cand({ productCount: 3 })).score).toBeGreaterThan(scoreOpportunity(cand({ productCount: 0 })).score);
    expect(scoreOpportunity(cand({ volume: 20000 })).score).toBeGreaterThan(scoreOpportunity(cand({ volume: 50 })).score);
  });
  it("stops at the minimum score, so a thin day stays thin", () => {
    const weak = cand({ norm: "w", keyword: "w", label: "W", volume: 10, difficulty: 90, relevance: 61, impressions: null, position: null, supportArticles: 0, productCount: 0, planLinks: [] });
    const strong = cand();
    expect(scoreOpportunity(weak).score).toBeLessThan(45);
    expect(selectTopics([weak, strong], { target: 100, minScore: 45 }).map((s) => s.norm)).toEqual([strong.norm]);
  });
  it("limits how often one subject or one category appears in a day", () => {
    const many = Array.from({ length: 9 }, (_, i) => cand({ norm: `asm 300 q${i}`, keyword: `asm 300 q${i}`, recommendedUrl: `/guides/a-${i}` }));
    expect(selectTopics(many, { target: 9, minScore: 0 })).toHaveLength(2);
    const sameCategory = Array.from({ length: 30 }, (_, i) => cand({ norm: `book ${i} value`, keyword: `book ${i} value`, label: `Book ${i}`, recommendedUrl: `/guides/b-${i}` }));
    expect(selectTopics(sameCategory, { target: 30, minScore: 0 }).length).toBe(10);
  });
  it("merges keyword clusters planned for the same address into one topic", () => {
    const a = cand({ keyword: "x men 1 cgc", norm: "x men 1 cgc", volume: 480, recommendedUrl: "/guides/x-men-1-value-and-key-facts" });
    const b = cand({ keyword: "x men 1 value", norm: "x men 1 value", volume: 210, recommendedUrl: "/guides/x-men-1-value-and-key-facts" });
    const merged = mergeByUrl([a, b, cand()]);
    expect(merged).toHaveLength(2);
    const lead = merged.find((m) => m.recommendedUrl.includes("x-men"))!;
    expect(lead.keyword).toBe("x men 1 cgc");
    expect(lead.secondary).toContain("x men 1 value");
  });
  it("files topics in sensible categories and formats", () => {
    const c = (norm: string, over: Partial<Candidate> = {}) => categoryFor({ norm, entityType: "topic", bucket: "learn", specifics: [], intent: "informational", ...over });
    expect(c("how to sell comic books")).toBe("selling-guides");
    expect(c("cgc vs cbcs")).toBe("cgc-cbcs");
    expect(c("how are comics graded")).toBe("grading-guides");
    expect(c("silver age comics")).toBe("silver-age");
    expect(c("silver surfer 1 value", { entityType: "issue", bucket: "value" })).toBe("values-market");
    expect(c("fantastic four comic", { entityType: "series", specifics: ["grading"] })).toBe("key-issues");
    expect(c("jack kirby comics")).toBe("creator-stories");
    expect(c("how to store comic books")).toBe("collector-tips");
    expect(c("first appearance of wolverine", { entityType: "first_appearance" })).toBe("character-stories");
    expect(formatFor({ norm: "cgc vs cbcs", entityType: "grading", pageType: "Comparison article", volume: 900, intent: "commercial" }, "cgc-cbcs")).toBe("comparison");
    expect(formatFor({ norm: "what is a cgc 9.8", entityType: "grading", pageType: "Educational article", volume: 300, intent: "informational" }, "cgc-cbcs")).toBe("faq");
    expect(formatFor({ norm: "x men 1 cgc", entityType: "issue", pageType: "Issue guide", volume: 480, intent: "commercial" }, "cgc-cbcs")).toBe("article");
    expect(formatFor({ norm: "comic book grading", entityType: "grading", pageType: "Educational article", volume: 9000, intent: "informational" }, "grading-guides")).toBe("longform");
    expect(formatFor({ norm: "most valuable silver age comics", entityType: "era", pageType: "Educational article", volume: 800, intent: "informational" }, "silver-age")).toBe("list");
  });
  it("ramps up over the first days", () => {
    expect([0, 1, 2, 3, 9].map((d) => rampTarget(100, d, true))).toEqual([10, 25, 50, 100, 100]);
    expect(rampTarget(100, 0, false)).toBe(100);
    expect(rampTarget(8, 0, true)).toBe(8);
  });
});

describe("duplicate detection", () => {
  const pages: ExistingPage[] = [
    { url: "/guides/what-is-a-cgc-graded-comic", title: "What is a CGC graded comic?", kind: "article", keywords: ["what is cgc"] },
    { url: "/guides/first-appearance-of-wolverine", title: "What is the first appearance of Wolverine?", kind: "article", keywords: [] },
    { url: "", title: "hulk 181 value", kind: "task", keywords: ["hulk 181 value"] },
  ];
  it("finds the same keyword, a near-identical keyword, a matching headline and an existing address", () => {
    expect(findDuplicate({ keyword: "what is cgc" }, pages)?.why).toMatch(/already targets/);
    expect(findDuplicate({ keyword: "what is a cgc graded comic book" }, pages)?.url).toBe("/guides/what-is-a-cgc-graded-comic");
    expect(findDuplicate({ keyword: "wolverine first appearance" }, pages)?.url).toBe("/guides/first-appearance-of-wolverine");
    expect(findDuplicate({ keyword: "anything", url: "/guides/first-appearance-of-wolverine" }, pages)?.why).toMatch(/address/);
    expect(findDuplicate({ keyword: "hulk 181 values" }, pages)?.kind).toBe("task");
  });
  it("lets genuinely different topics through", () => {
    expect(findDuplicate({ keyword: "how to store comic books" }, pages)).toBeNull();
    expect(findDuplicate({ keyword: "first appearance of storm" }, pages)).toBeNull();
    expect(findDuplicate({ keyword: "cbcs verified signature" }, pages)).toBeNull();
  });
  it("measures repeated text", () => {
    const a = "The Silver Surfer first appeared in Fantastic Four number forty eight and the character returned in a solo series two years later.";
    expect(overlap(shingles(a), shingles(a))).toBe(1);
    expect(overlap(shingles(a), shingles("A completely different sentence about storing comics in boxes away from light and damp places."))).toBe(0);
    expect(mostSimilar(a, [{ slug: "x", body: `intro. ${a} outro.` }]).share).toBeGreaterThan(0.8);
    expect(repeatedSentenceShare("This sentence is here exactly twice in the text. Another one sits between them for a while. This sentence is here exactly twice in the text.")).toBeCloseTo(1 / 3);
    expect(phraseSimilarity("CGC vs CBCS", "cbcs vs cgc")).toBe(1);
  });
});

const BODY = `Hulk 181 is the first full appearance of Wolverine and one of the most collected Bronze Age comics.

## Why the issue matters

It was published by Marvel with a cover date of November 1974. See the guide to [Wolverine's first appearance](/guides/first-appearance-of-wolverine) for the story behind it.

## What to check before buying

Check the Marvel Value Stamp on the inside page: a clipped stamp earns a Qualified label. Look at the spine and the corners. Read [what a CGC label means](/guides/what-is-a-cgc-graded-comic) and then browse [graded comics for sale](/store).

## Where prices come from

Recent sold results from auction houses are the only reliable guide. Asking prices are not sales.

## Raw copies and graded copies

A raw copy has no verified grade, so a buyer has to judge the condition from photographs and from the seller's description alone. A graded copy has been examined by a third party and sealed in a holder that records the grade, the page quality and any restoration that was found. Neither is wrong for every collector: a reader who wants to open the book will prefer a raw copy, and a buyer who is paying for condition will usually prefer a certified one. Whichever you choose, compare it only with sales of the same kind of copy, because the two markets do not move together.`;
const draft = (over: Partial<Draft> = {}): Draft => ({ title: "Hulk 181: Why the First Wolverine Comic Matters", slug: "hulk-181-first-wolverine", seoTitle: "Hulk 181: First Wolverine, Key Facts and What to Check", metaDescription: "Hulk 181 is the first full appearance of Wolverine. What makes the issue important, what to check on a copy and how to judge a fair price before you buy.", ogTitle: "Hulk 181", ogDescription: "The first Wolverine comic.", answer: "Incredible Hulk 181 (November 1974) is the first full appearance of Wolverine, which makes it the key Bronze Age book for the character.", body: BODY, faq: [{ q: "Is Hulk 181 the first Wolverine?", a: "It is his first full appearance; he has a cameo in the last panel of issue 180." }, { q: "What is the Marvel Value Stamp?", a: "A coupon printed inside the issue; a clipped stamp means a Qualified label." }], primaryKeyword: "hulk 181", secondaryKeywords: [], semanticKeywords: [], tags: ["Bronze Age"], characters: ["Wolverine"], titles: ["Incredible Hulk"], publishers: ["Marvel Comics"], imageAlt: "Header plate for a guide to Incredible Hulk 181", sources: [], ...over });
const qctx = (over: Partial<QualityContext> = {}): QualityContext => ({ format: "faq", allowedLinks: new Set(["/guides/first-appearance-of-wolverine", "/guides/what-is-a-cgc-graded-comic", "/store"]), allowedSources: new Set(), factsText: "Wolverine first appeared in The Incredible Hulk #181 (cover date November 1974)", existingTitles: ["What is a CGC graded comic?"], corpus: [], ...over });

describe("quality gate", () => {
  it("passes a clean article", () => {
    const r = checkQuality(draft(), qctx());
    expect(r.blocked).toBe(false);
    expect(r.needsReview).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.internalLinks).toBe(3);
  });
  it("blocks a headline the site already has, a stuffed keyword and a copied text", () => {
    expect(checkQuality(draft({ title: "What is a CGC graded comic?" }), qctx()).blocked).toBe(true);
    const stuffed = draft({ body: `${BODY}\n\n${"Hulk 181 is great and hulk 181 matters because hulk 181 is hulk 181. ".repeat(12)}` });
    expect(checkQuality(stuffed, qctx()).checks.find((c) => c.id === "keyword-density")?.ok).toBe(false);
    expect(checkQuality(draft(), qctx({ corpus: [{ slug: "twin", body: BODY }] })).blocked).toBe(true);
  });
  it("sends unsupported prices, percentages and quotations to a person", () => {
    const priced = checkQuality(draft({ body: `${BODY}\n\nA CGC 9.8 copy sold for $146,000 in 2021, up 35% in a year.` }), qctx());
    expect(priced.blocked).toBe(false);
    expect(priced.needsReview).toBe(true);
    expect(priced.checks.find((c) => c.id === "figures")?.detail).toMatch(/146,000/);
    const supplied = checkQuality(draft({ body: `${BODY}\n\nA CGC 9.8 copy sold for $146,000.` }), qctx({ factsText: "Heritage: a CGC 9.8 copy sold for $146,000" }));
    expect(supplied.checks.find((c) => c.id === "figures")?.ok).toBe(true);
    const quoted = checkQuality(draft({ body: `${BODY}\n\nThe artist said “I never expected the character to become this popular with readers”.` }), qctx());
    expect(quoted.checks.find((c) => c.id === "quotes")?.ok).toBe(false);
  });
  it("turns links to unknown addresses back into plain text", () => {
    const s = sanitizeLinks("See [a made-up page](/guides/does-not-exist), [the store](/store) and [a site](https://example.com/x).", qctx());
    expect(s.body).toBe("See a made-up page, [the store](/store) and a site.");
    expect(s.removed).toEqual(["/guides/does-not-exist", "https://example.com/x"]);
  });
  it("flags an outline shared with another article as a template", () => {
    const other = BODY.replace(/Hulk 181/g, "X-Men 1").replace(/Wolverine/g, "Magneto").replace("Check the Marvel Value Stamp on the inside page: a clipped stamp earns a Qualified label.", "The cover is prone to chipping along the top edge of the book.").replace("Recent sold results from auction houses are the only reliable guide. Asking prices are not sales.", "Compare several sales at the same grade and label before agreeing a figure.").replace("It was published by Marvel with a cover date of November 1974.", "The team and its first enemy both debut in these pages in 1963.");
    const r = checkQuality(draft(), qctx({ corpus: [{ slug: "x-men-1", body: other }] }));
    expect(r.checks.find((c) => c.id === "outline")?.ok).toBe(false);
  });
  it("requires a real source and a label on news", () => {
    const news = draft({ sources: [{ label: "Heritage", url: "https://www.ha.com/x" }], claimLevel: "confirmed" });
    expect(checkQuality(news, qctx({ format: "news", allowedSources: new Set(["https://www.ha.com/x"]) })).blocked).toBe(false);
    expect(checkQuality(news, qctx({ format: "news" })).blocked).toBe(true); // a source the search never returned
    expect(checkQuality({ ...news, claimLevel: undefined }, qctx({ format: "news", allowedSources: new Set(["https://www.ha.com/x"]) })).blocked).toBe(true);
  });
  it("validates structured data before it is emitted", () => {
    const ok = { "@context": "https://schema.org", "@type": "Article", headline: "H", datePublished: "2026-10-07T00:00:00Z", dateModified: "2026-10-07T00:00:00Z", author: { "@id": "x" }, publisher: { "@id": "x" }, mainEntityOfPage: { "@id": "y" }, image: ["z"] };
    expect(validateJsonLd(ok)).toEqual([]);
    expect(validateJsonLd({ ...ok, datePublished: undefined })).toEqual(["Article: missing datePublished"]);
    expect(validateJsonLd({ ...ok, "@type": "NewsArticle", headline: "x".repeat(120) })).toHaveLength(1);
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }] })).toEqual([]);
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] })).toHaveLength(1);
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "Product" })).toHaveLength(1);
  });
});

describe("writer and checker replies", () => {
  const reply = `<<<META>>>\n{"title":"Hulk 181: Why It Matters","slug":"Hulk 181 — Why It Matters!","seoTitle":"Hulk 181","metaDescription":"About Hulk 181.","answer":"Incredible Hulk 181 is the first full appearance of Wolverine and a Bronze Age key.","primaryKeyword":"hulk 181","secondaryKeywords":["hulk 181 value"],"tags":["Bronze Age"],"characters":["Wolverine"],"titles":[],"publishers":[],"imageAlt":"Plate","faq":[{"q":"Is it the first Wolverine?","a":"It is his first full appearance."}],"sources":[{"label":"x","url":"javascript:alert(1)"}]}\n<<<BODY>>>\n# Hulk 181\n\n${BODY}\n<<<END>>>`;
  it("reads a well-formed reply and cleans what it keeps", () => {
    const p = parseDraft(reply);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.draft.slug).toBe("hulk-181-why-it-matters");
    expect(p.draft.body.startsWith("Hulk 181 is the first")).toBe(true); // the repeated headline is dropped
    expect(p.draft.sources[0].url).toBeUndefined(); // not an https address
    expect(p.draft.faq).toHaveLength(1);
  });
  it("treats a refusal as a skip and anything malformed as a failure", () => {
    expect(parseDraft("<<<SKIP>>> The subject is ambiguous.")).toEqual({ ok: false, skipped: true, reason: "The subject is ambiguous." });
    expect(parseDraft("Here is your article!")).toMatchObject({ ok: false, skipped: false });
    expect(parseDraft("<<<META>>>\n{not json}\n<<<BODY>>>\ntext text text")).toMatchObject({ ok: false, skipped: false });
    expect(cleanSlug("Crème de la Crème #1!")).toBe("creme-de-la-creme-1");
  });
  it("gives the writer the facts, the links and the rules", () => {
    const brief: Brief = { kind: "new", keyword: "hulk 181", secondary: ["hulk 181 value"], supporting: [], intent: "commercial", category: "key-issues", format: "article", subject: "Incredible Hulk 181", planTitle: "", outline: [], facts: ["Wolverine first appeared in The Incredible Hulk #181."], links: [{ url: "/store", label: "All comics", kind: "hub" }], covered: ["What is the first appearance of Wolverine?"], today: "2026-10-07" };
    const user = writerUser(brief);
    expect(user).toContain("Wolverine first appeared in The Incredible Hulk #181.");
    expect(user).toContain("/store — All comics (hub)");
    expect(user).toContain("What is the first appearance of Wolverine?");
    const sys = writerSystem();
    expect(sys).toMatch(/Never give a sale price/);
    expect(sys).toMatch(/Never quote anyone/);
    expect(sys).toMatch(/<<<SKIP>>>/);
    expect(sys).toMatch(/could be reused for another comic by changing the title is a failure/);
  });
  it("reads a verdict strictly and removes what was flagged", () => {
    expect(parseVerdict("not json")).toBeNull();
    expect(parseVerdict('{"verdict":"maybe","issues":[]}')).toBeNull();
    const v = parseVerdict('Here: {"verdict":"fix","issues":[{"sentence":"Check the Marvel Value Stamp on the inside page: a clipped stamp earns a Qualified label.","problem":"unverified","severity":"medium"},{"sentence":"A sentence that is not in the article at all.","problem":"x","severity":"high"},{"sentence":"Asking prices are not sales.","problem":"nitpick","severity":"low"}],"summary":"ok"}')!;
    expect(v.verdict).toBe("fix");
    const out = applyVerdict(draft(), v);
    expect(out.removed).toHaveLength(1);
    expect(out.unresolved).toHaveLength(1);
    expect(out.draft.body).not.toContain("Marvel Value Stamp");
    expect(out.draft.body).toContain("Asking prices are not sales."); // low severity stays
    expect(out.draft.body).toContain("## What to check before buying"); // the section still has text, so its heading stays
  });
  it("drops a heading whose whole section was removed", () => {
    const body = "Intro paragraph here.\n\n## Empty soon\n\nOnly sentence in the section.\n\n## Stays\n\nKept text.";
    const out = applyVerdict({ body, answer: "", faq: [] }, { verdict: "fix", summary: "", issues: [{ sentence: "Only sentence in the section.", problem: "wrong", severity: "high" }] });
    expect(out.draft.body).toBe("Intro paragraph here.\n\n## Stays\n\nKept text.");
  });
  it("labels news by its sources, never by the writer's say-so", () => {
    expect(claimLevelFor("confirmed", [])).toBe("rumor");
    expect(claimLevelFor("confirmed", ["https://comicbook.com/a"])).toBe("reported");
    expect(claimLevelFor("reported", ["https://www.cgccomics.com/news/1"])).toBe("confirmed");
    expect(claimLevelFor(undefined, ["https://icv2.com/a", "https://www.comicsbeat.com/b"])).toBe("confirmed");
    expect(claimLevelFor("rumor", ["https://www.cgccomics.com/news/1"])).toBe("rumor");
    expect(claimLevelFor("analysis", ["https://icv2.com/a"])).toBe("analysis");
    expect(claimLevelFor("confirmed", ["https://evil.example/cgccomics.com"])).toBe("reported");
  });
});

describe("hub addresses", () => {
  it("lead to the page that already is the hub, and to nothing else", () => {
    expect(hubTarget("cgc-grading", [])).toBe("/guides/category/cgc-cbcs");
    expect(hubTarget("comic-book-values", [])).toBe("/guides/category/values-market");
    expect(hubTarget("silver-age-comics", [])).toBe("/guides/category/silver-age");
    expect(hubTarget("key-issues", [])).toBe("/guides/category/key-issues");
    expect(hubTarget("spider-man", ["spider-man", "batman"])).toBe("/characters/spider-man");
    expect(hubTarget("spider-man", [])).toBeNull();
    expect(hubTarget("made-up-thing", ["spider-man"])).toBeNull();
  });
});
