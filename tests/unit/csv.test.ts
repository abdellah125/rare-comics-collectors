import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv, toCsv } from "@/lib/admin/csv";

describe("csv", () => {
  it("round-trips quoted fields, commas and newlines", () => {
    const body = toCsv(["a", "b"], [["plain", 'say "hi", ok'], ["multi\nline", 42]]);
    const rows = parseCsv(body);
    expect(rows).toEqual([
      ["a", "b"],
      ["plain", 'say "hi", ok'],
      ["multi\nline", "42"],
    ]);
  });

  it("maps header names to keys", () => {
    const recs = csvRecords("SKU,Title Name\r\nABC-1,Hulk 181\r\n");
    expect(recs).toEqual([{ sku: "ABC-1", title_name: "Hulk 181" }]);
  });

  it("ignores a UTF-8 BOM and blank lines", () => {
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("serialises dates and nulls", () => {
    const out = toCsv(["d", "n"], [[new Date("2026-01-02T03:04:05Z"), null]]);
    expect(out).toBe("d,n\r\n2026-01-02T03:04:05.000Z,\r\n");
  });
});
