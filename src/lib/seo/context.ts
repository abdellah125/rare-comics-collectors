import "server-only";
import { db } from "@/lib/db";
import { publishedWhere } from "@/lib/catalog/products";
import { listCharacters } from "@/lib/guides/data";
import { parseJsonArray, isString } from "@/lib/json";
import { ERAS, normPhrase, type Catalog } from "@/lib/seo/intel/entities";
import { articleTokens, type SiteInventory } from "@/lib/seo/intel/strategy";
import { slugify } from "@/lib/validation";
// The flagship-series table the catalogue importer already maintains: the series people search for by name.
import { SERIES_PUBLISHERS } from "../../../scripts/lib/hipcomic-title.mjs";

/** Characters collectors search first appearances for; guides add to this list. */
const CHARACTERS = ["spider man", "batman", "superman", "wonder woman", "wolverine", "deadpool", "venom", "carnage", "hulk", "iron man", "captain america", "thor", "black panther", "silver surfer", "doctor strange", "daredevil", "punisher", "ghost rider", "moon knight", "blade", "black widow", "hawkeye", "ant man", "wasp", "vision", "scarlet witch", "thanos", "galactus", "doctor doom", "magneto", "storm", "cyclops", "jean grey", "rogue", "gambit", "cable", "nightcrawler", "kitty pryde", "x 23", "miles morales", "spider gwen", "gwen stacy", "green goblin", "hobgoblin", "mysterio", "kingpin", "elektra", "bullseye", "she hulk", "captain marvel", "ms marvel", "kamala khan", "nova", "adam warlock", "rocket raccoon", "groot", "star lord", "gamora", "harley quinn", "joker", "catwoman", "robin", "nightwing", "batgirl", "flash", "green lantern", "aquaman", "supergirl", "darkseid", "lobo", "swamp thing", "john constantine", "constantine", "spawn", "invincible", "teenage mutant ninja turtles", "hellboy", "the walking dead", "savage dragon", "x men", "avengers", "fantastic four", "justice league", "teen titans", "guardians of the galaxy", "inhumans", "eternals", "sub mariner", "namor", "luke cage", "iron fist", "shang chi", "kang", "ultron", "loki", "red skull", "winter soldier", "falcon", "war machine", "apocalypse", "sabretooth", "mystique", "bishop", "jubilee", "psylocke", "silk", "morbius", "kraven", "black cat", "sandman", "lizard", "rhino", "electro", "vulture", "doctor octopus", "bane", "riddler", "penguin", "two face", "poison ivy", "ras al ghul", "deathstroke", "doomsday", "brainiac", "lex luthor", "cyborg", "raven", "starfire", "beast boy", "booster gold", "blue beetle", "shazam", "black adam", "hawkman", "atom", "martian manhunter", "zatanna", "howard the duck", "man thing", "werewolf by night", "conan"];

const seriesOf = (title: string) => normPhrase(title.replace(/\([^)]*\)/g, " "));
const issueOf = (issue: string) => (/^#?(\d{1,4})$/.test(issue.trim()) ? String(Number(issue.trim().replace("#", ""))) : null);

export type SeoContext = { catalog: Catalog; inventory: SiteInventory };

/** What the site sells and publishes, in the shapes the keyword analysis needs. One set of queries per run. */
export async function buildContext(): Promise<SeoContext> {
  const [products, articles, categories, publishers, characters] = await Promise.all([
    db.product.findMany({ where: publishedWhere, select: { slug: true, title: true, issue: true, grader: true, grade: true, publisher: true } }),
    db.article.findMany({ where: { status: "published" }, select: { slug: true, title: true, topic: true, charactersJson: true, titlesJson: true } }),
    db.category.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
    db.product.groupBy({ by: ["publisher"], where: publishedWhere, _count: { _all: true } }),
    listCharacters().catch(() => []),
  ]);

  const stockedSeries = new Set<string>();
  const stockedIssues = new Set<string>();
  const invProducts: SiteInventory["products"] = [];
  for (const p of products) {
    const series = seriesOf(p.title);
    if (!series) continue;
    stockedSeries.add(series);
    const issue = issueOf(p.issue);
    if (issue) {
      stockedIssues.add(`${series}|${issue}`);
      invProducts.push({ series, issue, slug: p.slug, label: `${p.title} ${p.issue} ${p.grader} ${p.grade}` });
    }
  }
  const series = new Set<string>([...stockedSeries, ...Object.keys(SERIES_PUBLISHERS as Record<string, unknown>).map((s) => normPhrase(s))]);
  const characterSet = new Set<string>(CHARACTERS);
  for (const a of articles) {
    for (const t of parseJsonArray(a.titlesJson, isString)) series.add(seriesOf(t));
    for (const c of parseJsonArray(a.charactersJson, isString)) characterSet.add(normPhrase(c));
  }
  // One- and two-letter names and bare numbers would match everywhere.
  const cleanSeries = [...series].filter((s) => s.length >= 3 && !/^\d+$/.test(s));

  const catalog: Catalog = {
    series: cleanSeries,
    stockedSeries,
    stockedIssues,
    characters: [...characterSet].filter((c) => c.length >= 3),
    publishers: [...new Set(publishers.map((p) => normPhrase(p.publisher.replace(/\b(comics|publishing|publications|entertainment|studios|magazines|periodicals)\b/gi, ""))).filter((p) => p.length >= 2))],
  };
  const inventory: SiteInventory = {
    products: invProducts,
    articles: articles.map((a) => ({ slug: a.slug, title: a.title, topic: a.topic, tokens: articleTokens(`${a.title} ${a.slug.replace(/-/g, " ")}`) })),
    collections: categories.map((c) => ({ slug: c.slug, era: ERAS.find((e) => normPhrase(c.name).startsWith(e)) ?? "" })).filter((c) => c.era),
    publishers: publishers.map((p) => ({ slug: slugify(p.publisher), name: p.publisher })),
    characters: characters.map((c: { slug: string; name: string }) => ({ slug: c.slug, name: c.name })),
  };
  return { catalog, inventory };
}

/**
 * Candidate keywords drawn from the catalogue and the business's own topics, at no API cost.
 * They enter the system unmeasured ("discovered") and are hydrated with real metrics in
 * priority order, so the catalogue decides what gets researched.
 */
export function candidatePhrases(ctx: SeoContext): string[] {
  const out = new Set<string>();
  const issues = new Map<string, number>();
  for (const p of ctx.inventory.products) issues.set(`${p.series}|${p.issue}`, (issues.get(`${p.series}|${p.issue}`) ?? 0) + 1);
  for (const key of issues.keys()) {
    const [series, issue] = key.split("|");
    out.add(`${series} ${issue}`);
    out.add(`${series} ${issue} cgc`);
    out.add(`${series} ${issue} value`);
  }
  for (const s of ctx.catalog.stockedSeries) {
    out.add(`${s} comics for sale`);
    out.add(`${s} key issues`);
    out.add(`${s} comic value`);
    out.add(`${s} cgc`);
  }
  for (const era of ERAS) for (const t of [`${era} comics`, `${era} comics for sale`, `${era} key issues`, `most valuable ${era} comics`, `${era} comic book values`, `${era} marvel comics`, `${era} dc comics`]) out.add(t);
  for (const c of ctx.catalog.characters) out.add(`first appearance of ${c}`);
  for (const p of ctx.catalog.publishers) for (const t of [`${p} comics for sale`, `${p} key issues`, `rare ${p} comics`]) out.add(t);
  for (const t of TOPIC_SEEDS) out.add(t);
  return [...out].map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length >= 4 && p.length <= 80);
}

/** The business's own subject list (the owner's brief), phrased the way people search. */
export const TOPIC_SEEDS = [
  "comic books for sale", "rare comic books", "rare comic books for sale", "buy rare comics", "vintage comics", "vintage comic books for sale", "old comic books for sale", "collectible comics", "collectible comic books",
  "cgc graded comics", "cgc graded comics for sale", "cgc comics for sale", "buy cgc comics", "graded comics for sale", "buy graded comics", "buy graded comic books online", "slabbed comics for sale", "cbcs graded comics", "cbcs comics for sale", "cgc 9.8 comics for sale", "signature series comics for sale",
  "key issue comics", "key issue comics for sale", "comic book key issues", "first appearance comics", "first appearance comics for sale", "valuable comic books", "most valuable comic books", "most valuable comics", "rare comic issues", "rarest comic books",
  "comic book values", "comic book value guide", "comic book price guide", "comic book prices", "how much are my comics worth", "what are my comic books worth", "comic book appraisal", "free comic book appraisal", "sell comic books", "sell my comic collection", "comic book consignment",
  "comic collecting", "comic book collecting", "how to start collecting comics", "comic book investing", "comics as an investment", "best comics to invest in", "are graded comics a good investment",
  "comic auctions", "comic book auctions", "comic book dealers", "comic dealers", "comic book store online", "online comic book store", "comic book stores", "comic shop online",
  "cgc grading scale", "comic book grading", "comic grading scale", "how to get comics graded", "cgc vs cbcs", "cgc grading cost", "what does cgc stand for", "cgc signature series", "cgc label colors", "newsstand vs direct edition", "comic book pressing",
  "marvel comics for sale", "dc comics for sale", "marvel key issues", "dc key issues", "golden age comics", "silver age comics", "bronze age comics", "copper age comics", "modern age comics", "golden age comics for sale", "silver age comics for sale", "bronze age comics for sale",
];
