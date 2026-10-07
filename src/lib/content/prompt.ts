/**
 * What the writer and the fact-checker are asked, and how their answers are read. Pure.
 *
 * The writer gets a brief built from SEO Intelligence and from the site: the keywords, the
 * facts the site has already verified, and the only addresses it may link to. It is told to
 * leave out anything it is not certain of and to decline a topic it cannot write accurately.
 * A second model then reads the result as a sceptical editor.
 */
import { CATEGORIES, FORMATS, type ContentFormat } from "@/lib/content/categories";
import type { Draft } from "@/lib/content/quality";

export type BriefLink = { url: string; label: string; kind: "guide" | "product" | "collection" | "character" | "publisher" | "service" | "hub" };

export type Brief = {
  kind: "new" | "update" | "news";
  keyword: string;
  secondary: string[];
  supporting: string[];
  intent: string;
  category: string;
  format: ContentFormat;
  /** what the keyword is about */
  subject: string;
  /** suggested headline and sections from the page plan (templates, no facts) */
  planTitle: string;
  outline: string[];
  /** statements the site has already verified; the writer may rely on these */
  facts: string[];
  links: BriefLink[];
  /** headlines already on the site about the same subject: do not write these again */
  covered: string[];
  /** the address SEO Intelligence planned for this topic (several keyword clusters can share one) */
  planUrl?: string;
  /** headlines of recent machine-written articles: their wording must not be reused with another subject */
  recentTitles?: string[];
  today: string;
  /** update: the article being improved */
  existing?: { title: string; answer: string; body: string };
  /** news: which beat to look at and what was already reported */
  beat?: string;
  recentNews?: string[];
  allowedDomains?: string[];
};

const RULES = [
  "ACCURACY (this matters more than anything else):",
  "- State only what you are certain is true. If you are not certain of a date, an issue number, a creator credit, a print run, a census count or a price, leave it out. A shorter accurate article is always better than a longer one with a guess in it.",
  "- Never give a sale price, a 'worth', a price range, a percentage, a census figure or any statistic unless it appears in VERIFIED FACTS. To help a reader with value, explain what drives it (grade, page quality, label type, scarcity, demand) and tell them to check recent sold prices from auction houses and marketplaces.",
  "- Never quote anyone. Never invent a source, a study, an expert or an event. Never present speculation as fact; if something is uncertain or disputed, say so in plain words.",
  "- No investment advice and no promises about future value.",
  "- If you cannot write this topic accurately without guessing (an obscure book you do not know well, an ambiguous subject, a topic that is not about collectible comics), do not write it: reply with exactly <<<SKIP>>> followed by one sentence saying why.",
  "",
  "USEFULNESS:",
  "- Answer the search directly in the first sentence, then add what makes the answer usable. Write for one reader with one question.",
  "- Every section must add information. No introductions about how fascinating comics are, no summaries of what you just said, no closing paragraph that restates the article.",
  "- Stay on THIS subject. At least two thirds of the article must be about the specific book, character, creator or question in the brief: what it is, what is particular to it, what a collector of it needs to know. Do not re-explain general topics the site already covers (what CGC is, the grading scale, label colours, how to pack a slab, how the census works): give them one sentence with a link to the guide that covers them. An article that could be reused for another comic by changing the title is a failure.",
  "- If, after that, there is not enough that is specific and certain to reach the target length, write a shorter article. Length is never a reason to add general material.",
  "- Do not reuse the structure or sentences of the headlines listed under ALREADY ON THE SITE; this article must have its own angle and must not repeat them.",
  "- Plain, direct English. Short paragraphs. No hype words, no rhetorical questions, no 'in conclusion', no 'whether you are a seasoned collector'.",
  "- Do not refer to yourself or to the article ('I', 'we will', 'this guide covers', 'in this article'). Say the thing itself.",
  "",
  "SEO, done naturally:",
  "- Use the primary keyword in the headline or the first sentence, and where it reads naturally after that. Use secondary keywords only where they fit a real sentence. Never repeat a keyword to hit a count.",
  "- Headline: built from what is particular to this subject (what the book is, what it is known for, the question being answered), not a formula that would fit any comic. Under 70 characters where possible. Search title: 50–60 characters. Meta description: 130–155 characters, a real sentence that says what the reader gets.",
  "",
  "LINKS:",
  "- Link only to addresses listed under LINKS YOU MAY USE, written exactly as given, as Markdown: [anchor text](/path). Use descriptive anchor text that matches what the linked page is, never 'click here'. Link where it helps the reader; do not list links at the end. Link each address at most once.",
  "- A product link says only that a copy is listed for sale. State nothing about a listed copy (its grade, rarity or price) beyond the words of its link label.",
  "- No other internal addresses and no external links in the body.",
  "",
  "FORMAT of your reply (nothing before or after):",
  "<<<META>>>",
  "{one JSON object: title, slug (lowercase-with-dashes, under 80 characters), seoTitle, metaDescription, ogTitle, ogDescription, answer (the direct answer in 1–3 sentences, 60–500 characters), primaryKeyword, secondaryKeywords (array), semanticKeywords (array of related terms you actually used), tags (2–6), characters (array, exact character names the article is about, may be empty), titles (array of comic series names it is about, may be empty), publishers (array, may be empty), imageAlt (a plain description for the article's header image), faq (array of 2–5 {\"q\",\"a\"} with questions people really ask and answers of 1–3 sentences that follow the same accuracy rules)}",
  "<<<BODY>>>",
  "The article in Markdown. Use ## for sections and ### for sub-sections, never #. Bullet and numbered lists, **bold** and simple pipe tables are available. Do not repeat the headline or the answer paragraph at the top of the body.",
  "<<<END>>>",
];

const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;

export function writerSystem(): string {
  return ["You write for Rare Comics Collectors, an online shop that sells rare, vintage and CGC/CBCS graded comic books and offers appraisal, grading submission, pressing and consignment. Your readers are collectors and people who have just found or inherited comics.", "", ...RULES].join("\n");
}

const list = (items: string[], empty = "(none)") => (items.length ? items.map((i) => `- ${i}`).join("\n") : empty);

export function writerUser(b: Brief): string {
  const f = FORMATS[b.format];
  const parts = [
    b.kind === "update" ? "TASK: improve the existing article below so it answers the keywords better. Keep every fact that is already in it, keep its address and its subject, and add only what you are certain of." : "TASK: write one new article.",
    `SUBJECT: ${b.subject}`,
    `PRIMARY KEYWORD: ${b.keyword}`,
    `SEARCH INTENT: ${b.intent}`,
    `SECONDARY KEYWORDS (use only where natural):\n${list(b.secondary.slice(0, 8))}`,
    `RELATED SEARCHES (cover the ones that belong in this article):\n${list(b.supporting.slice(0, 10))}`,
    `CATEGORY: ${categoryName(b.category)}`,
    `FORMAT: ${f.name}. ${f.brief} Target ${f.minWords}–${f.maxWords} words.`,
    b.planTitle ? `WORKING HEADLINE (improve it; it is only a starting point): ${b.planTitle}` : "",
    b.outline.length ? `POINTS A READER EXPECTS:\n${list(b.outline)}` : "",
    `VERIFIED FACTS (true; you may rely on them and nothing here needs hedging):\n${list(b.facts, "(none supplied: rely only on what you are certain of)")}`,
    `LINKS YOU MAY USE:\n${list(b.links.map((l) => `${l.url} — ${l.label} (${l.kind})`))}`,
    `ALREADY ON THE SITE (do not rewrite these; link to them when relevant):\n${list(b.covered)}`,
    b.recentTitles?.length ? `HEADLINES RECENTLY PUBLISHED IN THIS SECTION (do not reuse their wording or structure with a different comic's name; find the angle that is particular to this subject):\n${list(b.recentTitles.slice(0, 25))}` : "",
    `TODAY: ${b.today}`,
    b.existing ? `EXISTING ARTICLE\nHeadline: ${b.existing.title}\nAnswer: ${b.existing.answer}\n\n${b.existing.body}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export function newsSystem(): string {
  return [
    "You are the news editor of Rare Comics Collectors, an online shop for rare and graded comic books. You report comic-book news for collectors: auctions and record sales, the grading companies, publishers' announcements, conventions and industry changes.",
    "",
    "You have a web search tool. Use it to find ONE real news item from the last few days on the beat you are given, then write a short update about it.",
    "",
    "RULES:",
    "- Report only what the pages you found actually say. Every fact in your update (names, dates, prices, grades, numbers) must appear in a page returned by your searches. If the sources disagree or a detail is missing, say so or leave it out.",
    "- Do not use your own memory for the news itself. Background that is long-established comic history may be added in one sentence if you are certain of it.",
    "- Never quote anyone unless the exact quotation is in a source, and then attribute it to that source.",
    "- If the item is a rumour, a leak or speculation, or you cannot find a source that states it plainly, do not write it up as news. If nothing newsworthy and verifiable turned up, or everything you found is already in ALREADY REPORTED, reply with exactly <<<SKIP>>> and one sentence saying why.",
    "- Separate what is confirmed from what it means: put any assessment of your own in a final section headed '## What it means for collectors' and write it as analysis, not fact.",
    "- Name the source in the text ('according to Heritage Auctions', 'CGC announced'). No hype.",
    "- Link only to addresses listed under LINKS YOU MAY USE.",
    "",
    "FORMAT of your final reply (nothing before or after):",
    "<<<META>>>",
    "{one JSON object: title (a factual headline under 80 characters), slug, seoTitle (50–60 characters), metaDescription (130–155), ogTitle, ogDescription, answer (what happened, in 1–2 sentences), primaryKeyword, secondaryKeywords, semanticKeywords, tags, characters, titles, publishers, imageAlt, eventDate (YYYY-MM-DD, the date the event happened or was announced, from the source), claimLevel (\"confirmed\" when an official or primary source states it, \"reported\" when only a news outlet does, \"analysis\" when the piece is mainly assessment, \"rumor\" when unconfirmed), sources (array of {\"label\": \"Publisher or site: page title\", \"url\": \"the exact address of a page your search returned\"}), faq (may be empty)}",
    "<<<BODY>>>",
    "150–400 words of Markdown. ## for the one or two section headings, never #.",
    "<<<END>>>",
  ].join("\n");
}

export function newsUser(b: Brief): string {
  return [
    `BEAT: ${b.beat ?? "comic book industry news"}`,
    `TODAY: ${b.today}. Look for items dated within the last 7 days; prefer the newest.`,
    `ALREADY REPORTED on this site (pick something else):\n${list((b.recentNews ?? []).slice(0, 40))}`,
    `LINKS YOU MAY USE:\n${list(b.links.map((l) => `${l.url} — ${l.label} (${l.kind})`))}`,
  ].join("\n\n");
}

export type Parsed = { ok: true; draft: Draft } | { ok: false; skipped: boolean; reason: string };

const strings = (v: unknown, max = 12): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 120))].slice(0, max) : []);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
export const cleanSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");

/** Reads the writer's reply. Anything that is not the agreed shape is a failure, never a guess. */
export function parseDraft(text: string): Parsed {
  const skip = text.match(/<<<SKIP>>>\s*([\s\S]{0,400})/);
  if (skip && !text.includes("<<<BODY>>>")) return { ok: false, skipped: true, reason: skip[1].trim().split("\n")[0] || "The writer declined the topic." };
  const meta = text.match(/<<<META>>>\s*([\s\S]*?)\s*<<<BODY>>>/);
  const bodyMatch = text.match(/<<<BODY>>>\s*([\s\S]*?)\s*(?:<<<END>>>|$)/);
  if (!meta || !bodyMatch) return { ok: false, skipped: false, reason: "The reply did not follow the agreed format." };
  let m: Record<string, unknown>;
  try {
    const raw = meta[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    m = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return { ok: false, skipped: false, reason: "The article's details were not valid JSON." };
  }
  const title = str(m.title, 160);
  const body = bodyMatch[1].trim().replace(/^#\s+.+\n+/, "");
  if (!title || body.length < 200) return { ok: false, skipped: false, reason: "The reply had no headline or no body." };
  const faq = Array.isArray(m.faq) ? (m.faq as unknown[]).flatMap((f) => (f && typeof f === "object" && typeof (f as { q?: unknown }).q === "string" && typeof (f as { a?: unknown }).a === "string" ? [{ q: str((f as { q: string }).q, 200), a: str((f as { a: string }).a, 1500) }] : [])).filter((f) => f.q.length >= 5 && f.a.length >= 10).slice(0, 6) : [];
  const sources = Array.isArray(m.sources) ? (m.sources as unknown[]).flatMap((s) => (s && typeof s === "object" && typeof (s as { label?: unknown }).label === "string" ? [{ label: str((s as { label: string }).label, 160), url: typeof (s as { url?: unknown }).url === "string" && /^https:\/\//.test((s as { url: string }).url) ? (s as { url: string }).url.slice(0, 500) : undefined }] : [])).slice(0, 8) : [];
  const answer = str(m.answer, 700);
  const draft: Draft = {
    title,
    slug: cleanSlug(str(m.slug, 120) || title),
    seoTitle: str(m.seoTitle, 70) || title.slice(0, 60),
    metaDescription: str(m.metaDescription, 170) || answer.slice(0, 155),
    ogTitle: str(m.ogTitle, 90) || title,
    ogDescription: str(m.ogDescription, 200) || answer.slice(0, 190),
    answer,
    body,
    faq,
    primaryKeyword: str(m.primaryKeyword, 120),
    secondaryKeywords: strings(m.secondaryKeywords),
    semanticKeywords: strings(m.semanticKeywords, 20),
    tags: strings(m.tags, 8),
    characters: strings(m.characters, 8),
    titles: strings(m.titles, 8),
    publishers: strings(m.publishers, 6),
    imageAlt: str(m.imageAlt, 140),
    sources,
    claimLevel: typeof m.claimLevel === "string" ? m.claimLevel : undefined,
    eventDate: typeof m.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.eventDate) ? m.eventDate : undefined,
  };
  return { ok: true, draft };
}

/* ------------------------------------------------------------ fact check */

export function checkerSystem(): string {
  return [
    "You are a fact-checking editor for a comic-book shop's website. You are sceptical by profession. You are given an article written by someone else and the list of facts the writer was allowed to rely on.",
    "",
    "Read every sentence and report any statement that is:",
    "- wrong, or probably wrong (a wrong first appearance, date, creator, publisher, issue number, grading rule, company fact);",
    "- a specific figure that is not in the supplied facts: any price, value, sale result, percentage, print run or census count;",
    "- a quotation, a named study or source, or a recent event that is not in the supplied facts;",
    "- speculation, a rumour or a prediction stated as fact; investment advice or a promise about future value;",
    "- misleading by omission in a way that could cost a buyer or seller money.",
    "Do not report style, tone or SEO. Do not report statements that are correct, well established, and safely general.",
    "",
    "For each problem copy the full sentence exactly as it appears in the article (so it can be found and removed), say what is wrong in a few words, and grade it: \"high\" = wrong, or an unsupported specific figure, quotation or event; \"medium\" = doubtful or you cannot confirm it; \"low\" = minor imprecision.",
    "",
    "Reply with one JSON object and nothing else: {\"verdict\": \"pass\" | \"fix\" | \"reject\", \"issues\": [{\"sentence\": \"…\", \"problem\": \"…\", \"severity\": \"high\" | \"medium\" | \"low\"}], \"summary\": \"one sentence\"}. Use \"pass\" when there are no high or medium issues, \"fix\" when removing the reported sentences would leave an accurate and still useful article, and \"reject\" when the article's main point is wrong or it would not survive the removals.",
  ].join("\n");
}

export function checkerUser(draft: Pick<Draft, "title" | "answer" | "body" | "faq">, facts: string[], sourceText?: string): string {
  return [
    `SUPPLIED FACTS:\n${list(facts, "(none)")}`,
    sourceText ? `SOURCE MATERIAL the article reports on:\n${sourceText}` : "",
    `ARTICLE\nHeadline: ${draft.title}\nAnswer: ${draft.answer}\n\n${draft.body}`,
    draft.faq.length ? `QUESTIONS AND ANSWERS\n${draft.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export type Issue = { sentence: string; problem: string; severity: "high" | "medium" | "low" };
export type Verdict = { verdict: "pass" | "fix" | "reject"; issues: Issue[]; summary: string };

/** Reads the checker's reply; an unreadable reply is treated as "a person must look", never as a pass. */
export function parseVerdict(text: string): Verdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { verdict?: unknown; issues?: unknown; summary?: unknown };
    if (v.verdict !== "pass" && v.verdict !== "fix" && v.verdict !== "reject") return null;
    const issues = Array.isArray(v.issues) ? (v.issues as unknown[]).flatMap((i) => {
      const o = i as { sentence?: unknown; problem?: unknown; severity?: unknown };
      if (!o || typeof o.sentence !== "string" || typeof o.problem !== "string") return [];
      const severity = o.severity === "high" || o.severity === "medium" || o.severity === "low" ? o.severity : "medium";
      return [{ sentence: o.sentence.trim(), problem: o.problem.trim().slice(0, 300), severity } as Issue];
    }).slice(0, 40) : [];
    return { verdict: v.verdict, issues, summary: typeof v.summary === "string" ? v.summary.slice(0, 400) : "" };
  } catch {
    return null;
  }
}

/**
 * Removes the sentences the checker reported as high or medium from an article. Returns the new
 * text and the issues whose sentence could not be found (those need a person).
 */
export function applyVerdict<T extends Pick<Draft, "body" | "answer" | "faq">>(draft: T, verdict: Verdict): { draft: T; removed: Issue[]; unresolved: Issue[] } {
  let body = draft.body;
  let faq = draft.faq;
  const removed: Issue[] = [];
  const unresolved: Issue[] = [];
  for (const issue of verdict.issues.filter((i) => i.severity !== "low")) {
    const s = issue.sentence;
    if (s.length >= 12 && body.includes(s)) {
      body = body.replace(s, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ");
      removed.push(issue);
    } else if (faq.some((f) => f.a.includes(s) || f.q.includes(s))) {
      faq = faq.filter((f) => !(f.a.includes(s) || f.q.includes(s)));
      removed.push(issue);
    } else unresolved.push(issue);
  }
  // A heading left with nothing under it goes too: one directly followed by the next heading of
  // the same or a higher level, or one at the very end.
  body = body.replace(/^## .+\n+(?=## )/gm, "").replace(/^### .+\n+(?=#{2,3} )/gm, "").replace(/\n#{2,3} [^\n]+\s*$/, "").trim();
  return { draft: { ...draft, body, faq }, removed, unresolved };
}

/** The beats the news desk looks at, in rotation. */
export const NEWS_BEATS = [
  "record comic book sales and results at the major auction houses (Heritage Auctions, ComicConnect, ComicLink)",
  "announcements from the grading companies CGC and CBCS: services, labels, fees, turnaround times, policies",
  "publisher announcements from Marvel, DC, Image, Dark Horse, IDW and Boom: new series, milestone issues, anniversaries, creative teams",
  "comic conventions and events: dates, announcements and exclusives from organisers",
  "the comic book industry and market: distribution, retail, sales charts and business news",
  "comic creators: major projects, awards and news about well-known writers and artists",
  "film and television announcements that directly affect demand for specific key issues, as reported by reliable outlets",
];

export const PRIMARY_NEWS_DOMAINS = ["cgccomics.com", "cbcscomics.com", "ha.com", "comicconnect.com", "comiclink.com", "marvel.com", "dc.com", "imagecomics.com", "darkhorse.com", "idwpublishing.com", "boom-studios.com", "comic-con.org", "previewsworld.com", "lunardistribution.com", "prhcomics.com"];
export const SECONDARY_NEWS_DOMAINS = ["icv2.com", "comicsbeat.com", "publishersweekly.com", "hollywoodreporter.com", "variety.com", "cbr.com", "gocollect.com", "deadline.com", "comicbook.com", "newsarama.com"];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const onList = (host: string, domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * How well a news item is supported, decided here from the sources it cites and not by the
 * writer: "confirmed" needs an official source or two independent outlets; a single outlet is
 * "reported". A writer's own "analysis" or "rumor" label is kept, never upgraded.
 */
export function claimLevelFor(writerLevel: string | undefined, sourceUrls: string[]): "confirmed" | "reported" | "analysis" | "rumor" {
  if (writerLevel === "rumor") return "rumor";
  const hosts = [...new Set(sourceUrls.map(hostOf).filter(Boolean))];
  const primary = hosts.some((h) => onList(h, PRIMARY_NEWS_DOMAINS));
  const outlets = new Set(hosts.filter((h) => onList(h, SECONDARY_NEWS_DOMAINS)).map((h) => h.split(".").slice(-2).join(".")));
  if (hosts.length === 0) return "rumor";
  if (writerLevel === "analysis") return "analysis";
  return primary || outlets.size >= 2 ? "confirmed" : "reported";
}
