/** Statuses and identity rules of the import review queue. Pure (client and server). */

export const IMPORT_SOURCE = "hipcomic";

export const ITEM_STATUSES = ["pending_review", "approved", "ready", "released", "rejected", "duplicate", "error"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

const LABELS: Record<ItemStatus, string> = {
  pending_review: "Pending Review",
  approved: "Approved",
  ready: "Ready to Release",
  released: "Released",
  rejected: "Rejected",
  duplicate: "Duplicate",
  error: "Error",
};
const TONES: Record<ItemStatus, "warning" | "brand" | "gold" | "success" | "neutral" | "danger"> = {
  pending_review: "warning",
  approved: "brand",
  ready: "gold",
  released: "success",
  rejected: "neutral",
  duplicate: "neutral",
  error: "danger",
};
const known = (s: string): s is ItemStatus => (ITEM_STATUSES as readonly string[]).includes(s);
export const itemStatusLabel = (s: string) => (known(s) ? LABELS[s] : s);
export const itemStatusTone = (s: string) => (known(s) ? TONES[s] : ("neutral" as const));

export const DUPLICATE_LABEL: Record<string, string> = { unique: "Unique", possible: "Possible duplicate", duplicate: "Duplicate" };
export const SEO_LABEL: Record<string, string> = { pending: "Not analysed yet", ok: "Optimised", review: "Needs review" };

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9./]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

/**
 * Publisher + title + issue + grade + grader + label/variant, normalised. Two listings with the
 * same key are the same book in the same grade and holder type — possibly two physical copies, so
 * the key flags a possible duplicate and a certification number decides a definite one.
 */
export function dedupeKey(p: { publisher: string; title: string; issue: string; grade: string; grader: string; label?: string | null; variant?: string | null }): string {
  const publisher = squash(p.publisher).replace(/\b(comics|publishing|publications|entertainment|magazines)\b/g, "").replace(/\s+/g, " ").trim();
  const title = squash(p.title).replace(/^the /, "");
  const issue = squash(p.issue.replace(/^#/, ""));
  if (!title || !issue || !p.grade.trim() || !p.grader.trim()) return "";
  return [publisher, title, issue, squash(p.grade), squash(p.grader), squash(p.label ?? ""), squash(p.variant ?? "")].join("|");
}

/** What must be true of an item before it may be released; mirrors what makes a listing a valid page. */
export function releaseProblems(p: { title: string; issue: string; publisher: string; year: number | null; era: string; grader: string; grade: string; retailPrice: number | null; summary: string; description: string; slug: string; hasImage: boolean; available: boolean }): string[] {
  const problems: string[] = [];
  if (!p.title.trim()) problems.push("no comic title");
  if (!p.issue.trim()) problems.push("no issue number");
  if (!p.publisher.trim()) problems.push("no publisher");
  if (p.year === null || !Number.isInteger(p.year) || p.year < 1900 || p.year > new Date().getFullYear() + 1) problems.push("no publication year");
  if (!p.era.trim()) problems.push("no era");
  if (!p.grader.trim()) problems.push("no grading company");
  if (!p.grade.trim()) problems.push("no grade");
  if (p.retailPrice === null || !Number.isInteger(p.retailPrice) || p.retailPrice <= 0) problems.push("no price");
  if (!p.summary.trim() || !p.description.trim()) problems.push("no description");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) problems.push("no valid URL slug");
  if (!p.hasImage) problems.push("no photo stored yet");
  if (!p.available) problems.push("marked unavailable at the source");
  return problems;
}
