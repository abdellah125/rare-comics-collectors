/**
 * Turns one classified HipComic row into a listing in the site's product format. Pure and shared
 * by the command-line importer (scripts/import-hipcomic-csv.mjs) and the in-app import pipeline
 * (src/lib/imports), so both build exactly the same titles, slugs and descriptions.
 * Nothing here is guessed: every value comes from the parsed title or the row itself.
 */
import { CGC_GRADES } from "./hipcomic-title.mjs";

export const ADULT = /\b(?:naughty|nude|nudity|topless|risqu[eé]|nsfw|uncensored|explicit|adults? only|xxx)\b/i;
export const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const PALETTES = { "Golden Age": ["#7c2d12", "#fbbf24"], "Silver Age": ["#1e3a8a", "#e11d48"], "Bronze Age": ["#14532d", "#f59e0b"], "Copper Age": ["#7c3aed", "#f97316"], "Modern Age": ["#0f172a", "#38bdf8"] };

/**
 * The US$ price of a row. CA$ rows use the US$ figure HipComic prints beside the price, or the
 * median rate of the same scrape; any other currency has no usable price.
 * @returns {{ price: number|null, priceNote: string|null, reason: string|null }}
 */
export function usdPrice(row, cadRate) {
  if (row.currency === "USD") return { price: row.price, priceNote: null, reason: null };
  if (row.currency === "CAD" && row.approxUsd) return { price: row.approxUsd, priceNote: `CA$${(row.price / 100).toFixed(2)} at the source; US$ figure as shown by the source`, reason: null };
  if (row.currency === "CAD" && cadRate) return { price: Math.round(row.price * cadRate), priceNote: `CA$${(row.price / 100).toFixed(2)} at the source; converted at the scrape's own rate (${cadRate.toFixed(4)})`, reason: null };
  return { price: null, priceNote: null, reason: `price is in ${row.currency} with no US$ figure` };
}

/** Median CA$→US$ rate of the rows that carry both figures, or null when there are too few. */
export function cadRateOf(rows) {
  const rates = rows.filter((r) => r.currency === "CAD" && r.approxUsd && r.price).map((r) => r.approxUsd / r.price).sort((a, b) => a - b);
  return rates.length >= 20 ? rates[Math.floor(rates.length / 2)] : null;
}

// The storefront shows a "Key issue" badge for `keyIssue`, so seller notes only land there when they
// make that kind of claim (first appearance, origin, death…); other notes stay in the description.
const KEY_CLAIM = /\b(?:1st|first|origin|death of|debut|intro(?:duction)?|last issue|classic cover|premiere)\b/i;
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
export function buildListing({ row, p, price, priceNote }, takenSlugs) {
  const gradeSlug = p.grade.replace(".", "-");
  const issueSlug = p.issue === "nn" ? "nn" : slugify(p.issue.replace("#-", "minus-").replace("1/2", "half"));
  let slug = `${slugify(p.series)}-${issueSlug}-${p.grader.toLowerCase()}-${gradeSlug}`.slice(0, 90).replace(/-$/, "");
  if (p.label === "Signature Series (Yellow)") slug = `${slug}-ss`;
  if (takenSlugs.has(slug)) slug = `${slug}-${row.sourceId}`;
  takenSlugs.add(slug);

  const gradeName = CGC_GRADES[p.grade];
  const issueText = p.issue === "nn" ? "nn" : p.issue;
  const book = `${p.series} ${issueText}`;
  const gradeLine = `${p.grader} ${p.grade} ${gradeName}${p.pageQuality ? `, ${p.pageQuality.toLowerCase()}` : ""}`;
  const labelLine = p.label === "Universal Blue" ? "" : ` ${p.label.replace(/ \(.*\)$/, "")} label.`;
  const summary = `${book} (${p.publisher}, ${p.year})${p.notes ? ` — ${p.notes}` : ""}. ${gradeLine}.`;
  const description = [
    `${book}, published by ${p.publisher} in ${p.year} (${p.era})${p.volume ? `, volume ${p.volume}` : ""}.${p.notes ? ` Listing notes: ${sentence(p.notes)}` : ""}`,
    `Graded ${gradeLine}.${labelLine}${p.certNumber ? ` Certification number ${p.certNumber}, which can be checked on the ${p.grader} website.` : ""} The book is sealed in its tamper-evident ${p.grader} holder.`,
  ].join("\n\n");
  const highlights = [p.notes, gradeLine, p.label !== "Universal Blue" ? p.label.replace(/ \(.*\)$/, "") : null, p.certNumber ? `${p.grader} certification ${p.certNumber}` : null, `${p.publisher}, ${p.year} — ${p.era}`].filter(Boolean);
  const attributes = {};
  if (p.pageQuality) attributes["Page quality"] = p.pageQuality;
  if (p.volume) attributes.Volume = p.volume;
  return {
    sourceId: Number(row.sourceId), sourceUrl: row.url, sourceSeller: row.seller, sourceTitle: row.title, sourcePrice: row.price, sourceCurrency: row.currency, priceNote,
    file: row.file, slug, title: p.series, issue: issueText, publisher: p.publisher, year: p.year, era: p.era, grader: p.grader, grade: p.grade, label: p.label,
    certNumber: p.certNumber, price, compareAt: null, stock: 1, keyIssue: p.notes && KEY_CLAIM.test(p.notes) ? p.notes : null, creators: { writer: "Various", artist: "Various", cover: "Various" },
    summary, description, highlights, palette: PALETTES[p.era], featured: false, attributes, tags: [p.series, p.era, p.grader, p.publisher.replace(/ (Comics|Publishing|Publications|Entertainment)$/, "")],
    allowedCountries: [], sourceImage: row.image, image: `/covers/q/${slug}.webp`,
  };
}
