import { describe, expect, it } from "vitest";
import { applyBps, bpsToPercent, convertFromBase, convertToBase, formatMoney, parseMoneyInput } from "@/lib/money";

describe("money", () => {
  it("applies basis points with rounding", () => {
    expect(applyBps(10_000, 1000)).toBe(1000);
    expect(applyBps(999, 1000)).toBe(100);
    expect(applyBps(0, 1000)).toBe(0);
  });

  it("formats basis points as a percentage", () => {
    expect(bpsToPercent(1000)).toMatch(/10/);
    expect(bpsToPercent(825)).toMatch(/8\.25/);
  });

  it("converts to a presentment currency and back within rounding", () => {
    const eur = { code: "EUR", symbol: "€", decimals: 2, rateToBase: 0.9 };
    const presented = convertFromBase(10_000, eur);
    expect(presented).toBe(9000);
    expect(Math.abs(convertToBase(presented, eur) - 10_000)).toBeLessThanOrEqual(1);
  });

  it("handles zero-decimal currencies", () => {
    const jpy = { code: "JPY", symbol: "¥", decimals: 0, rateToBase: 150 };
    expect(convertFromBase(10_000, jpy)).toBe(15_000);
    expect(formatMoney(15_000, "JPY")).not.toContain(".");
  });

  it("formats base currency amounts", () => {
    expect(formatMoney(123_456)).toBe("$1,234.56");
    expect(formatMoney(-500)).toContain("5.00");
  });

  it("parses user money input", () => {
    expect(parseMoneyInput("1,234.5")).toBe(123_450);
    expect(parseMoneyInput("$12")).toBe(1200);
    expect(parseMoneyInput("abc")).toBeNull();
  });
});
