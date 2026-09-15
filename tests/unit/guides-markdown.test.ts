import { describe, expect, it } from "vitest";
import { headingId, outline, parseBlocks, plainText } from "@/lib/guides/markdown";
import { ArticleInput } from "@/lib/guides/schema";

describe("guide markdown", () => {
  it("parses headings, lists, quotes, tables and paragraphs", () => {
    const md = `## What the label means\n\nThe grade is a number.\nIt runs from 0.5 to 10.\n\n- Blue: universal\n- Yellow: signature\n\n1. Bag\n2. Board\n\n> Grade is not condition alone.\n\n| Grade | Meaning |\n|---|---|\n| 9.8 | Near mint/mint |\n\n---\n\n### Deeper\n\nDone.`;
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual(["h2", "p", "ul", "ol", "quote", "table", "hr", "h3", "p"]);
    expect(blocks[1]).toEqual({ kind: "p", text: "The grade is a number. It runs from 0.5 to 10." });
    expect(blocks[5]).toEqual({ kind: "table", header: ["Grade", "Meaning"], rows: [["9.8", "Near mint/mint"]] });
    expect(outline(md)).toEqual([
      { id: "what-the-label-means", text: "What the label means", level: 2 },
      { id: "deeper", text: "Deeper", level: 3 },
    ]);
    expect(headingId("CGC vs. CBCS: what's the difference?")).toBe("cgc-vs-cbcs-what-s-the-difference");
    expect(plainText("Read **this** and [that](/store).")).toBe("Read this and that.");
  });
});

describe("article input", () => {
  const base = { title: "What is a CGC graded comic?", answer: "A CGC graded comic is a book that CGC has authenticated, graded on the 0.5–10 scale and sealed in a tamper-evident holder.", body: "## What the label tells you\n\n".padEnd(140, "x"), topic: "grading" };
  it("accepts arrays or comma-separated strings and normalises them", () => {
    const r = ArticleInput.safeParse({ ...base, tags: "CGC, grading ,CGC", characters: ["Wolverine"], faq: '[{"q":"Can a grade change?","a":"Only on resubmission, when a new grader looks at the book."}]', sources: "CGC grading scale | https://www.cgccomics.com/", eventDate: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual(["CGC", "grading"]);
      expect(r.data.faq).toHaveLength(1);
      expect(r.data.sources).toEqual([{ label: "CGC grading scale", url: "https://www.cgccomics.com/" }]);
      expect(r.data.eventDate).toBeUndefined();
      expect(r.data.status).toBe("draft");
    }
  });
  it("rejects a bad topic, a thin answer and malformed faq json", () => {
    expect(ArticleInput.safeParse({ ...base, topic: "nope" }).success).toBe(false);
    expect(ArticleInput.safeParse({ ...base, answer: "Too short." }).success).toBe(false);
    expect(ArticleInput.safeParse({ ...base, faq: "{not json" }).success).toBe(false);
  });
});
