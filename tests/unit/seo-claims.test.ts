import { describe, expect, it } from "vitest";
import { defaultSeoDescription, type SeoFacts } from "@/lib/imports/seo-rules";

const facts = (over: Partial<SeoFacts>): SeoFacts => ({ title: "Amazing Fantasy", issue: "#15", publisher: "Marvel", year: 1962, grader: "CGC", grade: "4.0", label: "Universal Blue", keyIssue: null, slug: "af-15", ...over });

describe("SEO descriptions only claim what is true", () => {
  it("a slab is cert-verified", () => {
    expect(defaultSeoDescription(facts({}), 14)).toContain("Cert-verified, insured shipping and a 14-day return window.");
  });
  it("a raw or ungraded book is not", () => {
    for (const grader of ["Raw", "Unknown", ""]) {
      const d = defaultSeoDescription(facts({ grader, grade: "Not graded", label: "" }), 14);
      expect(d).not.toMatch(/cert/i);
      expect(d).toContain("Insured shipping and a 14-day return window.");
    }
  });
});
