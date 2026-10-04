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
