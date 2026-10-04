/**
 * Raw (not professionally graded) books. Pure.
 *
 * A raw listing has no grading company and often no stated condition. Nothing is assumed: the
 * condition is whatever the listing itself states, and when it states none the product says
 * "Not graded" and points the buyer to the photo.
 */
export const RAW_GRADER = "Raw";
export const RAW_UNSTATED = "Not graded";

const WORDS: [RegExp, string][] = [
  [/\bnear\s+mint\s*[/-]\s*mint\b/i, "NM/M"],
  [/\bvery\s+fine\s*[/-]\s*near\s+mint\b/i, "VF/NM"],
  [/\bnear\s+mint\b/i, "NM"],
  [/\bvery\s+fine\b/i, "VF"],
  [/\bvery\s+good\b/i, "VG"],
];
// Two-letter condition codes only: single letters (F, G) and words like "fine" or "good" appear in titles for other reasons.
const CODE = /(?<![A-Za-z0-9])(NM\/M|NM\/MT|VF\/NM|FN\/VF|VG\/FN|GD\/VG|FR\/GD|NM|VF|FN|VG|GD|FR|PR)([+-])?(?![A-Za-z0-9+-])/;
const NUMBER = /(?<![\d.#$])(10\.0|\d\.\d)(?!\d)/;

/** The condition a raw listing states about itself ("VF+", "NM 9.4", "8.5"), or null when it states none. */
export function rawCondition(title: string): string | null {
  const t = title.replace(/\s+/g, " ");
  const code = CODE.exec(t);
  const number = NUMBER.exec(t.replace(/#\s*\d+(?:\.\d+)?/g, " "));
  let letters: string | null = code ? `${code[1].replace("NM/MT", "NM/M")}${code[2] ?? ""}` : null;
  if (!letters) for (const [re, name] of WORDS) if (re.test(t)) { letters = name; break; }
  if (letters && number) return `${letters} ${number[1]}`;
  return letters ?? (number ? number[1] : null);
}

/** Wording in a title that points to a slabbed book even though no grading company is named. */
export const LOOKS_SLABBED = /\b(?:white pages?|off[- ]?white|ow\/?w|slab(?:bed)?|encapsulated|graded|cert(?:ified|ification)?\s*#?\d*)\b/i;

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const KEY_CLAIM = /\b(?:1st|first|origin|death of|debut|intro(?:duction)?|last issue|classic cover|premiere)\b/i;

export type RawParsed = { series: string; issue: string; publisher: string; year: number; era: string; volume?: string | null; notes?: string | null };

/** A raw listing in the site's product format, in the same shape the slab builder returns. */
export function buildRawListing(input: { sourceId: string; p: RawParsed; condition: string | null }, takenSlugs: Set<string>) {
  const { p } = input;
  const stated = input.condition;
  const grade = stated ?? RAW_UNSTATED;
  const issueSlug = p.issue === "nn" ? "nn" : slugify(p.issue.replace("#-", "minus-").replace("1/2", "half"));
  let slug = `${slugify(p.series)}-${issueSlug}-raw${stated ? `-${slugify(stated.replace(/\+/g, " plus").replace(/(?<=[A-Za-z])-(?![A-Za-z])/g, " minus"))}` : ""}`.slice(0, 90).replace(/-$/, "");
  if (takenSlugs.has(slug)) slug = `${slug}-${input.sourceId}`;
  takenSlugs.add(slug);
  const book = `${p.series} ${p.issue}`;
  // A note that only repeats the series name adds nothing.
  const notes = p.notes && p.notes.trim().toLowerCase() !== p.series.trim().toLowerCase() ? p.notes.trim() : null;
  const conditionLine = stated ? `Raw copy, condition as stated in the listing: ${stated}` : "Raw copy; the listing states no grade, so judge the condition from the photo";
  const summary = `${book} (${p.publisher}, ${p.year})${notes ? ` — ${notes}` : ""}. ${sentence(conditionLine)}`;
  const description = [
    `${book}, published by ${p.publisher} in ${p.year} (${p.era})${p.volume ? `, volume ${p.volume}` : ""}.${notes ? ` Listing notes: ${sentence(notes)}` : ""}`,
    `This is a raw book: it has not been graded or sealed by a grading company. ${stated ? `The condition stated in the listing is ${stated}; that is the seller's own assessment, not a certified grade.` : "The listing does not state a grade. The photo shows the actual copy."}`,
  ].join("\n\n");
  const highlights = [notes, stated ? `Raw — ${stated} (as stated in the listing)` : "Raw — not graded", `${p.publisher}, ${p.year} — ${p.era}`].filter((x): x is string => Boolean(x));
  return {
    slug,
    title: p.series,
    issue: p.issue,
    publisher: p.publisher,
    year: p.year,
    era: p.era,
    grader: RAW_GRADER,
    grade,
    label: RAW_GRADER,
    certNumber: null as string | null,
    keyIssue: notes && KEY_CLAIM.test(notes) ? notes : null,
    summary,
    description,
    highlights,
    attributes: (p.volume ? { Volume: p.volume } : {}) as Record<string, string>,
    tags: [p.series, p.era, RAW_GRADER, p.publisher.replace(/ (Comics|Publishing|Publications|Entertainment)$/, "")],
  };
}
