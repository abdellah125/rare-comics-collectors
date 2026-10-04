import { describe, expect, it } from "vitest";
import { assessAttack, diagnoseDrop, domainKind, rankBand, type AttackInput } from "@/lib/seo/intel/attack";

const base: AttackInput = { phrase: "amazing spider-man 300 cgc", intent: "commercial", inStock: true, difficulty: 8, ourPosition: 31, rivals: [], demand: 60, rankability: 80, intentValue: 82, relevance: 100, thisYear: 2026 };

describe("competitor kinds", () => {
  it("tells marketplaces, forums, price guides and dealers apart", () => {
    expect(domainKind("www.ebay.com")).toBe("marketplace");
    expect(domainKind("reddit.com")).toBe("social");
    expect(domainKind("boards.cgccomics.com")).toBe("social");
    expect(domainKind("www.pricecharting.com")).toBe("price_guide");
    expect(domainKind("qualitycomix.com")).toBe("dealer");
    expect(domainKind("en.wikipedia.org")).toBe("reference");
    expect(domainKind("some-small-comic-shop.com")).toBe("other");
  });
});

describe("attack assessment", () => {
  it("returns nothing when no competitor position is known", () => {
    expect(assessAttack(base)).toBeNull();
  });

  it("targets the best-placed site that sells or prices comics, not the forum above it", () => {
    const r = assessAttack({ ...base, rivals: [{ domain: "reddit.com", position: 2 }, { domain: "qualitycomix.com", position: 8 }, { domain: "youtube.com", position: 4 }] })!;
    expect(r.target.domain).toBe("qualitycomix.com");
    expect(r.reasons.join(" ")).toMatch(/only ranks #8/);
    expect(r.reasons.join(" ")).toMatch(/forum threads, videos or social posts/);
  });

  it("scores a competitor on page two as weaker than one in the top three", () => {
    const weak = assessAttack({ ...base, rivals: [{ domain: "qualitycomix.com", position: 14 }] })!;
    const strong = assessAttack({ ...base, rivals: [{ domain: "qualitycomix.com", position: 1 }] })!;
    expect(weak.weakness).toBeGreaterThan(strong.weakness);
    expect(weak.attack!).toBeGreaterThan(strong.attack!);
  });

  it("counts having the book in stock against a site that only informs", () => {
    const r = assessAttack({ ...base, rivals: [{ domain: "pricecharting.com", position: 1 }] })!;
    expect(r.reasons.join(" ")).toMatch(/does not sell; this store has the book in stock/);
    const notStocked = assessAttack({ ...base, inStock: false, rivals: [{ domain: "pricecharting.com", position: 1 }] })!;
    expect(notStocked.weakness).toBeLessThan(r.weakness);
  });

  it("notices a page that was not written for the keyword, and a home page ranking", () => {
    const off = assessAttack({ ...base, rivals: [{ domain: "shop.example", position: 6, url: "https://shop.example/blog/top-venom-stories", title: "Top Venom stories" }] })!;
    expect(off.reasons.join(" ")).toMatch(/not written for the keyword/);
    const home = assessAttack({ ...base, rivals: [{ domain: "shop.example", position: 6, url: "https://shop.example/", title: "Shop" }] })!;
    expect(home.reasons.join(" ")).toMatch(/home page/);
    const on = assessAttack({ ...base, rivals: [{ domain: "shop.example", position: 6, url: "https://shop.example/amazing-spider-man-300-cgc", title: "Amazing Spider-Man 300 CGC" }] })!;
    expect(on.reasons.join(" ")).not.toMatch(/not written|home page/);
  });

  it("uses what an inspected page showed, and nothing when it was not inspected", () => {
    const rivals = [{ domain: "shop.example", position: 3, url: "https://shop.example/amazing-spider-man-300-cgc", title: "Amazing Spider-Man 300 CGC" }];
    const plain = assessAttack({ ...base, rivals })!;
    const thin = assessAttack({ ...base, rivals, rivalPage: { wordCount: 120, hasOffer: false, latestYear: 2021 } })!;
    expect(plain.reasons.join(" ")).not.toMatch(/thin|dated|markup/);
    expect(thin.reasons.join(" ")).toMatch(/thin \(120 words\)/);
    expect(thin.reasons.join(" ")).toMatch(/dated/);
    expect(thin.reasons.join(" ")).toMatch(/no product or price markup/);
    expect(thin.weakness).toBeGreaterThan(plain.weakness);
  });

  it("gives no attack score without demand or rankability, and scales with relevance", () => {
    expect(assessAttack({ ...base, demand: null, rivals: [{ domain: "qualitycomix.com", position: 9 }] })!.attack).toBeNull();
    const full = assessAttack({ ...base, rivals: [{ domain: "qualitycomix.com", position: 9 }] })!;
    const offTopic = assessAttack({ ...base, relevance: 20, rivals: [{ domain: "qualitycomix.com", position: 9 }] })!;
    expect(offTopic.attack!).toBeLessThan(full.attack! / 3);
    expect(offTopic.level).toBe("low");
  });
});

describe("ranking playbook", () => {
  it("names the action for each band", () => {
    expect(rankBand(2).band).toMatch(/protect/);
    expect(rankBand(7).band).toMatch(/push to top 3/);
    expect(rankBand(15).band).toMatch(/optimise/);
    expect(rankBand(26).band).toMatch(/deepen/);
    expect(rankBand(null).band).toBe("Not ranking");
  });

  it("explains a drop from the evidence, most specific cause first", () => {
    const d = { phrase: "x", prev: 6, position: 19, prevUrl: "/store/a", url: "/store/a", pageGone: false, pagesCompeting: 1, auditIssues: [] as string[], impressionsPrev: 10, impressions: 8 };
    expect(diagnoseDrop({ ...d, pageGone: true }).reason).toMatch(/no longer live/);
    expect(diagnoseDrop({ ...d, url: "/guides/b" }).reason).toMatch(/switched the ranking page/);
    expect(diagnoseDrop({ ...d, pagesCompeting: 3 }).reason).toMatch(/3 pages/);
    expect(diagnoseDrop({ ...d, auditIssues: ["noindex"] }).reason).toMatch(/technical problem/);
    expect(diagnoseDrop({ ...d, position: 7.5 }).reason).toMatch(/normal fluctuation/);
    expect(diagnoseDrop({ ...d, auditIssues: ["thin_content"] }).reason).toMatch(/weak on thin content/);
    expect(diagnoseDrop(d).reason).toMatch(/competing pages moved ahead/);
    expect(diagnoseDrop({ ...d, position: null }).reason).toMatch(/no longer shows/);
  });
});
