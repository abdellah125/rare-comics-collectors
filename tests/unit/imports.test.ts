import { describe, expect, it } from "vitest";
import { adjustmentForDiscount, describeAdjustment, marginOf, reprice, retailPrice } from "@/lib/imports/pricing";
import { catalogPagePath, listingToRow, PageFormatError, readPageState } from "@/lib/imports/catalog-page";
import { robotsAllows, robotsRules } from "@/lib/imports/robots";
import { LOOKS_SLABBED, buildRawListing, rawCondition } from "@/lib/imports/raw";
import { addComp, newCompIndex, numericGrade, suggestBuyNow } from "@/lib/imports/suggest";
import { bookKey } from "@/lib/imports/status";
import { buildPlainListing } from "@/lib/imports/plain";
import { gradeLabel, joinKnown, yearText } from "@/lib/catalog/labels";
import { candidateKeywords, defaultSeoDescription, defaultSeoTitle, seoChecks, type SeoFacts } from "@/lib/imports/seo-rules";
import { availabilityOf, readSource, SourceFormatError } from "@/lib/imports/source";
import { dedupeKey, itemStatusLabel, releaseProblems } from "@/lib/imports/status";

describe("import pricing", () => {
  it("takes 25% off the source price and never raises it", () => {
    expect(retailPrice(10_000)).toBe(7_500);
    expect(retailPrice(20_000)).toBe(15_000);
    expect(retailPrice(50_000)).toBe(37_500);
    expect(retailPrice(1_999)).toBe(1_499);
    expect(retailPrice(10_000, adjustmentForDiscount(1000))).toBe(9_000);
    expect(adjustmentForDiscount(2500)).toBe(-2500);
    expect(describeAdjustment(-2500)).toBe("25% discount");
    for (const source of [100, 999, 12_345, 1_595_099]) expect(retailPrice(source)).toBeLessThan(source);
    expect(marginOf(10_000, 7_500)).toEqual({ amount: -2_500, bps: -2500 });
    expect(marginOf(null, 12_500)).toBeNull();
  });

  it("follows a source price change when the price was never edited", () => {
    expect(reprice({ newSource: 12_000, markupBps: -2500, currentRetail: 7_500, manual: false, autoSync: false })).toEqual({ retail: 9_000, manual: false, changed: true, note: null });
  });

  it("keeps a hand-set price and says so, unless automatic price sync is on", () => {
    const kept = reprice({ newSource: 12_000, markupBps: -2500, currentRetail: 13_900, manual: true, autoSync: false });
    expect(kept.retail).toBe(13_900);
    expect(kept.manual).toBe(true);
    expect(kept.changed).toBe(false);
    expect(kept.note).toMatch(/90\.00.*139\.00 was kept/);
    expect(reprice({ newSource: 12_000, markupBps: -2500, currentRetail: 13_900, manual: true, autoSync: true })).toEqual({ retail: 9_000, manual: false, changed: true, note: null });
  });
});

describe("duplicate key", () => {
  const book = { publisher: "Marvel Comics", title: "The Amazing Spider-Man", issue: "#300", grade: "9.8", grader: "CGC", label: "Universal Blue" };
  it("ignores case, punctuation, a leading article and the word Comics", () => {
    expect(dedupeKey(book)).toBe(dedupeKey({ ...book, publisher: "MARVEL", title: "Amazing Spider-Man", issue: "300" }));
  });
  it("tells grades, graders, labels and variants apart", () => {
    const key = dedupeKey(book);
    expect(dedupeKey({ ...book, grade: "9.6" })).not.toBe(key);
    expect(dedupeKey({ ...book, grader: "CBCS" })).not.toBe(key);
    expect(dedupeKey({ ...book, label: "Signature Series (Yellow)" })).not.toBe(key);
    expect(dedupeKey({ ...book, variant: "Newsstand" })).not.toBe(key);
    expect(dedupeKey({ ...book, issue: "#301" })).not.toBe(key);
  });
  it("gives no key when a fact is missing", () => {
    expect(dedupeKey({ ...book, grade: "" })).toBe("");
  });
});

describe("release check", () => {
  const ok = { title: "X-Men", issue: "#1", publisher: "Marvel Comics", year: 1963, era: "Silver Age", grader: "CGC", grade: "9.0", retailPrice: 125_000, summary: "s", description: "d", slug: "x-men-1-cgc-9-0", hasImage: true, available: true };
  it("passes a complete product", () => expect(releaseProblems(ok)).toEqual([]));
  it("requires only what a listing page and Merchant Center need", () => {
    // Unknown publisher, grade and grading company, and no year, are allowed.
    expect(releaseProblems({ ...ok, year: null, publisher: "Unknown", grade: "Unknown", grader: "Unknown", era: "Unknown" })).toEqual([]);
    expect(releaseProblems({ ...ok, grade: "", hasImage: false, retailPrice: null, available: false })).toEqual(["no grade (use Unknown when it is not stated)", "no price", "no photo stored yet", "marked unavailable at the source"]);
    expect(releaseProblems({ ...ok, year: 123 })).toEqual(["publication year is not a valid year"]);
  });
  it("labels statuses the way the dashboard shows them", () => {
    expect(itemStatusLabel("pending_review")).toBe("Pending Review");
    expect(itemStatusLabel("ready")).toBe("Ready to Release");
  });
});

describe("SEO defaults and checks", () => {
  const f: SeoFacts = { title: "Amazing Spider-Man", issue: "#300", publisher: "Marvel Comics", year: 1988, grader: "CGC", grade: "9.8", label: "Universal Blue", keyIssue: "First full appearance of Venom", slug: "amazing-spider-man-300-cgc-9-8" };
  it("builds the title and description from the facts only", () => {
    expect(defaultSeoTitle(f)).toBe("Amazing Spider-Man #300 — CGC 9.8 (1988) for Sale");
    const d = defaultSeoDescription(f, 14);
    expect(d).toContain("Amazing Spider-Man #300, Marvel Comics 1988. CGC 9.8 — First full appearance of Venom.");
    expect(d).toContain("14-day return window");
    expect(d.length).toBeLessThanOrEqual(165);
    expect(d).not.toMatch(/\$/);
  });
  it("lists search phrases a buyer of this book could use", () => {
    expect(candidateKeywords(f)).toEqual(["amazing spider-man 300", "amazing spider-man 300 cgc", "amazing spider-man 300 cgc 9.8", "amazing spider-man 300 for sale", "amazing spider-man 300 value", "amazing spider-man 300 1988"]);
  });
  it("accepts the defaults and flags stuffing, wrong facts and bad slugs", () => {
    const good = { seoTitle: defaultSeoTitle(f), seoDescription: defaultSeoDescription(f, 14), slug: f.slug, primaryKeyword: "amazing spider-man 300" };
    expect(seoChecks(good, f)).toEqual([]);
    expect(seoChecks({ ...good, seoTitle: "Amazing Spider-Man Amazing Spider-Man #300 CGC 9.8 Amazing Spider-Man" }, f).join(" ")).toMatch(/keyword stuffing/);
    expect(seoChecks({ ...good, seoTitle: "Amazing Spider-Man #301 — CGC 9.8 (1988) for Sale" }, f).join(" ")).toMatch(/does not state the issue number/);
    expect(seoChecks({ ...good, seoTitle: "Amazing Spider-Man #300 — CGC 9.6 for Sale" }, f).join(" ")).toMatch(/does not state the grade/);
    expect(seoChecks({ ...good, slug: "Amazing Spider Man" }, f).join(" ")).toMatch(/URL slug/);
    expect(seoChecks({ ...good, seoDescription: "" }, f).join(" ")).toMatch(/No meta description/);
  });
});

describe("reading source data", () => {
  it("reads a CSV with plain headers", () => {
    const rows = readSource("id,url,title,price,image,publisher,year,availability\n77,https://www.hipcomic.com/listing/x/77,X-Men 1 CGC 9.0,\"$1,250.00\",https://img.hipcomic.com/p/abc.jpg,Marvel Comics,1963,sold\n", "feed.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceId: "77", title: "X-Men 1 CGC 9.0", price: 125_000, currency: "USD", available: false, problems: [] });
    expect(rows[0].extra).toMatchObject({ publisher: "Marvel Comics", year: "1963" });
  });
  it("reads a JSON feed and takes the id from the URL when none is given", () => {
    const rows = readSource(JSON.stringify({ products: [{ url: "https://www.hipcomic.com/listing/hulk-181/9001", title: "Hulk 181 CGC 8.0", price: 4500, image: "https://img.hipcomic.com/p/def.jpg", in_stock: true }] }), "feed.json");
    expect(rows[0]).toMatchObject({ sourceId: "9001", price: 450_000, available: true });
  });
  it("reports rows it cannot use instead of guessing", () => {
    const rows = readSource("id,title,price,image\n5,,abc,\n", "bad.csv");
    expect(rows[0].problems).toEqual(["no title", "no readable price", "no image"]);
  });
  it("refuses a web page (an access check) and unknown formats", () => {
    expect(() => readSource("<!DOCTYPE html><html><title>Just a moment...</title></html>", "x")).toThrow(SourceFormatError);
    expect(() => readSource("a,b\n1,2\n", "x.csv")).toThrow(/no title column/);
    expect(() => readSource("", "x.csv")).toThrow(/empty/);
  });
  it("understands availability words", () => {
    expect(availabilityOf("Sold")).toBe(false);
    expect(availabilityOf("in stock")).toBe(true);
    expect(availabilityOf(0)).toBe(false);
    expect(availabilityOf("")).toBeNull();
    expect(availabilityOf("maybe")).toBeNull();
  });
});

describe("robots.txt", () => {
  const text = [
    "User-agent: Googlebot", "Crawl-delay: 5", "Disallow: /search/", "",
    "User-agent: *", "Crawl-delay: 5", "Disallow: /*?sort*", "Disallow: /*?limit*", "Disallow: /search/", "Disallow: /search*,*", "Disallow: /cart/", "Allow: /cart/help",
  ].join("\n");
  const rules = robotsRules(text, "RareComicsCollectors-Import/1.0 (+https://example.com)");
  it("uses the generic group and its crawl delay for a client without its own group", () => {
    expect(rules.crawlDelay).toBe(5);
    expect(rules.disallow).toContain("/search/");
  });
  it("allows clean catalogue pages and refuses what is disallowed", () => {
    // Page 1 is the plain address; later pages carry ?page=N.
    expect(catalogPagePath(1)).toBe("/search");
    expect(catalogPagePath(2)).toBe("/search?page=2");
    expect(catalogPagePath(208)).toBe("/search?page=208");
    expect(robotsAllows(rules, catalogPagePath(1))).toBe(true);
    expect(robotsAllows(rules, "/search?page=2")).toBe(true);
    expect(robotsAllows(rules, "/search?page=208")).toBe(true);
    expect(robotsAllows(rules, "/search/comics?page=2")).toBe(false);
    expect(robotsAllows(rules, "/search?sort=price")).toBe(false);
    expect(robotsAllows(rules, "/search?details_grade=a,b")).toBe(false);
    expect(robotsAllows(rules, "/cart/")).toBe(false);
    expect(robotsAllows(rules, "/cart/help")).toBe(true);
  });
  it("honours a group written for this client", () => {
    const own = robotsRules("User-agent: *\nDisallow:\n\nUser-agent: RareComicsCollectors-Import\nDisallow: /", "RareComicsCollectors-Import/1.0");
    expect(robotsAllows(own, "/search?page=1")).toBe(false);
  });
});

describe("catalogue page", () => {
  const page = (body: string) => "<html><script>window.__NUXT__=(function(a,b){return {data:[{searchListings:" + body + ",searchListingsCount:2,paginationExceeded:b}]}}(\"USD\",false));</script></html>";
  const listing = '{id:77,name:"GHOST RIDER 1 CGC 9.2 MARVEL 1973",listing_type:"product",username:"SELLER",currency:a,quantity:1,current_price:2500,active:true,closed:b,deleted:b,images:["https://img.hipcomic.com/p/abc.jpg"],url:"https://www.hipcomic.com/listing/ghost-rider-1/77?sponsored=1",search:{open:true,sold:b,price_usd:2500,catalog_condition:{grade:"9.2",grader:"CGC",slabbed:true}},details:{series_name:"Ghost Rider (1973)",issue_number:"1",publisher:"Marvel"}}';
  const canon = (n: string) => (n === "Marvel" ? "Marvel Comics" : n);
  it("reads the listings out of the page data", () => {
    const state = readPageState(page("[" + listing + "]"));
    expect(state.listings).toHaveLength(1);
    expect(state.total).toBe(2);
    const row = listingToRow(state.listings[0], "page 1", 1, canon);
    expect(row).toMatchObject({ sourceId: "77", url: "https://www.hipcomic.com/listing/ghost-rider-1/77", price: 250_000, currency: "USD", seller: "SELLER", auction: false, available: true, fillOnly: true, problems: [] });
    // The series' start year is not taken as the publication year.
    expect(row.extra).toMatchObject({ series: "Ghost Rider", issue: "1", publisher: "Marvel Comics", grade: "9.2", grader: "CGC", year: "" });
  });
  it("marks auctions, raw books and sold listings for what they are", () => {
    const state = readPageState(page('[{id:1,name:"X 4",listing_type:"auction",currency:a,current_price:0.99,buyout_price:25,images:[],search:{open:true,sold:true,catalog_condition:{slabbed:b}},details:{grade:"8.5 VF+"}}]'));
    const row = listingToRow(state.listings[0], "page 1", 1, canon);
    expect(row.auction).toBe(true);
    expect(row.buyNow).toBe(2_500);
    expect(row.available).toBe(false);
    expect(row.slabbed).toBe(false);
    expect(row.extra.rawGrade).toBe("8.5 VF+");
    expect(row.problems).toEqual(["no image"]);
    expect(row.extra.grader).toBe("");
  });
  it("refuses a page without listing data, and page data cannot run code of its own making", () => {
    expect(() => readPageState("<html>Just a moment...</html>")).toThrow(PageFormatError);
    expect(() => readPageState('<script>window.__NUXT__=(function(){return {data:[{searchListings:[this.constructor.constructor("return process")()]}]}}());</script>')).toThrow(PageFormatError);
    expect(() => readPageState("<script>window.__NUXT__=process.exit(1);</script>")).toThrow(PageFormatError);
  });
});

describe("suggested Buy It Now price for auctions", () => {
  const base = { buyNow: null, bid: 1_700, key: "dc|hawkman|3|8.0|cgc|universal blue|", bookKey: "hawkman|3|cgc", grade: "8.0", adjustmentBps: -2500, bidMultiplierPct: 200, minPrice: 499 };
  it("uses the source's own Buy It Now price, less the discount, when the auction has one", () => {
    const s = suggestBuyNow({ ...base, buyNow: 10_000, comps: newCompIndex() });
    expect(s.price).toBe(7_500);
    expect(s.estimated).toBe(false);
    expect(s.basis).toMatch(/own Buy It Now price/);
  });
  it("then the median of the same book in the same grade", () => {
    const comps = newCompIndex();
    for (const price of [9_000, 12_000, 30_000]) addComp(comps, { key: base.key, bookKey: base.bookKey, grade: "8.0", price });
    const s = suggestBuyNow({ ...base, comps });
    expect(s.price).toBe(12_000);
    expect(s.basis).toMatch(/3 other listings of the same book in the same grade/);
  });
  it("then the nearest grade within one point, and says it is an estimate", () => {
    const comps = newCompIndex();
    addComp(comps, { key: "other", bookKey: base.bookKey, grade: "7.5", price: 8_000 });
    addComp(comps, { key: "far", bookKey: base.bookKey, grade: "4.0", price: 2_000 });
    const s = suggestBuyNow({ ...base, comps });
    expect(s.price).toBe(8_000);
    expect(s.estimated).toBe(true);
    expect(s.basis).toMatch(/nearest grade \(7\.5\); this copy is 8\.0/);
  });
  it("falls back to the bid rule with a minimum, and never goes below the current bid", () => {
    expect(suggestBuyNow({ ...base, comps: newCompIndex() }).price).toBe(3_400);
    const cheap = suggestBuyNow({ ...base, bid: 99, comps: newCompIndex() });
    expect(cheap.price).toBe(499);
    expect(cheap.basis).toMatch(/fallback rule, not a market price/);
    const comps = newCompIndex();
    addComp(comps, { key: base.key, bookKey: base.bookKey, grade: "8.0", price: 1_000 });
    expect(suggestBuyNow({ ...base, comps }).price).toBe(1_700);
  });
  it("reads numeric grades and builds the book key", () => {
    expect(numericGrade("VF+ 8.5")).toBe(8.5);
    expect(numericGrade("Not graded")).toBeNull();
    expect(bookKey({ title: "The Avengers", issue: "#57", grader: "Raw" })).toBe("avengers|57|raw");
  });
});

describe("raw books", () => {
  it("takes the condition only from what the listing states", () => {
    expect(rawCondition("AMAZING SPIDER-MAN 44 VF+ 8.5 2nd LIZARD")).toBe("VF+ 8.5");
    expect(rawCondition("Avengers 4 NM- Captain America returns")).toBe("NM-");
    expect(rawCondition("Batman #232 Very Fine copy")).toBe("VF");
    expect(rawCondition("Excalibur #4 (2004) Excalibur")).toBeNull();
    // Words that only look like grades are not grades.
    expect(rawCondition("The Good Guys #3 (1993) Fine Art issue")).toBeNull();
    expect(rawCondition("Hawkman #3 (1964) $1.50 cover")).toBeNull();
  });
  it("recognises slab wording without a grading company", () => {
    expect(LOOKS_SLABBED.test("Amazing Spider-Man 300 9.8 White Pages")).toBe(true);
    expect(LOOKS_SLABBED.test("Excalibur #4 (2004) Excalibur")).toBe(false);
  });
  it("describes a raw book without claiming a grade it does not have", () => {
    const p = { series: "Excalibur", issue: "#4", publisher: "Marvel Comics", year: 2004, era: "Modern Age", notes: "Excalibur" };
    const taken = new Set<string>();
    const unstated = buildRawListing({ sourceId: "1", p, condition: null }, taken);
    expect(unstated).toMatchObject({ slug: "excalibur-4-raw", grader: "Raw", grade: "Not graded", label: "Raw", certNumber: null, keyIssue: null });
    expect(unstated.description).toMatch(/has not been graded or sealed by a grading company/);
    expect(unstated.description).toMatch(/does not state a grade/);
    expect(unstated.summary).not.toMatch(/— Excalibur/);
    const stated = buildRawListing({ sourceId: "2", p: { ...p, notes: "1st Vision" }, condition: "VF+" }, taken);
    expect(stated.slug).toBe("excalibur-4-raw-vf-plus");
    expect(stated.grade).toBe("VF+");
    expect(stated.keyIssue).toBe("1st Vision");
    expect(stated.description).toMatch(/seller's own assessment, not a certified grade/);
    // A second copy of the same book gets its own address.
    expect(buildRawListing({ sourceId: "3", p, condition: null }, taken).slug).toBe("excalibur-4-raw-3");
  });
});

describe("unknown details", () => {
  it("words a listing only from what is known", () => {
    const taken = new Set<string>();
    const l = buildPlainListing({ sourceId: "9", p: { series: "Spider-Man Noir", issue: "#1", publisher: null, year: null, era: null, grader: "CGC", grade: "9.8", label: "Universal Blue", notes: "1st Spider-Man Noir" } }, taken);
    expect(l).toMatchObject({ slug: "spider-man-noir-1-cgc-9-8", publisher: "Unknown", year: null, era: "Unknown", grader: "CGC", grade: "9.8", keyIssue: "1st Spider-Man Noir" });
    expect(l.summary).toBe("Spider-Man Noir #1 — 1st Spider-Man Noir. CGC 9.8.");
    expect(l.description).toMatch(/does not state the publisher or the publication year/);
    expect(l.description).not.toMatch(/Unknown|null|undefined/);
    expect(l.tags).toEqual(["Spider-Man Noir", "CGC"]);
  });
  it("handles a slab without a stated grade, an unnamed grading company and a lot", () => {
    const taken = new Set<string>();
    const noGrade = buildPlainListing({ sourceId: "1", p: { series: "Wizard", issue: "#1", publisher: "Wizard Press", year: 1991, era: "Copper Age", grader: "CGC", grade: null, label: null } }, taken);
    expect(noGrade).toMatchObject({ grade: "Unknown", label: "Unknown", slug: "wizard-1-cgc" });
    expect(noGrade.description).toMatch(/In a CGC holder; the grade is not stated/);
    const noCompany = buildPlainListing({ sourceId: "2", p: { series: "Amazing Spider-Man", issue: "#300", publisher: "Marvel Comics", year: 1988, era: "Copper Age", grader: null, grade: "9.8", label: null } }, taken);
    expect(noCompany.grader).toBe("Unknown");
    expect(noCompany.description).toMatch(/does not name a grading company; the grade it states is 9\.8/);
    const lot = buildPlainListing({ sourceId: "3", p: { series: "Lot of 12 Excalibur Comics", issue: "nn", publisher: "Marvel Comics", year: null, era: null, grader: "Raw", grade: null, label: null, lot: true } }, taken);
    expect(lot).toMatchObject({ issue: "nn", grader: "Raw", grade: "Not graded", slug: "lot-of-12-excalibur-comics-nn-raw" });
    expect(lot.description).toMatch(/more than one book sold together/);
  });
  it("prints unknown values without blanks or zeros", () => {
    expect(yearText(0)).toBe("");
    expect(yearText(1963)).toBe("1963");
    expect(joinKnown(["Unknown", "1963"])).toBe("1963");
    expect(joinKnown(["Unknown", ""])).toBe("");
    expect(gradeLabel("CGC", "9.8")).toBe("CGC 9.8");
    expect(gradeLabel("Raw", "VF+", " · ")).toBe("Raw · VF+");
    expect(gradeLabel("Raw", "Not graded")).toBe("Raw, not graded");
    expect(gradeLabel("CGC", "Unknown")).toBe("CGC (grade not stated)");
    expect(gradeLabel("Unknown", "9.8")).toBe("Grade 9.8 (grading company not stated)");
  });
  it("builds SEO text without the unknown parts", () => {
    const f: SeoFacts = { title: "Collected Skunkworks", issue: "nn", publisher: "Unknown", year: 2002, grader: "Raw", grade: "Not graded", label: "Raw", keyIssue: null, slug: "collected-skunkworks-nn-raw" };
    expect(defaultSeoTitle(f)).toBe("Collected Skunkworks — Raw, not graded (2002) for Sale");
    expect(defaultSeoDescription(f, 14)).toMatch(/^Collected Skunkworks, 2002\. Raw, not graded\./);
    expect(candidateKeywords(f)).toEqual(["collected skunkworks", "collected skunkworks for sale", "collected skunkworks value", "collected skunkworks 2002"]);
    expect(seoChecks({ seoTitle: defaultSeoTitle(f), seoDescription: defaultSeoDescription(f, 14), slug: f.slug, primaryKeyword: "collected skunkworks" }, f)).toEqual([]);
  });
});

describe("reference-knowledge answers", () => {
  const questions = [
    { id: "a", listingTitle: "SPIDER-MAN NOIR #1 CGC 9.8", series: "Spider-Man Noir", issue: "#1", needPublisher: true, needYear: true },
    { id: "b", listingTitle: "Wizard #1", series: "Wizard", issue: "#1", needPublisher: true, needYear: false },
    { id: "c", listingTitle: "Avengers #1", series: "Avengers", issue: "#1", needPublisher: false, needYear: true },
  ];
  it("keeps only certain, well-formed answers to what was asked", async () => {
    const { parseFactAnswers } = await import("@/lib/imports/enrich");
    const text = 'Here you go:\n[{"id":"a","publisher":"Marvel Comics","year":2009,"certain":true},{"id":"b","publisher":"Wizard Press","year":1991,"certain":false},{"id":"c","publisher":"Marvel Comics","year":1963,"certain":true},{"id":"zzz","publisher":"X","year":2000,"certain":true}]';
    const answers = parseFactAnswers(text, questions);
    expect(answers.get("a")).toEqual({ publisher: "Marvel Comics", year: 2009 });
    expect(answers.has("b")).toBe(false);
    // Only the year was asked for.
    expect(answers.get("c")).toEqual({ year: 1963 });
    expect(answers.has("zzz")).toBe(false);
  });
  it("drops impossible years, placeholder publishers and broken output", async () => {
    const { parseFactAnswers } = await import("@/lib/imports/enrich");
    expect(parseFactAnswers('[{"id":"a","publisher":"Unknown","year":1066,"certain":true}]', questions).size).toBe(0);
    expect(parseFactAnswers("I am not sure.", questions).size).toBe(0);
    expect(parseFactAnswers('[{"id":"a","publisher":', questions).size).toBe(0);
  });
});
