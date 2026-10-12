/**
 * How a listing's facts are worded when one of them is not known. Pure.
 *
 * A listing may lack a detail that no sales channel requires (publisher, publication year, era,
 * grade, label). It is then stored as "Unknown" (year: 0) and every place that prints it goes
 * through these helpers, so a page never shows "0", "Unknown Unknown" or a claim nobody made.
 */
export const UNKNOWN = "Unknown";
export const NOT_GRADED = "Not graded";

export const isKnown = (value: string | null | undefined): value is string => Boolean(value && value.trim() && value.trim() !== UNKNOWN);
export const yearKnown = (year: number | null | undefined): year is number => typeof year === "number" && year > 0;
/** "1963", or "" when the year is not known. */
export const yearText = (year: number | null | undefined): string => (yearKnown(year) ? String(year) : "");

/** "CGC 9.8", "Raw · VF+", "Raw, not graded", "CGC (grade not stated)", "Grade 9.6 (grading company not stated)". */
export function gradeLabel(grader: string, grade: string, rawSeparator = " "): string {
  if (grader === "Raw") return isKnown(grade) && grade !== NOT_GRADED ? `Raw${rawSeparator}${grade}` : "Raw, not graded";
  if (!isKnown(grader)) return isKnown(grade) ? `Grade ${grade} (grading company not stated)` : "Grade not stated";
  return isKnown(grade) ? `${grader} ${grade}` : `${grader} (grade not stated)`;
}

/** The known ones of several facts, joined: ["Marvel Comics", ""] → "Marvel Comics". */
export const joinKnown = (parts: (string | null | undefined)[], separator = " · "): string => parts.filter((p): p is string => isKnown(p)).join(separator);

/**
 * Alt text for a product photo: what the book is, where it is from, how it is graded, and which
 * photo this is. Only known facts are named. e.g. "Amazing Fantasy #15 (Marvel Comics, 1962), CGC 6.5
 * graded comic book, Universal Blue label — front cover in its holder".
 */
export function coverAlt(
  p: { title: string; issue: string; publisher: string; year: number | null; grader: string; grade: string; label?: string | null },
  photo?: { index: number; total: number },
): string {
  const book = `${p.title} ${p.issue === "nn" ? "" : p.issue}`.trim();
  const origin = joinKnown([p.publisher, yearText(p.year)], ", ");
  const raw = p.grader === "Raw";
  const grading = raw
    ? isKnown(p.grade) && p.grade !== NOT_GRADED
      ? `raw comic book in ${p.grade} condition`
      : "raw, ungraded comic book"
    : isKnown(p.grader)
      ? `${p.grader}${isKnown(p.grade) ? ` ${p.grade}` : ""} graded comic book${isKnown(p.label) && !/^raw$/i.test(p.label!) ? `, ${p.label!.replace(/\s*\([^)]*\)\s*$/, "")} label` : ""}`
      : "comic book";
  const which = photo && photo.index > 1 ? `photo ${photo.index} of ${photo.total}` : raw ? "front cover" : "front cover in its holder";
  return `${book}${origin ? ` (${origin})` : ""}, ${grading} — ${which}`;
}
