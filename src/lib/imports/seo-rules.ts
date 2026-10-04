/**
 * SEO defaults and checks for an imported product. Pure. Everything is built from the product's
 * own facts — no keyword is added that the listing does not actually match.
 */
export type SeoFacts = { title: string; issue: string; publisher: string; year: number | null; grader: string; grade: string; label: string; keyIssue: string | null; slug: string };

const gradeLabel = (f: SeoFacts) => (f.grader === "Raw" ? `Raw ${f.grade}` : `${f.grader} ${f.grade}`).trim();
const issueNumber = (issue: string) => issue.replace(/^#/, "").trim();

/** The same shape the product page builds on its own, so a default changes nothing that is already indexed. */
export function defaultSeoTitle(f: SeoFacts): string {
  return `${f.title} ${f.issue} — ${gradeLabel(f)}${f.year ? ` (${f.year})` : ""} for Sale`.replace(/\s+/g, " ").trim();
}

export function defaultSeoDescription(f: SeoFacts, returnWindowDays: number): string {
  const key = f.keyIssue ? ` — ${f.keyIssue.replace(/\.$/, "")}` : "";
  const start = `${f.title} ${f.issue}, ${f.publisher}${f.year ? ` ${f.year}` : ""}. ${gradeLabel(f)}${key}.`;
  const end = ` Cert-verified, insured shipping and a ${returnWindowDays}-day return window.`;
  const text = start + end;
  // Keep the facts; drop the key-issue note first when the whole thing runs long.
  return text.length <= 165 ? text : `${f.title} ${f.issue}, ${f.publisher}${f.year ? ` ${f.year}` : ""}. ${gradeLabel(f)}.${end}`;
}

export const h1Of = (f: Pick<SeoFacts, "title" | "issue">) => `${f.title} ${f.issue}`.trim();

/** Phrases a buyer of this exact book could search, most specific last. All lower case. */
export function candidateKeywords(f: SeoFacts): string[] {
  const base = `${f.title} ${issueNumber(f.issue)}`.toLowerCase().replace(/\s+/g, " ").trim();
  if (!f.title.trim() || !issueNumber(f.issue)) return [];
  const grader = f.grader.toLowerCase();
  const list = [base, `${base} ${grader}`, `${base} ${grader} ${f.grade}`, `${base} for sale`, `${base} value`, f.year ? `${base} ${f.year}` : ""];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

const count = (haystack: string, needle: string) => (needle ? haystack.toLowerCase().split(needle.toLowerCase()).length - 1 : 0);

/** Notes for the reviewer. An empty list means the SEO fields are in good shape. */
export function seoChecks(seo: { seoTitle: string; seoDescription: string; slug: string; primaryKeyword: string }, f: SeoFacts): string[] {
  const notes: string[] = [];
  const title = seo.seoTitle.trim();
  const description = seo.seoDescription.trim();
  const issue = issueNumber(f.issue);
  if (!title) notes.push("No SEO title.");
  else {
    if (title.length > 70) notes.push(`SEO title is ${title.length} characters; search results show about 60.`);
    if (title.length < 20) notes.push("SEO title is very short.");
    if (issue && !new RegExp(`(^|[^0-9])${issue.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^0-9]|$)`).test(title)) notes.push("SEO title does not state the issue number.");
    if (f.grade && !title.includes(f.grade)) notes.push("SEO title does not state the grade.");
    if (f.title && !title.toLowerCase().includes(f.title.toLowerCase())) notes.push("SEO title does not name the comic.");
    if (count(title, f.title) > 1) notes.push("SEO title repeats the comic's name (keyword stuffing).");
  }
  if (!description) notes.push("No meta description.");
  else {
    if (description.length > 165) notes.push(`Meta description is ${description.length} characters; search results show about 160.`);
    if (description.length < 70) notes.push("Meta description is short (under 70 characters).");
    if (count(description, f.title) > 2) notes.push("Meta description repeats the comic's name (keyword stuffing).");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seo.slug)) notes.push("URL slug must be lower-case words separated by hyphens.");
  else if (seo.slug.length > 90) notes.push("URL slug is longer than 90 characters.");
  if (!seo.primaryKeyword.trim()) notes.push("No primary keyword.");
  return notes;
}
