import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, MAX_SHOWN, PAGE_SIZE, activeFilterCount, gradeValue, parseStoreFilters, storeQueryString } from "@/lib/catalog/store-filters";

describe("store filters in the address", () => {
  it("reads nothing as the defaults and writes the defaults as nothing", () => {
    expect(parseStoreFilters({})).toEqual(DEFAULT_FILTERS);
    expect(storeQueryString(DEFAULT_FILTERS)).toBe("");
  });

  it("round-trips every filter", () => {
    const f = { q: "spider-man 300", era: "Silver Age", publisher: "Marvel Comics", grader: "CGC", band: 2, keysOnly: true, sort: "price-desc" as const, show: 72 };
    const qs = storeQueryString(f);
    expect(qs).toBe("?q=spider-man+300&era=Silver+Age&publisher=Marvel+Comics&grader=CGC&price=2&keys=1&sort=price-desc&show=72");
    expect(parseStoreFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
  });

  it("ignores values it does not know and repeated parameters", () => {
    const f = parseStoreFilters({ sort: "drop table", price: "9", keys: "yes", q: ["a", "b"], show: "abc" });
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it("keeps the page size in whole steps and under the limit", () => {
    expect(parseStoreFilters({ show: "25" }).show).toBe(PAGE_SIZE * 2);
    expect(parseStoreFilters({ show: "1" }).show).toBe(PAGE_SIZE);
    expect(parseStoreFilters({ show: "-48" }).show).toBe(PAGE_SIZE);
    expect(parseStoreFilters({ show: "999999" }).show).toBe(MAX_SHOWN);
  });

  it("limits the length of free text", () => {
    expect(parseStoreFilters({ q: "x".repeat(500) }).q).toHaveLength(120);
  });

  it("counts the filters that narrow the list, not sorting or paging", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, sort: "year-asc", show: 96 })).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: "  ", era: "Golden Age", band: 0 })).toBe(2);
  });

  it("reads the number out of a grade", () => {
    expect(gradeValue("9.8")).toBe(9.8);
    expect(gradeValue("VF 8.0")).toBe(8);
    expect(gradeValue("Not graded")).toBe(0);
  });
});
