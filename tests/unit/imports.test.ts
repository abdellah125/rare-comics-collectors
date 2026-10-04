import { describe, expect, it } from "vitest";
import { marginOf, reprice, retailPrice } from "@/lib/imports/pricing";
import { candidateKeywords, defaultSeoDescription, defaultSeoTitle, seoChecks, type SeoFacts } from "@/lib/imports/seo-rules";
import { availabilityOf, readSource, SourceFormatError } from "@/lib/imports/source";
import { dedupeKey, itemStatusLabel, releaseProblems } from "@/lib/imports/status";

describe("import pricing", () => {
  it("adds 25% to the source price", () => {
    expect(retailPrice(10_000)).toBe(12_500);
    expect(retailPrice(20_000)).toBe(25_000);
    expect(retailPrice(1_999)).toBe(2_499);
    expect(retailPrice(10_000, 1000)).toBe(11_000);
    expect(marginOf(10_000, 12_500)).toEqual({ amount: 2_500, bps: 2500 });
    expect(marginOf(null, 12_500)).toBeNull();
  });

  it("follows a source price change when the price was never edited", () => {
    expect(reprice({ newSource: 12_000, markupBps: 2500, currentRetail: 12_500, manual: false, autoSync: false })).toEqual({ retail: 15_000, manual: false, changed: true, note: null });
  });

  it("keeps a hand-set price and says so, unless automatic price sync is on", () => {
    const kept = reprice({ newSource: 12_000, markupBps: 2500, currentRetail: 13_900, manual: true, autoSync: false });
    expect(kept.retail).toBe(13_900);
    expect(kept.manual).toBe(true);
    expect(kept.changed).toBe(false);
    expect(kept.note).toMatch(/150\.00.*139\.00 was kept/);
    expect(reprice({ newSource: 12_000, markupBps: 2500, currentRetail: 13_900, manual: true, autoSync: true })).toEqual({ retail: 15_000, manual: false, changed: true, note: null });
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
  it("names every missing fact", () => {
    expect(releaseProblems({ ...ok, year: null, grade: "", hasImage: false, retailPrice: null, available: false })).toEqual(["no publication year", "no grade", "no price", "no photo stored yet", "marked unavailable at the source"]);
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
