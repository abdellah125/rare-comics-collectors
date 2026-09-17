import { describe, expect, it } from "vitest";
import { eraForYear, parseTitle } from "../../scripts/lib/hipcomic-title.mjs";

describe("HipComic title parser", () => {
  it("reads the comicage layout", () => {
    const p = parseTitle("Fantastic Four (1961)  # 1 (CGC 2.5 OWWP) 1st App  Fantastic Four & Mole Man");
    expect(p).toMatchObject({ series: "Fantastic Four", issue: "#1", year: 1961, era: "Silver Age", grader: "CGC", grade: "2.5", publisher: "Marvel Comics", pageQuality: "Off-white to white pages", label: "Universal Blue", holds: [] });
    expect(p.notes).toBe("1st App Fantastic Four & Mole Man");
  });

  it("takes the certification number and publisher from a dealer title", () => {
    const p = parseTitle("Joker Comics #28 CGC 6.5 1947-First  MILLIE THE MODEL in title-Timely 1172960013");
    expect(p).toMatchObject({ series: "Joker Comics", issue: "#28", year: 1947, grade: "6.5", publisher: "Timely Comics", certNumber: "1172960013", holds: [] });
  });

  it("title-cases shouting titles with a bare issue number", () => {
    const p = parseTitle("FANTASTIC FOUR 9 CGC 6.5 SUB MARINER 1962");
    expect(p).toMatchObject({ series: "Fantastic Four", issue: "#9", year: 1962, grade: "6.5", notes: "Sub-Mariner" });
  });

  it("marks Signature Series only when the title says so", () => {
    expect(parseTitle("X-Men (1980) # 134 (CGC 9.6 WP SS) Signed w/Remark Austin (Phoenix)").label).toBe("Signature Series (Yellow)");
    const unlabeled = parseTitle("Marvel Super Heroes Secret Wars (1984) #3 (CGC 9.8 WP) Signed Jim Shooter");
    expect(unlabeled.label).toBeNull();
    expect(unlabeled.holds).toContain("signed or conserved book without a stated label type");
  });

  it("strips stock codes, broken template text and marketing claims", () => {
    expect(parseTitle("Venom # 7 CGC Graded 9.8 Marvel Comic Book 1st Dylan Brock Appearance JH8", { seller: "AtlantaClassicComics" }).notes).toBe("1st Dylan Brock Appearance");
    expect(parseTitle("Fantastic Four #51 CGC 7.0 {product.Pubilcation_Year} {product.Publisher").series).toBe("Fantastic Four");
    expect(parseTitle("Gargoyles (2023) # 4 (CGC 9.8 SS) signed Nakayama • Census = 1 • Variant Cover I").notes).toBe("Signed Nakayama; Variant Cover I");
  });

  it("does not take a person or a character for a publisher", () => {
    expect(parseTitle("Hero For Hire (1972) # 1 (CGC 5.0) Archie Goodwin • George Tuska • Marvel Comics").publisher).toBe("Marvel Comics");
    expect(parseTitle("Alien (2023) # 1 (CGC 9.8 SS) Signed Gabriele Dell'otto * Marvel Comics * War").publisher).toBe("Marvel Comics");
    expect(parseTitle("Whiz Comics #25 CGC 4.0 1941 1st Captain Marvel Jr.").publisher).toBe("Fawcett Publications");
  });

  it("holds what the title does not state instead of guessing", () => {
    expect(parseTitle("Amazing Spider-Man Annual #1 CGC Graded 5.0").holds).toContain("no publication year in the title");
    expect(parseTitle("The Sixth Gun #1-50 CGC 9.4-9.8 Lot of 30 FCBD + 1st Prints 2010 Image Comics").holds).toContain("lot or multi-issue set");
    expect(parseTitle("Hot Rod and Speedway No 4 Highest Rated CGC Certified Copy 1953").holds).toContain("no numeric grade in the title");
    expect(parseTitle("Lady Mechanika (2015) # 1 (CGC 9.8)").holds).toContain("publisher not stated and not determinable from the series");
    expect(parseTitle("Daredevil #12 CGC 5.0 1942").publisher).toBeNull();
  });

  it("fixes obvious grade typos and reads cover dates", () => {
    expect(parseTitle("Lady Mechanika #3 CGC 9. 8 Signature Series Double Signed Retailer Incentive").grade).toBe("9.8");
    expect(parseTitle("GREEN LANTERN #2 (DC 10/60) CGC 9.6 QUARD UNIVERSE INTRO OW-WH PAGES TOP GRADE!")).toMatchObject({ year: 1960, publisher: "DC Comics", grade: "9.6", pageQuality: "Off-white to white pages" });
  });

  it("maps years to the site's eras", () => {
    expect([1937, 1938, 1955, 1956, 1969, 1970, 1984, 1985, 1991, 1992].map(eraForYear)).toEqual([null, "Golden Age", "Golden Age", "Silver Age", "Silver Age", "Bronze Age", "Bronze Age", "Copper Age", "Copper Age", "Modern Age"]);
  });
});
