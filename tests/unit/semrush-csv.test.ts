import { describe, expect, it } from "vitest";
import { budgetBlock, estimateUnits, normalisePhrase, parseSemrushCsv, parseUnitBalance, redactKey, splitPhrases } from "@/lib/seo/semrush-csv";

describe("Semrush CSV parsing", () => {
  it("reads a keyword table", () => {
    const body = "Keyword;Search Volume;CPC;Competition;Number of Results;Keyword Difficulty Index;Intents\r\nAmazing Spider-Man 300 CGC;1300;0.45;0.12;2340000;38;commercial,informational\r\nhulk 181 value;880;0.31;0.08;1200000;;transactional\r\n";
    const parsed = parseSemrushCsv(body);
    expect(parsed.kind).toBe("rows");
    if (parsed.kind !== "rows") return;
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ phrase: "amazing spider-man 300 cgc", volume: 1300, cpc: 0.45, competition: 0.12, results: 2340000, difficulty: 38, intents: "commercial,informational" });
    expect(parsed.rows[1].difficulty).toBeNull();
  });

  it("treats NOTHING FOUND as empty and other errors as errors", () => {
    expect(parseSemrushCsv("ERROR 50 :: NOTHING FOUND")).toEqual({ kind: "empty" });
    expect(parseSemrushCsv("ERROR 120 :: WRONG KEY - ID PAIR")).toEqual({ kind: "error", code: 120, message: "WRONG KEY - ID PAIR" });
    expect(parseSemrushCsv("ERROR 132 :: API UNITS BALANCE IS ZERO")).toMatchObject({ kind: "error", code: 132 });
    expect(parseSemrushCsv("Keyword;Search Volume\n")).toEqual({ kind: "empty" });
  });

  it("reads the balance endpoint", () => {
    expect(parseUnitBalance("123456\n")).toBe(123456);
    expect(parseUnitBalance("ERROR 120 :: WRONG KEY - ID PAIR")).toBeNull();
  });
});

describe("phrase handling", () => {
  it("normalises and dedupes pasted input", () => {
    expect(splitPhrases("  Amazing Spider-Man #300 , amazing spider-man #300\nHulk 181 VALUE\n\n,“X-Men” 1\n")).toEqual(["amazing spider-man #300", "hulk 181 value", "x-men 1"]);
    expect(normalisePhrase("  Batman’s   Comics ")).toBe("batman's comics");
    expect(splitPhrases("a\nb\nc", 2)).toEqual(["a", "b"]);
  });
});

describe("cost guards", () => {
  it("prices reports per line", () => {
    expect(estimateUnits("phrase_all", 25)).toBe(250);
    expect(estimateUnits("phrase_related", 20)).toBe(800);
    expect(estimateUnits("phrase_questions", 0)).toBe(0);
  });

  it("blocks over the daily budget or into the reserve, and allows otherwise", () => {
    expect(budgetBlock(250, { dailyLimit: 2000, usedToday: 1900, balance: 50000, reserve: 500 })).toMatch(/Daily budget/);
    expect(budgetBlock(250, { dailyLimit: 2000, usedToday: 100, balance: 600, reserve: 500 })).toMatch(/Balance guard/);
    expect(budgetBlock(250, { dailyLimit: 2000, usedToday: 100, balance: null, reserve: 500 })).toBeNull();
    expect(budgetBlock(250, { dailyLimit: 0, usedToday: 100000, balance: 10000, reserve: 500 })).toBeNull();
  });

  it("never lets the key into a message", () => {
    expect(redactKey("GET https://api.semrush.com/?type=phrase_all&key=abc123def&database=us failed")).toBe("GET https://api.semrush.com/?type=phrase_all&key=***&database=us failed");
    expect(redactKey("https://www.semrush.com/users/countapiunits.html?key=abc")).toBe("https://www.semrush.com/users/countapiunits.html?key=***");
  });
});
