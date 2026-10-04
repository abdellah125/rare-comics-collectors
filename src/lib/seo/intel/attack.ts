/**
 * Competitive weakness and the "attack" score: where a competitor's ranking can realistically
 * be taken. Pure. Every signal is derived from data the system holds (positions, domains, URLs,
 * titles, and the competitor page itself when it has been inspected); a signal without data is
 * simply absent, never assumed.
 *
 *   attack = (0.25 × demand + 0.25 × rankability + 0.25 × intent value + 0.25 × weakness) × relevance / 100
 */
import { normPhrase } from "@/lib/seo/intel/entities";

export type DomainKind = "marketplace" | "social" | "video" | "reference" | "price_guide" | "dealer" | "publisher" | "media" | "other";

const KINDS: [RegExp, DomainKind][] = [
  [/(^|\.)(ebay|amazon|etsy|walmart|whatnot|mercari|target)\./, "marketplace"],
  [/(^|\.)(youtube|tiktok|vimeo)\./, "video"],
  [/(^|\.)(reddit|facebook|instagram|pinterest|quora|twitter|x)\.|^boards\./, "social"],
  [/(^|\.)(pricecharting|gocollect|covrprice|comicbookrealm|keycollectorcomics|comicspriceguide|gpanalysis)\./, "price_guide"],
  [/(^|\.)(marvel|dc|dccomics|imagecomics|darkhorse)\.com$/, "publisher"],
  [/(^|\.)(wikipedia|fandom|comicvine|gamespot|comics|goodreads|tvtropes|leagueofcomicgeeks|cgccomics|cbcscomics)\.|\.(org|edu)$/, "reference"],
  [/(^|\.)(cbr|screenrant|comicbook|ign|bleedingcool|comicbookherald|crushingkrisis|gamesradar|polygon)\./, "media"],
  [/(^|\.)(ha|comiclink|comicconnect|heritageauctions|mycomicshop|milehighcomics|midtowncomics|qualitycomix|shortboxed|coffeeandacomic|metropoliscomics|pedigreecomics|superworldcomics|sellmycomicbooks|waltscomicshop|thehallofcomics|comicsandcollectiblesnearme|grahamcrackers|tfaw|dcbservice|westfieldcomics|comic-central|multiversecomicbox|comicsanctum)\./, "dealer"],
];
export const cleanDomain = (d: string) => d.toLowerCase().replace(/^www\./, "");
export function domainKind(domain: string): DomainKind {
  const d = cleanDomain(domain);
  return KINDS.find(([re]) => re.test(d))?.[1] ?? "other";
}
export const KIND_LABEL: Record<DomainKind, string> = { marketplace: "Marketplace", social: "Forum / social", video: "Video", reference: "Reference / wiki", price_guide: "Price guide", dealer: "Comic dealer", publisher: "Publisher", media: "News / media", other: "Other site" };
/** Sites whose pages are not written to sell or to answer the query in depth. */
const WEAK_CONTENT: DomainKind[] = ["social", "video"];
/** Sites that compete for the same buyer. */
export const DIRECT: DomainKind[] = ["dealer", "other", "price_guide"];

export type Rival = { domain: string; position: number; url?: string; title?: string };
/** What a fetch of the competitor's ranking page showed. */
export type RivalPage = { wordCount: number | null; hasOffer: boolean | null; latestYear: number | null };

export type AttackInput = {
  phrase: string;
  intent: string;
  /** the store has the specific issue (or series) on sale */
  inStock: boolean;
  difficulty: number | null;
  ourPosition: number | null;
  rivals: Rival[];
  rivalPage?: RivalPage | null;
  demand: number | null;
  rankability: number | null;
  intentValue: number;
  relevance: number;
  thisYear: number;
};

export type AttackResult = { target: Rival & { kind: DomainKind }; weakness: number; reasons: string[]; attack: number | null; level: "high" | "medium" | "low" };

const tokens = (s: string) => normPhrase(s).split(" ").filter((w) => w.length > 2 && !["the", "and", "for", "comic", "comics", "book", "books"].includes(w));

export function assessAttack(i: AttackInput): AttackResult | null {
  const rivals = i.rivals.filter((r) => r.position > 0).sort((a, b) => a.position - b.position);
  if (rivals.length === 0) return null;
  // The competitor to beat: the best-placed site that sells or prices comics; else whoever leads.
  const direct = rivals.find((r) => DIRECT.includes(domainKind(r.domain)) && r.position <= 30);
  const pick = direct ?? rivals[0];
  const target = { ...pick, kind: domainKind(pick.domain) };
  const buyer = i.intent === "transactional" || i.intent === "commercial";
  const top10 = rivals.filter((r) => r.position <= 10);
  const reasons: string[] = [];
  let w = 0;

  if (target.position >= 5 && target.position <= 20) {
    const add = target.position > 10 ? 25 : 18;
    w += add;
    reasons.push(`${target.domain} only ranks #${target.position}`);
  } else if (target.position > 20) {
    w += 12;
    reasons.push(`${target.domain} is beyond page two (#${target.position})`);
  }
  const weak = top10.filter((r) => WEAK_CONTENT.includes(domainKind(r.domain)));
  if (weak.length >= 2) {
    w += weak.length >= 4 ? 22 : 15;
    reasons.push(`${weak.length} of the top 10 are forum threads, videos or social posts`);
  }
  if (buyer && top10.length >= 5 && !rivals.some((r) => r.position <= 5 && domainKind(r.domain) === "dealer")) {
    w += 12;
    reasons.push("no comic dealer in the top 5 for a buyer keyword");
  }
  if (buyer && i.inStock && ["price_guide", "reference", "social", "video", "media", "publisher"].includes(target.kind)) {
    w += 15;
    reasons.push(`${target.domain} informs but does not sell; this store has the book in stock`);
  }
  if (target.url) {
    let path = "";
    try { path = new URL(target.url).pathname; } catch { path = ""; }
    const want = tokens(i.phrase);
    const hay = ` ${normPhrase(`${target.title ?? ""} ${path.replace(/[-_/]/g, " ")}`)} `;
    const missing = want.filter((t) => !hay.includes(` ${t}`));
    if (path === "/" || path === "") {
      w += 15;
      reasons.push("it ranks with its home page, not a page for this keyword");
    } else if (want.length >= 2 && missing.length / want.length >= 0.5) {
      w += 12;
      reasons.push(`its page is not written for the keyword (title and URL lack “${missing.slice(0, 3).join("”, “")}”)`);
    }
  }
  if (normPhrase(i.phrase).split(" ").length >= 4 && i.difficulty !== null && i.difficulty <= 20) {
    w += 10;
    reasons.push("long-tail phrase with low difficulty");
  }
  if (i.rivalPage) {
    if (i.rivalPage.wordCount !== null && i.rivalPage.wordCount < 300) {
      w += 15;
      reasons.push(`its page is thin (${i.rivalPage.wordCount} words)`);
    }
    if (i.rivalPage.latestYear !== null && i.rivalPage.latestYear <= i.thisYear - 2) {
      w += 10;
      reasons.push(`its page looks dated (latest year on it: ${i.rivalPage.latestYear})`);
    }
    if (buyer && i.rivalPage.hasOffer === false) {
      w += 8;
      reasons.push("its page has no product or price markup");
    }
  }
  const weakness = Math.min(100, w);
  const attack = i.demand === null || i.rankability === null ? null : Math.round(((0.25 * i.demand + 0.25 * i.rankability + 0.25 * i.intentValue + 0.25 * weakness) * i.relevance) / 100);
  const level = attack === null ? "low" : attack >= 62 ? "high" : attack >= 45 ? "medium" : "low";
  return { target, weakness, reasons, attack, level };
}

/** What a position calls for. */
export function rankBand(position: number | null): { band: string; action: string } {
  if (position === null) return { band: "Not ranking", action: "Create or strengthen the target page and link to it from its topic hub." };
  if (position <= 3) return { band: "#1–3: protect", action: "Keep the page current and add supporting pages and internal links around it." };
  if (position <= 10) return { band: "#4–10: push to top 3", action: "High priority: sharpen the title and first paragraph for the query, add what the pages above cover, and add internal links." };
  if (position <= 20) return { band: "#11–20: optimise", action: "Strong opportunity: match the search intent fully, expand the content and link to the page from related pages." };
  if (position <= 30) return { band: "#21–30: deepen", action: "Improve relevance and content depth; make sure one page, not several, targets the query." };
  return { band: "Beyond #30", action: "The page is seen as loosely related: give the query its own section or its own page." };
}

export type DropInput = { phrase: string; prev: number; position: number | null; prevUrl: string | null; url: string | null; pageGone: boolean; pagesCompeting: number; auditIssues: string[]; impressionsPrev: number | null; impressions: number | null };

/** The most likely reason a ranking fell, from the evidence at hand, and what to do. */
export function diagnoseDrop(d: DropInput): { reason: string; action: string } {
  if (d.pageGone) return { reason: "the page that ranked is no longer live (sold, hidden or removed)", action: "Keep a page at that URL: show similar copies in stock or redirect it to the issue guide, so the ranking is not lost with the listing." };
  if (d.prevUrl && d.url && d.prevUrl !== d.url) return { reason: `Google switched the ranking page from ${d.prevUrl} to ${d.url}`, action: "Decide which page should rank and link the other one to it with the keyword as anchor text." };
  if (d.pagesCompeting >= 2) return { reason: `${d.pagesCompeting} pages of the site show for this query and split the signals`, action: "Consolidate: one page targets the query, the others link to it." };
  const blocking = d.auditIssues.filter((c) => ["noindex", "http_error", "canonical_elsewhere", "title_missing"].includes(c));
  if (blocking.length) return { reason: `the page has a technical problem (${blocking.join(", ").replace(/_/g, " ")})`, action: "Fix the issue shown in the site audit, then request re-indexing." };
  if (d.position === null) return { reason: "the query no longer shows the site in the 28-day window (few searches, or it fell out of the top 100)", action: "Check the page still answers the query; if the keyword matters, strengthen it and add internal links." };
  if (d.position - d.prev < 3) return { reason: "a small move within normal fluctuation", action: "No action yet; watch the next check." };
  const softer = d.auditIssues.filter((c) => ["thin_content", "few_inlinks", "title_misses_query", "title_duplicate"].includes(c));
  if (softer.length) return { reason: `competitors moved ahead and the page is weak on ${softer.join(", ").replace(/_/g, " ")}`, action: "Fix those points first: they are what the pages above do better." };
  return { reason: "competing pages moved ahead; nothing on this site changed", action: "Compare the page with the current top three (Read Google results) and add what they cover that it does not." };
}
