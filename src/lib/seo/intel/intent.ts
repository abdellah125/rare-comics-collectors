/**
 * Search-intent classification for comic keywords. Pure and deterministic: the phrase decides,
 * the provider's own label (DataForSEO `main_intent`) breaks ties and fills in when the phrase
 * carries no signal. Nothing here calls an API.
 */

export const INTENTS = ["transactional", "commercial", "informational", "navigational"] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_LABEL: Record<Intent, string> = { transactional: "Transactional", commercial: "Commercial investigation", informational: "Informational", navigational: "Navigational" };

export const SPECIFIC_INTENTS = ["buying", "price_value", "collecting", "identification", "first_appearance", "investment_rarity", "grading", "comparison"] as const;
export type SpecificIntent = (typeof SPECIFIC_INTENTS)[number];
export const SPECIFIC_LABEL: Record<SpecificIntent, string> = {
  buying: "Buying",
  price_value: "Price / value research",
  collecting: "Collecting",
  identification: "Identification",
  first_appearance: "First appearance",
  investment_rarity: "Investment / rarity research",
  grading: "Grading",
  comparison: "Comparison",
};

/** Marketplaces, graders and publishers people search for by name: the searcher wants that site, not ours. */
export const BRAND_TERMS = ["ebay", "amazon", "mycomicshop", "my comic shop", "comiclink", "comic link", "comicconnect", "heritage auctions", "heritage", "gocollect", "go collect", "key collector", "midtown comics", "mile high comics", "mile high", "comixology", "webtoon", "marvel unlimited", "hipcomic", "whatnot", "shortboxed", "covrprice", "overstreet", "comicvine", "comic vine", "league of comic geeks", "walmart", "target", "barnes and noble", "pedigree comics", "metropolis comics", "dcbs", "tfaw", "things from another world", "lone star comics", "atomic empire", "golden age collectables", "golden age collectibles", "quality comix", "pricecharting", "price charting"];
const BRAND_NAV = /\b(login|log in|sign in|account|customer service|phone number|app|coupon|promo code|website|\.com|census|cert(?:ification)? (?:lookup|verification|check)|verify|verification|lookup|tool|registry|submission form|tracking|status)\b/;

const TRANSACTIONAL = /\b(buy|buying|purchase|order|for sale|on sale|shop|shopping|store|stores|dealer|dealers|auction|auctions|cheap|discount|deal|deals|near me|online store|where to buy|sell|selling|price to buy)\b/;
const COMMERCIAL = /\b(best|top \d+|top|most valuable|valuable|worth|value|values|price|prices|price guide|pricing|cost|review|reviews|vs|versus|compare|comparison|key issues?|keys|investment|invest|investing|rare|rarest|collectible|collectibles)\b/;
/** Grading words only signal a shopper when the phrase is about a book ("avengers 4 cgc", "graded comics"), not about grading itself ("cgc newton rings"). */
const GRADED_PRODUCT = /\b(graded|cgc|cbcs|slabbed|slab|9\.[0-9]|signature series)\b/g;
const ABOUT_A_BOOK = /\b(\d{1,4}|comic|comics|books?)\b/;
const INFORMATIONAL = /^(what|when|who|why|how|where|which|is|are|does|do|did|can|should)\b|\b(first appearance|1st appearance|first app|debut|origin|history|meaning|definition|explained|guide|list|checklist|timeline|facts|difference between|how to|what is|when did|who created|reading order|scale)\b/;

const SPECIFIC: [SpecificIntent, RegExp][] = [
  ["buying", /\b(buy|buying|purchase|for sale|on sale|shop|store|stores|dealer|dealers|auction|auctions|where to buy|near me|order)\b/],
  ["comparison", /\b(vs|versus|compare|comparison|difference between|or cbcs|or cgc|better than)\b/],
  ["first_appearance", /\b(first appearance|1st appearance|first app|1st app|debut|first comic|1st comic|first issue|when did .* first appear|first appear)\b/],
  ["price_value", /\b(value|values|worth|price|prices|price guide|pricing|cost|how much|appraisal|appraise|fmv|sold for)\b/],
  ["investment_rarity", /\b(investment|invest|investing|investor|rare|rarest|rarity|most valuable|expensive|census|low print|scarce|holy grail|grails?)\b/],
  ["identification", /\b(identify|identification|how to tell|how to know|reprint|first print|1st print|second print|newsstand|direct edition|variant|error|misprint|barcode|price variant|what is my|which edition|edition)\b/],
  ["grading", /\b(grading|grade|graded|grader|cgc|cbcs|pgx|slab|slabbed|slabs|encapsulat\w*|pressing|press|restoration|restored|9\.[0-9]|10\.0|signature series|label|scale)\b/],
  ["collecting", /\b(collect|collecting|collection|collector|collectors|collectible|collectibles|key issues?|keys|run|complete set|storage|bags and boards|checklist|golden age|silver age|bronze age|copper age|modern age)\b/],
];

export type IntentResult = { intent: Intent; specific: SpecificIntent[]; brand: string | null; basis: string };

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9.#' ]+/g, " ").replace(/\s+/g, " ").trim()} `;

export function classifyIntent(phrase: string, provider?: string | null): IntentResult {
  const p = norm(phrase);
  const text = p.trim();
  const specific = SPECIFIC.filter(([, re]) => re.test(text)).map(([name]) => name);
  const brand = BRAND_TERMS.find((b) => p.includes(` ${b} `)) ?? null;

  if (brand || (BRAND_NAV.test(text) && /\b(cgc|cbcs|pgx)\b/.test(text))) {
    return { intent: "navigational", specific, brand, basis: brand ? `names another site (“${brand}”)` : "looks for a grader's own tool or account page" };
  }
  if (TRANSACTIONAL.test(text)) {
    const selling = /\b(sell|selling)\b/.test(text) && !/\b(buy|for sale|shop|store)\b/.test(text);
    return { intent: "transactional", specific: selling || specific.includes("buying") ? specific : ["buying", ...specific], brand, basis: selling ? "the searcher wants to sell" : "contains a buying term" };
  }
  const question = INFORMATIONAL.test(text);
  const commercial = COMMERCIAL.test(text) || (text.search(GRADED_PRODUCT) >= 0 && ABOUT_A_BOOK.test(text.replace(GRADED_PRODUCT, " ")));
  // "what is amazing spider-man 300 worth" is a question, but the answer is a price: commercial investigation.
  if (commercial && question && specific.some((s) => s === "price_value" || s === "comparison" || s === "investment_rarity")) return { intent: "commercial", specific, brand, basis: "a question about price, value or which to choose" };
  if (question) return { intent: "informational", specific, brand, basis: "phrased as a question or a lookup" };
  if (commercial) return { intent: "commercial", specific, brand, basis: "contains a product-research term (value, graded, best, vs…)" };

  const mapped = provider === "transactional" ? "transactional" : provider === "commercial" ? "commercial" : provider === "navigational" ? "navigational" : provider === "informational" ? "informational" : null;
  if (mapped) return { intent: mapped, specific, brand, basis: "no signal in the phrase; provider's label used" };
  // A bare title + issue number ("amazing spider-man 300") is someone looking at a specific book.
  if (/\b[a-z][a-z' -]+ #?\d{1,4}\b/.test(text)) return { intent: "commercial", specific, brand, basis: "a specific issue with no modifier" };
  return { intent: "informational", specific, brand, basis: "no signal; treated as informational" };
}

/** How much a visit with this intent is worth to a shop, 0–100. */
export function intentValue(r: IntentResult): number {
  if (r.intent === "navigational") return r.brand ? 5 : 15;
  if (r.intent === "transactional") return 100;
  if (r.intent === "commercial") return r.specific.includes("price_value") ? 75 : 82;
  // Informational: research that sits next to a purchase is worth more than trivia.
  if (r.specific.includes("price_value") || r.specific.includes("investment_rarity")) return 55;
  if (r.specific.includes("grading") || r.specific.includes("identification") || r.specific.includes("comparison")) return 45;
  if (r.specific.includes("first_appearance") || r.specific.includes("collecting")) return 40;
  return 25;
}
