import { describe, expect, it } from "vitest";
import { coverAlt } from "@/lib/catalog/labels";
import { pageHref, readPage } from "@/components/hub-pagination";
import { DESCRIPTION_MAX, clampDescription, pageMetadata, searchTitle } from "@/lib/seo";

describe("titles that fit a search result", () => {
  it("keeps the brand suffix only when it fits", () => {
    expect(searchTitle("Comic Grading")).toBe("Comic Grading");
    expect(searchTitle("Amazing Fantasy #15 — CGC 6.5 (1962) for Sale")).toEqual({ absolute: "Amazing Fantasy #15 — CGC 6.5 (1962) for Sale" });
  });
  it("never prints the brand twice", () => {
    expect(searchTitle("About Rare Comics Collectors")).toEqual({ absolute: "About Rare Comics Collectors" });
  });
});

describe("descriptions that fit a search result", () => {
  it("leaves short text alone", () => {
    expect(clampDescription("Short and complete.")).toBe("Short and complete.");
  });
  it("ends on a whole sentence when one fits", () => {
    const text = `${"Graded comics for sale with an authenticity guarantee and insured shipping from Austin. ".repeat(1)}Grading submission, pressing, restoration detection and appraisal for every collector who walks in.`;
    const out = clampDescription(text);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(out.endsWith(".")).toBe(true);
  });
  it("otherwise ends on a whole word with an ellipsis", () => {
    const out = clampDescription("word ".repeat(80));
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
  it("is applied by pageMetadata", () => {
    const m = pageMetadata({ title: "X", description: "a ".repeat(200), path: "/x" });
    expect((m.description ?? "").length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});

describe("product photo alt text", () => {
  it("describes a slab with its grade and label", () => {
    expect(coverAlt({ title: "Amazing Fantasy", issue: "#15", publisher: "Marvel Comics", year: 1962, grader: "CGC", grade: "6.5", label: "Universal Blue" })).toBe("Amazing Fantasy #15 (Marvel Comics, 1962), CGC 6.5 graded comic book, Universal Blue label — front cover in its holder");
  });
  it("describes a raw book without inventing a grade, publisher or year", () => {
    expect(coverAlt({ title: "Air Stories", issue: "nn", publisher: "Unknown", year: 0, grader: "Raw", grade: "Not graded", label: "Raw" })).toBe("Air Stories, raw, ungraded comic book — front cover");
    expect(coverAlt({ title: "Superman", issue: "#75", publisher: "DC Comics", year: 1992, grader: "Raw", grade: "VF", label: "Raw" }, { index: 2, total: 3 })).toBe("Superman #75 (DC Comics, 1992), raw comic book in VF condition — photo 2 of 3");
  });
});

describe("numbered hub pages", () => {
  it("accepts only pages that exist, with page 1 at the bare address", () => {
    expect(readPage(undefined, 5)).toBe(1);
    expect(readPage("3", 5)).toBe(3);
    expect(readPage("1", 5)).toBeNull();
    expect(readPage("6", 5)).toBeNull();
    expect(readPage("2abc", 5)).toBeNull();
    expect(pageHref("/collections/golden-age", 1)).toBe("/collections/golden-age");
    expect(pageHref("/collections/golden-age", 2)).toBe("/collections/golden-age?page=2");
  });
});
