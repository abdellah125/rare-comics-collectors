import type { Collection } from "@/lib/catalog/collections";

/**
 * Editorial copy for the collection landing pages. Keyed by the category slug
 * the seed creates; anything the admin adds later falls back to the generic
 * text (and to the category's own description when one is set).
 */
export type CollectionCopy = {
  /** One sentence, used in the meta description and the page lead. */
  summary: string;
  /** Paragraphs rendered below the grid. */
  body: string[];
};

const COPY: Record<string, CollectionCopy> = {
  "golden-age": {
    summary: "Golden Age comics from 1938 to 1956: the first superheroes, wartime covers and the pre-Code horror and crime books that started the hobby.",
    body: [
      "The Golden Age runs from Action Comics #1 in 1938 to the arrival of the Comics Code in the mid-1950s. Print runs were huge but survival rates were tiny — paper drives, cheap newsprint and decades in attics mean that even mid-grade copies of major keys are scarce, and the census for many books is measured in dozens rather than thousands.",
      "Because so few copies survive, condition works differently here than in later eras. A 4.0 Golden Age key is a serious book, page quality matters as much as the numeric grade, and restoration is common enough that we treat a blue Universal label as the baseline. Every Golden Age slab we list is checked against the grader's census, and raw copies are examined for colour touch, tear seals and trimming before they go on sale.",
    ],
  },
  "silver-age": {
    summary: "Silver Age comics from 1956 to 1970: Showcase #4, the Marvel Age first appearances and the DC revivals that define modern collecting.",
    body: [
      "The Silver Age opens with the Flash's return in Showcase #4 (1956) and ends around 1970. It is the era of the Fantastic Four, Spider-Man, the X-Men, the Avengers and the Justice League — the first appearances that anchor almost every serious collection and the books most often quoted in auction results.",
      "Silver Age keys trade in every grade, so the price curve is well documented and comparables are easy to find. We price against realised sales from the last twelve months, list the certification number on every slab, and note page quality and any label qualifiers so you know exactly where a copy sits in the census before you buy.",
    ],
  },
  "bronze-age": {
    summary: "Bronze Age comics from 1970 to 1985: Wolverine, the new X-Men, Punisher, Ghost Rider and the darker, socially aware books of the seventies.",
    body: [
      "The Bronze Age brought relevance and grit to the newsstand — drug stories, horror's return under a loosened Comics Code, and a wave of first appearances that now drive the market: Incredible Hulk #181, Giant-Size X-Men #1, Amazing Spider-Man #129 and Werewolf by Night #32 among them.",
      "Print runs were still large, so high grade is achievable but 9.6 and 9.8 copies carry a real premium over 9.0s. Many Bronze Age books were also stored carefully by the first generation of collectors, which is why pressing can add a grade point and why we pre-screen raw candidates before recommending a submission.",
    ],
  },
  "copper-age": {
    summary: "Copper Age comics from 1985 to 1991: Watchmen, The Dark Knight Returns, the independent boom and the last keys before the speculator crash.",
    body: [
      "The Copper Age is the bridge between newsstand comics and the direct market. Prestige formats, creator-owned independents and mature-readers lines changed what a comic could be, and books such as Watchmen #1, Batman: The Dark Knight Returns #1 and the early Teenage Mutant Ninja Turtles issues remain the era's headline keys.",
      "Copper Age books were printed on better paper and bought by collectors from day one, so the market is concentrated in high grade. We focus on 9.6 and 9.8 copies with white pages and on the early independents, where small print runs make even mid-grade copies genuinely hard to find.",
    ],
  },
  "modern-age": {
    summary: "Modern Age comics from 1992 onward: Image founders, variant covers and the first appearances that have become blue-chip 9.8s.",
    body: [
      "The Modern Age starts with the Image founders in 1992 and continues today. It is the most liquid part of the market: first appearances that are later adapted to film and television move quickly, and variant covers with tiny print ratios can outperform books forty years older.",
      "Modern books are collected almost exclusively in 9.8, so grade is everything. A 9.6 of the same issue often trades at a fraction of the 9.8 price. Every modern slab we list is a recent, unaltered holder with a verified certification number, and we flag newsstand editions and low-ratio variants separately.",
    ],
  },
  "raw-books": {
    summary: "Raw, ungraded comic books graded in-house with every defect photographed and disclosed — ideal for reading copies, pressing candidates and submissions.",
    body: [
      "A raw book is one that has never been encapsulated, or has been cracked out of its holder. We grade every raw copy in-house on the standard 10-point scale and photograph the defects we see, so you can judge the book the way a grader would before it ever reaches a submission form.",
      "Raw books are the most flexible way to collect: read them, press and submit them through our grading service, or keep them as they are. If you disagree with our assessment after inspecting a book, return it within the inspection window for a full refund.",
    ],
  },
  "sets-and-lots": {
    summary: "Complete runs, mini-series sets and multi-book lots priced below the sum of their parts.",
    body: [
      "Sets and lots bundle related books into a single listing: a complete mini-series, a run of consecutive issues, or a curated group from one title or creator. Each book in a lot is graded individually and the condition of every copy is listed.",
      "Lots are the fastest way to build a run or fill gaps, and they are priced as a group so you pay less than you would buying the same issues one at a time. Shipping is charged once for the whole lot and every book is packed individually.",
    ],
  },
};

const GENERIC: CollectionCopy = {
  summary: "Graded and raw comic books in this collection, cert-verified and priced against realised sales.",
  body: [
    "Every slabbed book in this collection is a genuine CGC or CBCS holder whose certification number is checked against the grader's census before listing. Raw books are graded in-house with defects photographed and disclosed.",
    "Orders ship double-boxed, signature-required and insured to full value, and you have an inspection window after delivery to return any book in its original holder for a full refund.",
  ],
};

export function collectionCopy(collection: Pick<Collection, "slug" | "description">): CollectionCopy {
  const base = COPY[collection.slug] ?? GENERIC;
  return collection.description?.trim() ? { ...base, summary: collection.description.trim() } : base;
}
