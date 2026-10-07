/**
 * The quality gate every written article passes before anyone sees it. Pure and mechanical:
 * it measures what can be measured (length, structure, repetition, keyword use, links, risky
 * kinds of claim, similarity to what the site already has). Whether the facts are right is the
 * fact-checker's job (src/lib/content/prompt.ts); this gate decides what is even worth checking.
 */
import { FORMATS, type ContentFormat } from "@/lib/content/categories";
import { mostSimilar, phraseSimilarity, repeatedSentenceShare } from "@/lib/content/dedupe";
import { normPhrase } from "@/lib/seo/intel/entities";

export type Draft = {
  title: string;
  slug: string;
  seoTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  answer: string;
  body: string;
  faq: { q: string; a: string }[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  semanticKeywords: string[];
  tags: string[];
  characters: string[];
  titles: string[];
  publishers: string[];
  imageAlt: string;
  sources: { label: string; url?: string }[];
  /** news only */
  claimLevel?: string;
  eventDate?: string;
};

export type Check = { id: string; label: string; ok: boolean; severity: "block" | "review" | "note"; detail: string };
export type QualityReport = { score: number; words: number; internalLinks: number; checks: Check[]; blocked: boolean; needsReview: boolean; body: string };

export type QualityContext = {
  format: ContentFormat;
  /** internal paths the article may link to */
  allowedLinks: ReadonlySet<string>;
  /** external addresses it may cite (the sources it was given or found) */
  allowedSources: ReadonlySet<string>;
  /** text of the verified facts the writer was given: figures that appear here are not "invented" */
  factsText: string;
  existingTitles: string[];
  /** what the article is about ("X-Men 1"), and headlines of other machine-written articles, to spot a reused headline pattern */
  subject?: string;
  recentTitles?: string[];
  /** bodies of related published articles, to measure repetition against */
  corpus: { slug: string; body: string }[];
};

const strip = (md: string) => md.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();
export const countWords = (md: string) => (strip(md) ? strip(md).split(" ").length : 0);

const FILLER = [/\bin conclusion\b/i, /\bin today's (?:world|market|landscape)\b/i, /\bdelve\b/i, /\bit(?:'s| is) important to note\b/i, /\bwhether you(?:'re| are) a seasoned\b/i, /\bin the ever[- ]evolving\b/i, /\btapestry\b/i, /\bgame[- ]changer\b/i, /\bunlock the\b/i, /\bdive in\b/i, /\blook no further\b/i, /\bwhen it comes to\b/i, /\bnavigat\w+ the world of\b/i];

/** Money, percentages and census-style counts: the kinds of figure that must come from a source. */
const FIGURE = /(?:\$\s?\d[\d,.]*(?:\s?(?:million|billion|k))?|\b\d[\d,.]*\s?(?:million|billion)\s(?:dollars|usd)|\b\d+(?:\.\d+)?\s?%|\b\d[\d,]*\s(?:copies|graded copies)\b)/gi;
const QUOTE = /[“"]([^”"]{25,})[”"]/g;
const SAID = /\b(said|says|told|stated|according to|announced|tweeted|wrote)\b/i;

/** Section headings with the subject's own words removed, so "Why X-Men #1 matters" equals "Why Hulk #181 matters". */
const headingSet = (md: string) => new Set((md.match(/^#{2,3} .+$/gm) ?? []).map((h) => normPhrase(h.replace(/^#+\s*/, "")).replace(/\b\d+\b/g, "").split(" ").filter((w) => w.length > 3).slice(0, 4).join(" ")).filter((h) => h.length > 3));

const digits = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.$/, "");

/** Links the article may not carry are turned back into plain text rather than failing the article. */
export function sanitizeLinks(body: string, ctx: Pick<QualityContext, "allowedLinks" | "allowedSources">): { body: string; removed: string[] } {
  const removed: string[] = [];
  const out = body.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    const path = href.split("#")[0].replace(/\/$/, "") || "/";
    const ok = href.startsWith("/") && !href.startsWith("//") ? ctx.allowedLinks.has(path) : ctx.allowedSources.has(href);
    if (ok) return whole;
    removed.push(href);
    return label;
  });
  return { body: out, removed };
}

export function checkQuality(input: Draft, ctx: QualityContext): QualityReport {
  const spec = FORMATS[ctx.format];
  const cleaned = sanitizeLinks(input.body, ctx);
  const body = cleaned.body;
  const text = strip(body);
  const words = countWords(body);
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean, severity: Check["severity"], detail: string) => checks.push({ id, label, ok, severity, detail });

  // Length
  add("length", "Length fits the format", words >= spec.minWords * 0.85 && words <= spec.maxWords * 1.25, words < spec.minWords * 0.6 ? "block" : "note", `${words} words; ${spec.name} is ${spec.minWords}–${spec.maxWords}`);

  // Headline and metadata
  const titleLen = input.title.trim().length;
  add("title", "Headline length", titleLen >= 20 && titleLen <= 110, titleLen < 10 ? "block" : "note", `${titleLen} characters`);
  const twin = ctx.existingTitles.find((t) => normPhrase(t) === normPhrase(input.title) || phraseSimilarity(t, input.title) >= 0.9);
  add("unique-title", "Headline is not one the site already has", !twin, "block", twin ? `same as "${twin}"` : "unique");
  // The same headline with another comic's name in it is a template, whatever the body says.
  const subjectTokens = new Set(normPhrase(ctx.subject ?? "").split(" ").filter(Boolean));
  const pattern = (t: string) => normPhrase(t).split(" ").filter((w) => w.length > 2 && !/^\d/.test(w) && !subjectTokens.has(w));
  const mine = pattern(input.title);
  const patternTwin = mine.length >= 4 ? (ctx.recentTitles ?? []).find((t) => normPhrase(t) !== normPhrase(input.title) && mine.filter((w) => normPhrase(t).split(" ").includes(w)).length / mine.length >= 0.85) : undefined;
  add("title-pattern", "Headline is not a reused pattern", !patternTwin, "review", patternTwin ? `same wording as "${patternTwin}" with another subject` : "own wording");
  add("seo-title", "Search title 30–62 characters", input.seoTitle.length >= 30 && input.seoTitle.length <= 62, "note", `${input.seoTitle.length} characters`);
  add("meta", "Meta description 110–160 characters", input.metaDescription.length >= 110 && input.metaDescription.length <= 160, "note", `${input.metaDescription.length} characters`);
  add("answer", "Direct answer present", input.answer.trim().length >= 40 && input.answer.trim().length <= 700, "block", `${input.answer.trim().length} characters`);
  add("slug", "Address is clean", /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) && input.slug.length <= 90, "block", input.slug);
  add("alt", "Image alt text", input.imageAlt.trim().length >= 15 && input.imageAlt.length <= 140, "note", `${input.imageAlt.trim().length} characters`);

  // Structure
  const h2 = (body.match(/^## .+$/gm) ?? []).length;
  const h1 = (body.match(/^# .+$/gm) ?? []).length;
  const needH2 = ctx.format === "news" || ctx.format === "faq" ? 0 : ctx.format === "longform" ? 5 : 2;
  add("headings", "Section headings", h2 >= needH2 && h1 === 0, h1 > 0 ? "block" : "note", `${h2} H2${h1 ? `, ${h1} H1 in the body` : ""}`);
  const orphanH3 = /^### /m.test(body) && h2 === 0;
  add("heading-order", "H3 only under an H2", !orphanH3, "note", orphanH3 ? "H3 without an H2" : "ok");
  if (ctx.format === "comparison") add("table", "Comparison table", /^\|.+\|\s*$/m.test(body), "note", /^\|.+\|\s*$/m.test(body) ? "present" : "missing");

  // Keyword use: present, and not stuffed
  const kw = normPhrase(input.primaryKeyword);
  const normText = normPhrase(text);
  const total = Math.max(1, normText.split(" ").length);
  const occurrences = kw ? normText.split(kw).length - 1 : 0;
  // Times the exact keyword appears per word of text: five uses in six hundred words is natural, thirty is not.
  const density = occurrences / total;
  const kwTokens = kw.split(" ").filter((w) => w.length > 2);
  const inHead = kwTokens.length > 0 && kwTokens.every((w) => normPhrase(`${input.title} ${input.seoTitle} ${input.answer}`).includes(w));
  add("keyword-present", "Primary keyword in the headline or answer", inHead, "note", inHead ? "present" : `"${input.primaryKeyword}" is not reflected in the headline, search title or answer`);
  add("keyword-density", "No keyword stuffing", density <= 0.02, density > 0.035 ? "block" : "review", `"${input.primaryKeyword}" appears ${occurrences} time${occurrences === 1 ? "" : "s"} in ${total} words`);

  // Repetition
  const repeat = repeatedSentenceShare(text);
  add("repetition", "No repeated sentences", repeat <= 0.03, repeat > 0.08 ? "block" : "review", `${(repeat * 100).toFixed(1)}% of sentences repeat`);
  const filler = FILLER.filter((re) => re.test(text)).length;
  add("filler", "No stock phrases", filler <= 1, filler > 4 ? "review" : "note", `${filler} stock phrase${filler === 1 ? "" : "s"}`);
  const similar = mostSimilar(body, ctx.corpus);
  add("similarity", "Does not repeat an existing article", similar.share <= 0.2, similar.share > 0.4 ? "block" : "review", similar.slug ? `${(similar.share * 100).toFixed(0)}% of its phrasing is in /guides/${similar.slug}` : "no overlap");

  const myHeads = headingSet(body);
  let twinOutline = { slug: null as string | null, share: 0 };
  for (const doc of ctx.corpus) {
    const theirs = headingSet(doc.body);
    if (myHeads.size < 3 || theirs.size < 3) continue;
    let hit = 0;
    for (const h of myHeads) if (theirs.has(h)) hit += 1;
    const share = hit / Math.min(myHeads.size, theirs.size);
    if (share > twinOutline.share) twinOutline = { slug: doc.slug, share };
  }
  add("outline", "Sections are its own, not a template", twinOutline.share < 0.6, twinOutline.share >= 0.8 ? "block" : "review", twinOutline.slug ? `${Math.round(twinOutline.share * 100)}% of its section headings match /guides/${twinOutline.slug}` : "no shared outline");

  // Links
  const internal = [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].length;
  const needLinks = ctx.format === "news" || ctx.format === "faq" ? 1 : 3;
  add("internal-links", "Internal links", internal >= needLinks, "note", `${internal} link${internal === 1 ? "" : "s"} to pages on the site${cleaned.removed.length ? `; ${cleaned.removed.length} link(s) to unknown addresses were removed` : ""}`);

  // Claims that need a source
  const facts = ctx.factsText.toLowerCase();
  // Compared digit for digit, so "$146,000" in the article is found as "146,000" or "146000" in the facts.
  const factDigits = facts.replace(/,(?=\d{3})/g, "");
  const figures = [...new Set((text.match(FIGURE) ?? []).map((f) => f.trim().replace(/[.,]+$/, "")))];
  const unsupported = figures.filter((f) => {
    const d = digits(f.replace(/,(?=\d{3})/g, ""));
    return d.length > 0 && !factDigits.includes(d);
  });
  add("figures", "Prices, percentages and counts come from the supplied facts", unsupported.length === 0, "review", unsupported.length ? `not in the supplied facts: ${unsupported.slice(0, 6).join(", ")}` : `${figures.length} figure(s), all supplied`);
  const quotes = [...text.matchAll(QUOTE)].filter((m) => SAID.test(text.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + m[0].length + 80)) && !facts.includes(m[1].toLowerCase().slice(0, 40)));
  add("quotes", "No quotations without a source", quotes.length === 0, "review", quotes.length ? `${quotes.length} attributed quotation(s) not found in the sources` : "none");

  // FAQ
  const questions = input.faq.map((f) => normPhrase(f.q));
  const uniqueFaq = new Set(questions).size === questions.length;
  add("faq", "Questions and answers", (ctx.format === "news" || input.faq.length >= 2) && uniqueFaq, "note", `${input.faq.length} question(s)${uniqueFaq ? "" : ", some repeated"}`);

  // News
  if (ctx.format === "news") {
    const cited = input.sources.filter((s) => s.url && ctx.allowedSources.has(s.url));
    add("sources", "At least one source the article was actually given", cited.length >= 1, "block", `${cited.length} source(s)`);
    add("claim-level", "Labelled confirmed, reported or analysis", ["confirmed", "reported", "analysis"].includes(input.claimLevel ?? ""), input.claimLevel === "rumor" ? "review" : "block", input.claimLevel ?? "missing");
  }

  const failed = checks.filter((c) => !c.ok);
  const blocked = failed.some((c) => c.severity === "block");
  const needsReview = failed.some((c) => c.severity === "review");
  const penalty = failed.reduce((n, c) => n + (c.severity === "block" ? 30 : c.severity === "review" ? 12 : 5), 0);
  return { score: Math.max(0, 100 - penalty), words, internalLinks: internal, checks, blocked, needsReview, body };
}

/** Required properties of the structured data the site emits. An empty list means valid. */
export function validateJsonLd(data: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const type = data["@type"];
  const need = (keys: string[]) => {
    for (const k of keys) {
      const v = data[k];
      if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) problems.push(`${String(type)}: missing ${k}`);
    }
  };
  if (data["@context"] !== "https://schema.org") problems.push("missing @context");
  if (type === "Article" || type === "NewsArticle" || type === "BlogPosting") {
    need(["headline", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage", "image"]);
    if (typeof data.headline === "string" && data.headline.length > 110) problems.push(`${type}: headline longer than 110 characters`);
    for (const k of ["datePublished", "dateModified"]) if (typeof data[k] === "string" && Number.isNaN(Date.parse(data[k] as string))) problems.push(`${type}: ${k} is not a date`);
  } else if (type === "FAQPage") {
    const items = data.mainEntity;
    if (!Array.isArray(items) || items.length === 0) problems.push("FAQPage: no questions");
    else for (const q of items as Record<string, unknown>[]) if (q["@type"] !== "Question" || !q.name || !(q.acceptedAnswer as Record<string, unknown> | undefined)?.text) problems.push("FAQPage: a question has no name or answer");
  } else if (type === "BreadcrumbList" || type === "ItemList") {
    const items = data.itemListElement;
    if (!Array.isArray(items) || items.length === 0) problems.push(`${type}: no items`);
    else for (const it of items as Record<string, unknown>[]) if (typeof it.position !== "number") problems.push(`${type}: an item has no position`);
  } else problems.push(`unexpected type ${String(type)}`);
  return problems;
}
