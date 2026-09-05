import { z } from "zod";
import { ERAS, GRADERS, GRADES, LABELS } from "@/lib/domain";
import { zMoney, zOptionalTrimmed, zTrimmed } from "@/lib/validation";

/** Shared listing validation for seller and admin forms. */
const CURRENT_YEAR = new Date().getFullYear();

export const ListingSchema = z.object({
  title: zTrimmed(160).min(1, { error: "Required" }),
  issue: zTrimmed(20).min(1, { error: "Required" }).transform((v) => (v.startsWith("#") ? v : `#${v}`)),
  publisher: zTrimmed(80).min(1, { error: "Required" }),
  year: z.coerce.number().int().min(1900).max(CURRENT_YEAR + 1),
  era: z.enum(ERAS),
  grader: z.enum(GRADERS),
  grade: z.enum(GRADES),
  label: z.enum(LABELS).optional(),
  certNumber: zOptionalTrimmed(40),
  price: zMoney,
  compareAt: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), zMoney.optional()),
  stock: z.coerce.number().int().min(0).max(999),
  keyIssue: zOptionalTrimmed(200),
  writer: zOptionalTrimmed(120),
  artist: zOptionalTrimmed(120),
  coverArtist: zOptionalTrimmed(120),
  summary: zTrimmed(400).min(20, { error: "Write at least 20 characters" }),
  description: zTrimmed(8000).min(20, { error: "Write at least 20 characters" }),
  highlights: zOptionalTrimmed(2000),
  categoryId: zOptionalTrimmed(64),
  weightGrams: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.coerce.number().int().min(0).max(50_000).optional()),
  restrictedCountries: zOptionalTrimmed(500),
  allowedCountries: zOptionalTrimmed(500),
  tags: zOptionalTrimmed(300),
  intent: z.enum(["draft", "publish"]).default("draft"),
});

export function listingData(d: z.infer<typeof ListingSchema>) {
  return {
    title: d.title,
    issue: d.issue,
    publisher: d.publisher,
    year: d.year,
    era: d.era,
    grader: d.grader,
    grade: d.grade,
    label: d.label ?? (d.grader === "Raw" ? "Ungraded" : "Universal Blue"),
    certNumber: d.certNumber ?? null,
    price: d.price,
    compareAt: d.compareAt ?? null,
    stock: d.stock,
    keyIssue: d.keyIssue ?? null,
    writer: d.writer ?? "Various",
    artist: d.artist ?? "Various",
    coverArtist: d.coverArtist ?? "Various",
    summary: d.summary,
    description: d.description,
    highlightsJson: JSON.stringify((d.highlights ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 8)),
    categoryId: d.categoryId || null,
    weightGrams: d.weightGrams ?? null,
    restrictedCountriesJson: JSON.stringify((d.restrictedCountries ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))),
    allowedCountriesJson: JSON.stringify((d.allowedCountries ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s))),
    tagsJson: JSON.stringify((d.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12)),
  };
}

