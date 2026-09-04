import { describe, expect, it } from "vitest";
import { allocateDiscount } from "@/lib/commerce/coupons";
import { slugify, zBool, zDateOptional } from "@/lib/validation";

describe("allocateDiscount", () => {
  it("splits proportionally and absorbs rounding in the last line", () => {
    const parts = allocateDiscount([{ subtotal: 1000 }, { subtotal: 1000 }, { subtotal: 1000 }], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([33, 33, 34]);
  });

  it("returns zeros for no discount or empty baskets", () => {
    expect(allocateDiscount([{ subtotal: 500 }], 0)).toEqual([0]);
    expect(allocateDiscount([], 100)).toEqual([]);
  });
});

describe("validation helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("The Incredible Hulk #181 — CGC 9.8!")).toBe("the-incredible-hulk-181-cgc-9-8");
  });

  it("coerces checkbox values", () => {
    expect(zBool.parse("on")).toBe(true);
    expect(zBool.parse(undefined)).toBe(false);
    expect(zBool.parse("false")).toBe(false);
  });

  it("treats blank dates as undefined and parses ISO dates", () => {
    expect(zDateOptional.parse("")).toBeUndefined();
    expect(zDateOptional.parse(undefined)).toBeUndefined();
    const d = zDateOptional.parse("2026-09-04");
    expect(d instanceof Date && !Number.isNaN(d.getTime())).toBe(true);
  });
});
