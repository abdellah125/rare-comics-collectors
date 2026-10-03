/**
 * What a keyword is about (a specific issue, a character's first appearance, a series, an era,
 * a publisher, grading, or a general topic), how relevant that is to a shop selling graded
 * collectible comics, and which keywords belong on the same page (the cluster key).
 * Pure: the catalogue (series, characters, publishers the site knows) is passed in.
 */
import { classifyIntent, type IntentResult } from "@/lib/seo/intel/intent";

export type Catalog = {
  /** normalised series names, see normPhrase() */
  series: string[];
  /** series with at least one listing on sale */
  stockedSeries: Set<string>;
  /** "series|issue" for listings on sale */
  stockedIssues: Set<string>;
  characters: string[];
  publishers: string[];
};

export type EntityType = "issue" | "first_appearance" | "series" | "character" | "era" | "publisher" | "grading" | "topic";
export type Entity = { type: EntityType; key: string; label: string; series?: string; issue?: string; inStock?: boolean };
export type Bucket = "buy" | "value" | "learn" | "all";

export const ERAS = ["golden age", "silver age", "bronze age", "copper age", "modern age"] as const;

/** Lower-case, hyphens and punctuation to spaces, "#12" → "12": the form everything is matched in. */
export function normPhrase(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’']/g, "")
    .replace(/&/g, " and ")
    .replace(/#\s*(\d)/g, " $1")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // one-word spellings people type
    .replace(/\bspiderman\b/g, "spider man").replace(/\bxmen\b/g, "x men").replace(/\bironman\b/g, "iron man").replace(/\bantman\b/g, "ant man").replace(/\bsubmariner\b/g, "sub mariner").replace(/\bshehulk\b/g, "she hulk");
}

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)/g, (m, a: string, b: string) => (["of", "the", "and", "in", "to", "a"].includes(m) ? m : a.toUpperCase() + b)).replace(/^./, (c) => c.toUpperCase()).replace(/\bX Men\b/g, "X-Men").replace(/\bSpider Man\b/g, "Spider-Man").replace(/\bSub Mariner\b/g, "Sub-Mariner").replace(/\bShe Hulk\b/g, "She-Hulk").replace(/\bX Force\b/g, "X-Force").replace(/\bX Factor\b/g, "X-Factor").replace(/\bCgc\b/g, "CGC").replace(/\bCbcs\b/g, "CBCS").replace(/\bDc\b/g, "DC").replace(/\bTmnt\b/g, "TMNT");
export const displayName = titleCase;

/** Collector shorthand → series, only read as a series when an issue number follows. */
const ALIASES: Record<string, string> = {
  asm: "amazing spider man", af: "amazing fantasy", tos: "tales of suspense", tta: "tales to astonish", jim: "journey into mystery", ff: "fantastic four", ih: "incredible hulk",
  hulk: "incredible hulk", uxm: "uncanny x men", gsx: "giant size x men", tmnt: "teenage mutant ninja turtles", tec: "detective comics", nm: "new mutants", bb: "brave and the bold", st: "strange tales",
};

const NOT_ISSUE_AFTER = /^(cgc|cbcs|pgx)$/;
const isYear = (n: string) => /^(19[3-9]\d|20[0-2]\d)$/.test(n);

function findSeries(p: string, catalog: Catalog): { series: string; end: number } | null {
  const padded = ` ${p} `;
  let best: { series: string; end: number } | null = null;
  for (const s of catalog.series) {
    const i = padded.indexOf(` ${s} `);
    if (i >= 0 && (!best || s.length > best.series.length)) best = { series: s, end: i + s.length + 1 };
  }
  return best;
}

export function extractEntity(phrase: string, catalog: Catalog): Entity {
  const p = normPhrase(phrase);
  const words = p.split(" ");

  // 1. A specific issue: "<series> [issue|no] <n>", or shorthand + number ("asm 300", "hulk 181").
  let found = findSeries(p, catalog);
  let rest = found ? ` ${p} `.slice(found.end).trim() : "";
  if (!found || !/^(?:issue |no |number )?\d{1,4}\b/.test(rest)) {
    for (let i = 0; i < words.length - 1; i++) {
      const alias = ALIASES[words[i]];
      if (alias && /^\d{1,4}$/.test(words[i + 1]) && !isYear(words[i + 1])) {
        found = { series: alias, end: 0 };
        rest = words.slice(i + 1).join(" ");
        break;
      }
    }
  }
  if (found) {
    const m = rest.match(/^(?:issue |no |number )?(\d{1,4})\b(?!\.\d)/);
    if (m && !isYear(m[1]) && !NOT_ISSUE_AFTER.test(words[words.indexOf(m[1]) - 1] ?? "")) {
      const issue = String(Number(m[1]));
      // "hulk 181" is Incredible Hulk #181; the 2008 Hulk series never reached those numbers.
      if (found.series === "hulk" && Number(issue) > 100) found = { series: "incredible hulk", end: 0 };
      return { type: "issue", key: `issue:${found.series}:${issue}`, label: `${titleCase(found.series)} #${issue}`, series: found.series, issue, inStock: catalog.stockedIssues.has(`${found.series}|${issue}`) };
    }
  }

  // 2. A character's first appearance.
  const padded = ` ${p} `;
  const character = catalog.characters.filter((c) => padded.includes(` ${c} `)).sort((a, b) => b.length - a.length)[0];
  if (character && /\b(first appearance|1st appearance|first app|1st app|debut|first appear|first comic|1st comic|first introduced|first issue)\b/.test(p)) {
    return { type: "first_appearance", key: `first-appearance:${character}`, label: `First appearance of ${titleCase(character)}` };
  }

  // 3. An era, a series, a character, a publisher.
  const era = ERAS.find((e) => padded.includes(` ${e} `));
  if (era) return { type: "era", key: `era:${era}`, label: `${titleCase(era)} comics` };
  if (found) return { type: "series", key: `series:${found.series}`, label: titleCase(found.series), series: found.series, inStock: catalog.stockedSeries.has(found.series) };
  if (character) return { type: "character", key: `character:${character}`, label: titleCase(character) };
  const publisher = catalog.publishers.filter((x) => padded.includes(` ${x} `)).sort((a, b) => b.length - a.length)[0];
  if (publisher) return { type: "publisher", key: `publisher:${publisher}`, label: `${titleCase(publisher)} comics` };

  // 4. Grading as a subject, else a general topic identified by its core words.
  const sig = topicSignature(p);
  if (/\b(grading|grade|grader|cgc|cbcs|pgx|slab|slabbed|pressing|restoration|signature series)\b/.test(p) && !/\b(for sale|buy|shop|store)\b/.test(p)) return { type: "grading", key: `grading:${sig}`, label: titleCase(sig.replace(/-/g, " ")) };
  return { type: "topic", key: `topic:${sig}`, label: titleCase(sig.replace(/-/g, " ")) };
}

/** Words that change the page a query deserves are kept; modifiers and filler are dropped. */
const STOP = new Set(["a", "an", "the", "of", "for", "to", "in", "on", "and", "or", "is", "are", "my", "your", "me", "i", "do", "does", "what", "how", "much", "where", "can", "you", "it", "with", "at", "by", "from", "that", "this", "be", "near", "online", "best", "top", "good", "cheap", "sale", "buy", "buying", "purchase", "shop", "shopping", "order", "get", "find", "new", "list", "guide", "book", "books", "issue", "issues", "2024", "2025", "2026"]);
const CANON: Record<string, string> = { comics: "comic", cgc: "graded", slabbed: "graded", slab: "graded", slabs: "graded", grading: "grade", grades: "grade", values: "value", worth: "value", prices: "price", pricing: "price", keys: "key", collectibles: "collectible", collectable: "collectible", collectables: "collectible", stores: "store", shops: "store", dealers: "dealer", auctions: "auction", appearances: "appearance", "1st": "first", vs: "versus", old: "vintage", antique: "vintage", rarest: "rare", investing: "investment", invest: "investment" };

export function topicSignature(normalised: string): string {
  const tokens = normalised.split(" ").map((w) => CANON[w] ?? w).filter((w) => w && !STOP.has(w));
  const unique = [...new Set(tokens)].sort();
  return (unique.length ? unique : ["comic"]).join("-");
}

export function bucketFor(entity: Entity, intent: IntentResult): Bucket {
  // An issue and a first-appearance question each deserve one page, whatever the modifier.
  if (entity.type === "issue" || entity.type === "first_appearance") return "all";
  // Grading as a subject is something people read about; it is only "buy" when they say so.
  if (entity.type === "grading") return intent.intent === "transactional" ? "buy" : "learn";
  if (intent.specific.includes("price_value") && intent.intent !== "transactional") return "value";
  if (intent.intent === "transactional" || (intent.intent === "commercial" && !intent.specific.includes("comparison"))) return "buy";
  return "learn";
}

export const clusterKey = (entity: Entity, bucket: Bucket) => (bucket === "all" ? entity.key : `${entity.key}|${bucket}`);

// ───────────────────────────── relevance ─────────────────────────────

const OFF_TOPIC: [RegExp, number, string][] = [
  [/\b(porn|hentai|xxx|nsfw|rule 34|sex|nude)\b/, 0, "adult content"],
  [/\b(read online|read free|free online|pdf|download|cbr|cbz|torrent|scans?|free comics?|online free|webtoon|webcomic)\b/, 5, "wants to read for free, not buy a collectible"],
  [/\b(movie|movies|film|trailer|cast|actor|netflix|disney plus|tv show|series cast|episode|season \d|box office|streaming)\b/, 8, "about a film or show"],
  [/\b(game|games|lego|funko|pop|toy|toys|action figure|figure|costume|cosplay|wallpaper|drawing|draw|coloring|tattoo|shirt|t shirt|poster|hoodie|plush|statue)\b/, 8, "about merchandise or art, not comics"],
  [/\b(comic sans|comic strip|comic con|comiccon|convention tickets|garfield|peanuts|calvin and hobbes|newspaper)\b/, 10, "not collectible comic books"],
  [/\b(manga|anime|manhwa|manhua|light novel)\b/, 20, "manga is not sold here"],
  [/\b(omnibus|trade paperback|tpb|hardcover|graphic novel|kindle|digital)\b/, 25, "collected editions and digital are not sold here"],
];
const COMIC_SIGNAL = /\b(comic|comics|comic book|comic books|issue|cgc|cbcs|graded|slab|slabbed|key issue|first appearance|1st appearance|golden age|silver age|bronze age|copper age|newsstand|variant)\b/;

export type Relevance = { score: number; reason: string };

export function relevanceFor(phrase: string, entity: Entity, intent: IntentResult): Relevance {
  const p = normPhrase(phrase);
  for (const [re, score, reason] of OFF_TOPIC) if (re.test(p)) return { score, reason };
  if (intent.intent === "navigational" && intent.brand) return { score: 10, reason: `the searcher wants ${intent.brand}` };
  if (/\b(sell|selling)\b/.test(p)) return { score: 60, reason: "seller looking to sell or consign: a services lead, not a buyer" };
  // "wolverine vs hulk", "marvel vs dc": fan debates with huge volume and no buyer behind them.
  if (/\b(vs|versus)\b/.test(p) && !/\b(cgc|cbcs|pgx|graded|raw|slab|newsstand|direct|edition|print|printing|variant|value|price|grade)\b/.test(p)) return { score: 25, reason: "a versus debate about characters or publishers, not about buying comics" };
  const graded = /\b(cgc|cbcs|graded|slab|slabbed|signature series|9\.[0-9])\b/.test(p);
  switch (entity.type) {
    case "issue":
      return entity.inStock ? { score: 100, reason: "a specific issue the store has on sale" } : { score: graded ? 90 : 82, reason: "a specific collectible issue (not currently in stock)" };
    case "first_appearance":
      return { score: 78, reason: "first-appearance research leads straight to a key issue" };
    case "era":
      return { score: 90, reason: "an era the store has a collection page for" };
    case "series":
      return entity.inStock ? { score: graded ? 95 : 85, reason: "a series the store has on sale" } : { score: graded ? 80 : 68, reason: "a comic series (nothing in stock right now)" };
    case "character":
      return COMIC_SIGNAL.test(p) ? { score: 72, reason: "a character, searched as comics" } : { score: 35, reason: "a character with no sign the searcher means comic books" };
    case "publisher":
      return COMIC_SIGNAL.test(p) ? { score: 75, reason: "a publisher's comics" } : { score: 40, reason: "a publisher with no comic-book signal" };
    case "grading":
      return { score: 80, reason: "grading research: the buyers of slabbed books" };
    default:
      if (graded && /\bcomic/.test(p)) return { score: 92, reason: "graded comics, the store's product" };
      if (intent.specific.includes("first_appearance")) return { score: 70, reason: "first-appearance research leads to a key issue" };
      if (/\b(key issues?|rare|vintage|collectible|valuable|value|worth|price|investment|old)\b/.test(p) && COMIC_SIGNAL.test(p)) return { score: 82, reason: "collectible comic research" };
      if (/\b(comic book|comic books|comics|comic)\b/.test(p)) return { score: 55, reason: "comics in general; no sign of collecting or buying graded books" };
      return { score: 20, reason: "no comic-book signal in the phrase" };
  }
}

/** Everything the phrase alone tells us. */
export function analysePhrase(phrase: string, catalog: Catalog, providerIntent?: string | null) {
  const intent = classifyIntent(phrase, providerIntent);
  const entity = extractEntity(phrase, catalog);
  const bucket = bucketFor(entity, intent);
  const relevance = relevanceFor(phrase, entity, intent);
  return { intent, entity, bucket, relevance, clusterKey: clusterKey(entity, bucket) };
}
