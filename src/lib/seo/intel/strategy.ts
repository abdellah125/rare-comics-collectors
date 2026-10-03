/**
 * Which page should target a keyword cluster. An existing page is always preferred to a new
 * one; a new URL is only recommended when nothing on the site can serve the cluster. Titles,
 * H1s and topic lists are templates for the writer: they contain no facts about any book.
 */
import { displayName, normPhrase, type Bucket, type Entity } from "@/lib/seo/intel/entities";
import type { Intent, SpecificIntent } from "@/lib/seo/intel/intent";

export const PAGE_TYPES = ["Product page", "Category page", "Collection page", "Buying guide", "Educational article", "Comparison article", "Comic character page", "Comic title page", "Issue guide", "FAQ", "Landing page"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export type SiteInventory = {
  /** published listings: normalised series, issue number, slug, display title */
  products: { series: string; issue: string; slug: string; label: string }[];
  /** published guides */
  articles: { slug: string; title: string; topic: string; tokens: Set<string> }[];
  collections: { slug: string; era: string }[];
  publishers: { slug: string; name: string }[];
  characters: { slug: string; name: string }[];
};

export type PagePlan = {
  pageType: PageType;
  recommendedUrl: string;
  /** true when the recommended URL already exists on the site */
  exists: boolean;
  title: string;
  h1: string;
  topics: string[];
  links: { label: string; url: string }[];
  note: string;
};

const slug = (s: string) => normPhrase(s).replace(/\./g, "-").replace(/\s+/g, "-").replace(/-+/g, "-");
const tokensOf = (s: string) => new Set(normPhrase(s).split(" ").filter((w) => w.length > 2 && !["the", "and", "for", "what", "how", "are", "does", "comic", "comics", "book", "books"].includes(w)).map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)));
export const articleTokens = tokensOf;

/** A published guide whose title shares most of the cluster's distinctive words. */
function matchingArticle(inv: SiteInventory, phrase: string, need = 0.6): SiteInventory["articles"][number] | null {
  const want = tokensOf(phrase);
  if (want.size === 0) return null;
  let best: { a: SiteInventory["articles"][number]; share: number } | null = null;
  for (const a of inv.articles) {
    let hit = 0;
    for (const t of want) if (a.tokens.has(t)) hit += 1;
    const share = hit / want.size;
    // On a tie the more specific (shorter) guide wins: "what is cgc" beats "cgc vs cbcs" for the query "cgc".
    if (share >= need && (!best || share > best.share || (share === best.share && a.tokens.size < best.a.tokens.size))) best = { a, share };
  }
  return best?.a ?? null;
}

/** The service pages the site already has (src/lib/services.ts), by the queries they answer. */
const SERVICES: [RegExp, string, string][] = [
  [/\b(apprais\w*|valuation|how much is my|how much are my|what is my|what are my|worth of my)\b/, "/services/appraisal-and-valuation", "Comic Book Appraisal and Valuation"],
  [/\b(sell|selling|consign\w*|broker\w*)\b/, "/services/consignment-and-brokerage", "Sell or Consign Your Comics"],
  [/\b(pressing|press|cleaning|clean)\b/, "/services/pressing-and-cleaning", "Comic Book Pressing and Cleaning"],
  [/\b(restoration|restored|trimmed|color touch)\b.*\b(check|detect\w*|service|test)\b/, "/services/restoration-detection", "Restoration Detection"],
  [/\b(grading service|grading cost|grading fees?|get .* graded|submit\w*|submission|where to get .* graded)\b/, "/services/grading-submission", "CGC and CBCS Grading Submission"],
];

const TOPICS: Partial<Record<SpecificIntent, string>> = {
  buying: "What is on sale now, with grade and price, and how buying a slab from the store works (shipping, returns, authenticity)",
  price_value: "What decides the price: grade, page quality, label type, and where to check recent sales",
  first_appearance: "Which character or event first appears, and in which panel or story",
  investment_rarity: "How scarce high-grade copies are (census figures with their date and source)",
  grading: "What CGC and CBCS look for on this book and how the grade changes the price",
  identification: "How to tell a first print from reprints, newsstand from direct, and known variants",
  comparison: "A side-by-side table and a plain recommendation for each kind of buyer",
  collecting: "Where the book sits in a collection: related keys and what to buy next",
};

export function planPage(args: { entity: Entity; bucket: Bucket; primary: string; intent: Intent; specifics: SpecificIntent[]; inventory: SiteInventory }): PagePlan {
  const { entity, bucket, primary, specifics, inventory: inv } = args;
  const topics = [...new Set(specifics)].map((s) => TOPICS[s]).filter((t): t is string => Boolean(t));
  const name = entity.label;
  const links: PagePlan["links"] = [];
  const base = { topics, links };

  switch (entity.type) {
    case "issue": {
      const copies = inv.products.filter((p) => p.series === entity.series && p.issue === entity.issue);
      for (const c of copies.slice(0, 6)) links.push({ label: c.label, url: `/store/${c.slug}` });
      const era = inv.collections[0] ? { label: "Browse by era", url: "/collections" } : null;
      if (era) links.push(era);
      // A guide about this exact issue: "<series>-<n>" in its slug with no further digit after it.
      const needle = `${slug(entity.series ?? "")}-${entity.issue}`;
      const guide = inv.articles.find((a) => a.slug === needle || a.slug.startsWith(`${needle}-`)) ?? null;
      if (guide) return { ...base, pageType: "Issue guide", recommendedUrl: `/guides/${guide.slug}`, exists: true, title: `${name}: Value, Key Facts and Copies for Sale`, h1: guide.title, note: copies.length ? `Existing guide. Link it to the ${copies.length} cop${copies.length === 1 ? "y" : "ies"} on sale and let the product pages target only their own grade.` : "Existing guide; nothing in stock to link to yet.", topics: topics.length ? topics : [TOPICS.price_value!, TOPICS.grading!] };
      if (copies.length === 1) return { ...base, pageType: "Product page", recommendedUrl: `/store/${copies[0].slug}`, exists: true, title: `${copies[0].label} for Sale`, h1: copies[0].label, note: "One copy in stock: its product page is the best target. Add the key facts and a value section to the description." };
      return { ...base, pageType: "Issue guide", recommendedUrl: `/guides/${slug(entity.series ?? "")}-${entity.issue}-value-and-key-facts`, exists: false, title: `${name}: Value, Key Facts and Graded Copies for Sale`, h1: `${name}: what it is worth and why it matters`, note: copies.length > 1 ? `${copies.length} product pages compete for this issue. One issue guide should own the keyword and link to each copy.` : "Not in stock: a guide can still rank and capture buyers for when a copy arrives.", topics: topics.length ? topics : [TOPICS.price_value!, TOPICS.grading!, TOPICS.first_appearance!] };
    }
    case "first_appearance": {
      const who = name.replace(/^First appearance of /, "");
      const url = `/guides/first-appearance-of-${slug(who)}`;
      const existing = inv.articles.find((a) => `/guides/${a.slug}` === url) ?? matchingArticle(inv, `first appearance ${who}`, 0.99);
      const character = inv.characters.find((c) => normPhrase(c.name) === normPhrase(who));
      if (character) links.push({ label: `${who} character page`, url: `/characters/${character.slug}` });
      return { ...base, pageType: "Educational article", recommendedUrl: existing ? `/guides/${existing.slug}` : url, exists: Boolean(existing), title: `First Appearance of ${who}: Issue, Date and Value`, h1: existing?.title ?? `What is the first appearance of ${who}?`, note: existing ? "Existing guide: answer in the first sentence, then link to copies of the key issue on sale." : "No guide yet for this first appearance.", topics: [TOPICS.first_appearance!, TOPICS.price_value!, ...topics.filter((t) => t !== TOPICS.first_appearance && t !== TOPICS.price_value)] };
    }
    case "era": {
      const era = entity.key.replace("era:", "");
      const collection = inv.collections.find((c) => c.era === era);
      if (bucket !== "learn" && collection) return { ...base, pageType: "Collection page", recommendedUrl: `/collections/${collection.slug}`, exists: true, title: `${displayName(era)} Comics for Sale: CGC and CBCS Graded`, h1: `${displayName(era)} comics for sale`, note: "Existing collection page: the buying keywords for this era belong here, not on a new page." };
      const guide = matchingArticle(inv, `${era} comics`, 0.99);
      return { ...base, pageType: "Educational article", recommendedUrl: guide ? `/guides/${guide.slug}` : `/guides/${slug(era)}-comics-guide`, exists: Boolean(guide), title: `${displayName(era)} Comics: Years, Key Issues and Values`, h1: guide?.title ?? `${displayName(era)} comics explained`, note: guide ? "Existing guide." : "No guide for this era yet.", links: collection ? [{ label: `${displayName(era)} comics on sale`, url: `/collections/${collection.slug}` }] : links };
    }
    case "series": {
      const stock = inv.products.filter((p) => p.series === entity.series);
      for (const c of stock.slice(0, 6)) links.push({ label: c.label, url: `/store/${c.slug}` });
      if (bucket === "buy") return { ...base, pageType: "Comic title page", recommendedUrl: `/titles/${slug(entity.series ?? name)}`, exists: false, title: `${name} Comics for Sale: Graded Key Issues`, h1: `${name} comics for sale`, note: `The site has no page per title: ${stock.length} listing${stock.length === 1 ? "" : "s"} of this series are only reachable through the store search. A title page would give these buying keywords a home.` };
      const guide = matchingArticle(inv, `${entity.series} ${bucket === "value" ? "value" : "key issues"}`, 0.99);
      return { ...base, pageType: bucket === "value" ? "Buying guide" : "Educational article", recommendedUrl: guide ? `/guides/${guide.slug}` : `/guides/${slug(entity.series ?? name)}-${bucket === "value" ? "comic-values" : "key-issues"}`, exists: Boolean(guide), title: bucket === "value" ? `${name} Comic Values: What the Key Issues Sell For` : `${name} Key Issues: The Books Collectors Look For`, h1: guide?.title ?? (bucket === "value" ? `What are ${name} comics worth?` : `${name} key issues`), note: guide ? "Existing guide." : "No guide for this title yet." };
    }
    case "character": {
      const who = name;
      const page = inv.characters.find((c) => normPhrase(c.name) === normPhrase(who));
      return { ...base, pageType: "Comic character page", recommendedUrl: page ? `/characters/${page.slug}` : `/characters/${slug(who)}`, exists: Boolean(page), title: `${who} Comics: First Appearance, Key Issues and Copies for Sale`, h1: `${who} comics`, note: page ? "Existing character page." : "No character page yet: it is created from guides tagged with the character." };
    }
    case "publisher": {
      const pub = inv.publishers.find((p) => normPhrase(p.name).startsWith(entity.key.replace("publisher:", "")));
      if (pub && bucket !== "learn") return { ...base, pageType: "Category page", recommendedUrl: `/publishers/${pub.slug}`, exists: true, title: `${name} for Sale: Graded and Key Issues`, h1: `${name} for sale`, note: "Existing publisher page." };
      const guide = matchingArticle(inv, primary, 0.7);
      return { ...base, pageType: "Educational article", recommendedUrl: guide ? `/guides/${guide.slug}` : `/guides/${slug(primary)}`, exists: Boolean(guide), title: `${name}: History and Key Issues`, h1: guide?.title ?? name, note: guide ? "Existing guide." : "No guide yet.", links: pub ? [{ label: `${name} on sale`, url: `/publishers/${pub.slug}` }] : links };
    }
    default: {
      const p = normPhrase(primary);
      const service = SERVICES.find(([re]) => re.test(p));
      if (service) return { ...base, pageType: "Landing page", recommendedUrl: service[1], exists: true, title: service[2], h1: service[2], note: "A services lead, not a buyer: the service page should answer it and offer the next step.", links: [{ label: "All services", url: "/services" }] };
      if (specifics.includes("comparison")) {
        const guide = matchingArticle(inv, primary, 0.7);
        return { ...base, pageType: "Comparison article", recommendedUrl: guide ? `/guides/${guide.slug}` : `/guides/${slug(primary)}`, exists: Boolean(guide), title: `${displayName(p)}: Which Should You Choose?`, h1: guide?.title ?? displayName(p), note: guide ? "Existing guide." : "No comparison on the site yet." };
      }
      if (bucket === "buy" && /\b(comic|comics|books?|graded|slabbed|slabs?|collectibles?)\b/.test(p)) {
        if (/\b(store|stores|dealer|dealers|shop|shops|near me|website|online)\b/.test(p)) return { ...base, pageType: "Landing page", recommendedUrl: "/", exists: true, title: "Rare and Graded Comic Books for Sale Online", h1: "Buy graded comics", note: "Store-level buying keywords belong to the home page.", links: [{ label: "Store", url: "/store" }] };
        return { ...base, pageType: "Category page", recommendedUrl: "/store", exists: true, title: "Graded Comic Books for Sale: CGC and CBCS", h1: "Graded comics for sale", note: "Catalogue-wide buying keywords belong to the store page.", links: [{ label: "Collections by era", url: "/collections" }, { label: "Publishers", url: "/publishers" }] };
      }
      const guide = matchingArticle(inv, primary, 0.7);
      if (/^(what|when|who|why|is|are|does|do|can|should)\b/.test(p) && p.split(" ").length <= 6 && !guide) return { ...base, pageType: "FAQ", recommendedUrl: "/faq", exists: true, title: displayName(p), h1: displayName(p), note: "A short question: answer it on the FAQ page (and in a guide if it deserves depth)." };
      return { ...base, pageType: bucket === "value" ? "Buying guide" : "Educational article", recommendedUrl: guide ? `/guides/${guide.slug}` : `/guides/${slug(primary)}`, exists: Boolean(guide), title: bucket === "value" ? `${displayName(p)}: A Collector's Price Guide` : displayName(p), h1: guide?.title ?? displayName(p), note: guide ? "Existing guide: expand it for the cluster's secondary keywords." : "No page covers this topic yet." };
    }
  }
}
