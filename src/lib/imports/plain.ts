import { NOT_GRADED, UNKNOWN, gradeLabel, isKnown } from "@/lib/catalog/labels";

/**
 * A listing built only from what is known. Used when a detail that no sales channel requires
 * (publisher, year, grade, label, issue number) is missing: the detail is stored as "Unknown" and
 * the copy says what the listing does not state instead of filling the gap. Pure.
 */
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const KEY_CLAIM = /\b(?:1st|first|origin|death of|debut|intro(?:duction)?|last issue|classic cover|premiere)\b/i;

export type PlainFacts = {
  series: string;
  /** "#12", or "nn" when the listing has no issue number */
  issue: string;
  publisher: string | null;
  year: number | null;
  era: string | null;
  /** "CGC" | "CBCS" | "PGX" | "Raw" | null */
  grader: string | null;
  grade: string | null;
  label: string | null;
  certNumber?: string | null;
  pageQuality?: string | null;
  volume?: string | null;
  notes?: string | null;
  /** the listing describes several books sold together */
  lot?: boolean;
};

export function buildPlainListing(input: { sourceId: string; p: PlainFacts }, takenSlugs: Set<string>) {
  const { p } = input;
  const raw = p.grader === "Raw";
  const publisher = p.publisher?.trim() || UNKNOWN;
  const grader = p.grader?.trim() || UNKNOWN;
  const grade = p.grade?.trim() || (raw ? NOT_GRADED : UNKNOWN);
  const label = raw ? "Raw" : p.label?.trim() || UNKNOWN;
  const era = p.era?.trim() || UNKNOWN;
  const numbered = p.issue !== "nn" && p.issue.trim() !== "";
  const issue = numbered ? p.issue : "nn";
  const book = numbered ? `${p.series} ${issue}` : p.series;

  const issueSlug = numbered ? slugify(issue.replace("#-", "minus-").replace("1/2", "half")) : "nn";
  const gradeSlug = raw ? (isKnown(grade) && grade !== NOT_GRADED ? `raw-${slugify(grade.replace(/\+/g, " plus"))}` : "raw") : [isKnown(grader) ? grader.toLowerCase() : "", isKnown(grade) ? grade.replace(".", "-") : ""].filter(Boolean).join("-");
  let slug = [slugify(p.series).slice(0, 70), issueSlug, gradeSlug].filter(Boolean).join("-").slice(0, 95).replace(/-$/, "");
  if (!slug || takenSlugs.has(slug)) slug = `${slug || "comic"}-${input.sourceId}`;
  takenSlugs.add(slug);

  const notes = p.notes && p.notes.trim().toLowerCase() !== p.series.trim().toLowerCase() ? p.notes.trim() : null;
  const origin = [isKnown(publisher) ? publisher : "", p.year ? String(p.year) : ""].filter(Boolean).join(", ");
  const gradeLine = gradeLabel(grader, grade);
  const unstated = [!isKnown(publisher) ? "the publisher" : "", !p.year ? "the publication year" : "", !numbered && !p.lot ? "an issue number" : ""].filter(Boolean);
  const unstatedLine = unstated.length ? ` The listing does not state ${unstated.length === 1 ? unstated[0] : `${unstated.slice(0, -1).join(", ")} or ${unstated[unstated.length - 1]}`}.` : "";

  const summary = `${book}${origin ? ` (${origin})` : ""}${notes ? ` — ${notes}` : ""}. ${sentence(gradeLine)}`;
  const first = `${book}${isKnown(publisher) ? `, published by ${publisher}` : ""}${p.year ? ` in ${p.year}` : ""}${isKnown(era) ? ` (${era})` : ""}${p.volume ? `, volume ${p.volume}` : ""}.${p.lot ? " The listing describes more than one book sold together; see the photo for what is included." : ""}${notes ? ` Listing notes: ${sentence(notes)}` : ""}${unstatedLine}`;
  const second = raw
    ? `This is a raw book: it has not been graded or sealed by a grading company. ${isKnown(grade) && grade !== NOT_GRADED ? `The condition stated in the listing is ${grade}; that is the seller's own assessment, not a certified grade.` : "The listing does not state a grade. The photo shows the actual copy."}`
    : isKnown(grader)
      ? `${isKnown(grade) ? `Graded ${grader} ${grade}${p.pageQuality ? `, ${p.pageQuality.toLowerCase()}` : ""}.` : `In a ${grader} holder; the grade is not stated in the listing and can be read from the label in the photo.`}${isKnown(label) && label !== "Universal Blue" ? ` ${label.replace(/ \(.*\)$/, "")} label.` : ""}${p.certNumber ? ` Certification number ${p.certNumber}, which can be checked on the ${grader} website.` : ""}`
      : `The listing does not name a grading company${isKnown(grade) ? `; the grade it states is ${grade}` : ""}. The photo shows the actual copy.`;

  const highlights = [notes, gradeLine, origin ? `${origin}${isKnown(era) ? ` — ${era}` : ""}` : null, p.certNumber && isKnown(grader) ? `${grader} certification ${p.certNumber}` : null].filter((x): x is string => Boolean(x));
  const attributes: Record<string, string> = {};
  if (p.pageQuality) attributes["Page quality"] = p.pageQuality;
  if (p.volume) attributes.Volume = p.volume;
  return {
    slug,
    title: p.series,
    issue,
    publisher,
    year: p.year,
    era,
    grader,
    grade,
    label,
    certNumber: p.certNumber ?? null,
    keyIssue: notes && KEY_CLAIM.test(notes) ? notes : null,
    summary,
    description: [first, second].join("\n\n"),
    highlights,
    attributes,
    tags: [p.series, isKnown(era) ? era : "", isKnown(grader) ? grader : "", isKnown(publisher) ? publisher.replace(/ (Comics|Publishing|Publications|Entertainment)$/, "") : ""].filter(Boolean),
  };
}
