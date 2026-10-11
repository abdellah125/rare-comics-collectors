/**
 * A book from before 1938 whose year is learnt from another listing of the same issue has no
 * collecting era. It must still import (era Unknown) and its copy must not say "null".
 *
 *   npx tsx --conditions=react-server tests/integration/import-era.ts
 *
 * Uses its own source name, removed again at the end.
 */
import { PrismaClient } from "@prisma/client";
import type { SourceRow } from "@/lib/imports/source";

process.loadEnvFile?.(".env");

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = new PrismaClient();
  const { runImport } = await import("@/lib/imports/pipeline");
  const source = `itest-era-${Date.now().toString(36)}`;
  const base = (id: string, title: string, year: string): SourceRow => ({
    file: "itest.csv",
    line: Number(id.slice(-1)),
    sourceId: id,
    url: `https://example.com/item/${id}`,
    image: `https://example.com/img/${id}.jpg`,
    imageHash: null,
    title,
    currency: "USD",
    price: 36_875,
    approxUsd: null,
    seller: "itest-seller",
    auction: false,
    problems: [],
    extra: { publisher: "Clayton Magazines", year, series: "", issue: "", grade: "", grader: "", cert: "", description: "", variant: "" },
    available: true,
    slabbed: false,
  });
  try {
    const run = await runImport({ source, kind: "csv_upload", fileName: "itest.csv", rows: [base(`${source}-1`, "Pulp: Astounding Stories #3 (Clayton, 1930) Ray Cummings", "1930"), base(`${source}-2`, "Pulp: Astounding Stories #3 Ray Cummings Sci-Fi pulp", "")] });
    check("the import run completes", run.status === "completed", `${run.status}: ${run.message ?? ""}`);
    const items = await db.importItem.findMany({ where: { source }, orderBy: { sourceId: "asc" } });
    check("both listings are in the queue", items.length === 2, `${items.length}`);
    for (const it of items) {
      const text = [it.description, it.summary, it.highlightsJson, it.tagsJson].join(" ");
      check(`${it.sourceId}: era is set and no copy says "null"`, typeof it.era === "string" && it.era !== "" && !/\bnull\b/.test(text), `era=${it.era} year=${it.year} status=${it.status}`);
    }
  } finally {
    await db.importItem.deleteMany({ where: { source } });
    await db.importRun.deleteMany({ where: { source } });
    await db.$disconnect();
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
