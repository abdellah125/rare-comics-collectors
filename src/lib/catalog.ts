import type { Era, Grader, Product } from "./products";

// ─── types ───────────────────────────────────────────────────────────────────
export interface Seller { id: string; name: string; joinedAt: string; rating: number; salesCount: number; }
export interface Feedback { id: string; from: string; rating: 4 | 5; comment: string; date: string; }
export type CatalogProduct = Product & { sellerId: string; sellerName: string; sellerRating: number; feedback: Feedback[]; };

// ─── 25 sellers ──────────────────────────────────────────────────────────────
export const SELLERS: Seller[] = [
  { id:"s01", name:"GoldenAgeGuru",     joinedAt:"2016-04-12", rating:4.9, salesCount:847  },
  { id:"s02", name:"SilverStacker42",   joinedAt:"2017-09-03", rating:4.8, salesCount:634  },
  { id:"s03", name:"BronzeAgeBooks",    joinedAt:"2018-02-18", rating:4.9, salesCount:512  },
  { id:"s04", name:"KeyIssueKing",      joinedAt:"2015-11-07", rating:5.0, salesCount:1203 },
  { id:"s05", name:"CGCCollector",      joinedAt:"2019-06-25", rating:4.7, salesCount:389  },
  { id:"s06", name:"VaultOpener88",     joinedAt:"2020-01-14", rating:4.8, salesCount:267  },
  { id:"s07", name:"MarvelMaven",       joinedAt:"2017-07-30", rating:4.9, salesCount:723  },
  { id:"s08", name:"DCDeepDive",        joinedAt:"2018-05-22", rating:4.8, salesCount:445  },
  { id:"s09", name:"SlabCity",          joinedAt:"2016-12-10", rating:5.0, salesCount:998  },
  { id:"s10", name:"CopperAgeCrazy",    joinedAt:"2019-03-08", rating:4.7, salesCount:312  },
  { id:"s11", name:"ModernKeyHunter",   joinedAt:"2021-05-19", rating:4.9, salesCount:178  },
  { id:"s12", name:"TimleyComicsOnly",  joinedAt:"2015-08-03", rating:5.0, salesCount:567  },
  { id:"s13", name:"FirstAppFan",       joinedAt:"2017-02-28", rating:4.8, salesCount:834  },
  { id:"s14", name:"SlabGrader9x",      joinedAt:"2018-10-15", rating:4.9, salesCount:456  },
  { id:"s15", name:"FoundryVault",      joinedAt:"2020-07-04", rating:4.6, salesCount:189  },
  { id:"s16", name:"BatcaveBooks",      joinedAt:"2016-09-21", rating:4.9, salesCount:678  },
  { id:"s17", name:"AtomicAgeAlex",     joinedAt:"2019-11-30", rating:4.8, salesCount:234  },
  { id:"s18", name:"PriceGuidePatrick", joinedAt:"2015-04-17", rating:5.0, salesCount:1456 },
  { id:"s19", name:"HighGradeOnly",     joinedAt:"2021-02-09", rating:4.7, salesCount:145  },
  { id:"s20", name:"GradedAndSaled",    joinedAt:"2017-11-12", rating:4.8, salesCount:567  },
  { id:"s21", name:"KeyBookBob",        joinedAt:"2018-08-05", rating:4.9, salesCount:389  },
  { id:"s22", name:"ArchiveAmelia",     joinedAt:"2020-03-23", rating:4.8, salesCount:223  },
  { id:"s23", name:"WholesaleSlabs",    joinedAt:"2019-09-14", rating:4.7, salesCount:456  },
  { id:"s24", name:"DustjacketDave",    joinedAt:"2016-06-11", rating:5.0, salesCount:789  },
  { id:"s25", name:"RareFindsRachel",   joinedAt:"2021-08-27", rating:4.9, salesCount:123  },
];

// ─── feedback comment pool ───────────────────────────────────────────────────
const FC = [
  "Exactly as described — fast shipping, perfect packaging. Would buy again without hesitation!",
  "Phenomenal seller. Book arrived in superb condition. 5 stars all the way!",
  "Great communication and speedy delivery. The slab was well protected. Very happy!",
  "Best comic purchase I've made online. Honest grading and zero issues. Highly recommend.",
  "Fast, reliable, exactly what was listed. This seller is the real deal.",
  "Outstanding transaction from start to finish. Book exceeded my expectations!",
  "Arrived ahead of schedule. Double-boxed and bubble-wrapped. A+ seller!",
  "Grade matched perfectly. Love the book. Will definitely buy from again.",
  "Incredible deal, fast shipping. Communication was top-notch throughout!",
  "Trustworthy seller with a great eye for quality. Couldn't be happier.",
  "Shipped same day. Arrived perfectly. Condition matches the description 100%.",
  "Super smooth transaction. Would highly recommend to any collector!",
];

const BUYERS = [
  "comic_hunter_99","slab_addict","key_issue_pete","golden_age_fan","silver_slabs",
  "marvel_first_app","dc_collector","grade_chaser","vault_buyer","rare_books_fan",
  "slab_king_mark","key_book_lisa","bronze_baron","copper_queen","modern_mike",
  "first_print_only","cgc_lover","cbcs_collector","raw_reader","grade_9x",
];

// ─── title pool — [title, publisher, era, startYear, maxIssue, basePriceCents, palette] ─────
type T = [string, string, Era, number, number, number, [string, string]];
const TITLES: T[] = [
  // ── Golden Age ──
  ["Action Comics",          "DC Comics",         "Golden Age", 1938,  200, 3200000, ["#1e3a8a","#dc2626"]],
  ["Detective Comics",       "DC Comics",         "Golden Age", 1937,  200, 2800000, ["#1c1917","#eab308"]],
  ["Batman",                 "DC Comics",         "Golden Age", 1940,  120, 1800000, ["#111827","#fbbf24"]],
  ["Superman",               "DC Comics",         "Golden Age", 1939,  150, 2200000, ["#1d4ed8","#dc2626"]],
  ["Wonder Woman",           "DC Comics",         "Golden Age", 1942,  130, 1500000, ["#991b1b","#f59e0b"]],
  ["Flash Comics",           "DC Comics",         "Golden Age", 1940,  104, 1200000, ["#b91c1c","#fde047"]],
  ["All Star Comics",        "DC Comics",         "Golden Age", 1940,   57, 1600000, ["#991b1b","#f59e0b"]],
  ["World's Finest Comics",  "DC Comics",         "Golden Age", 1941,  100,  900000, ["#1e3a8a","#fbbf24"]],
  ["Sensation Comics",       "DC Comics",         "Golden Age", 1942,  109,  750000, ["#7f1d1d","#fde047"]],
  ["Captain America Comics", "Timely Comics",     "Golden Age", 1941,   74, 2000000, ["#dc2626","#1d4ed8"]],
  ["Sub-Mariner Comics",     "Timely Comics",     "Golden Age", 1941,   42,  800000, ["#1e40af","#34d399"]],
  ["Human Torch",            "Timely Comics",     "Golden Age", 1940,   38,  700000, ["#7f1d1d","#f97316"]],
  ["Captain Marvel Adventures","Fawcett Publications","Golden Age",1941,150, 600000, ["#dc2626","#facc15"]],
  ["Whiz Comics",            "Fawcett Publications","Golden Age",1940, 155, 500000, ["#dc2626","#facc15"]],
  ["Green Hornet",           "Harvey Comics",     "Golden Age", 1940,   47,  300000, ["#166534","#a3e635"]],
  ["Planet Comics",          "Fiction House",     "Golden Age", 1940,   73,  250000, ["#6b21a8","#f97316"]],
  ["Blue Beetle",            "Fox Comics",        "Golden Age", 1939,   60,  200000, ["#1d4ed8","#94a3b8"]],
  ["Military Comics",        "Quality Comics",    "Golden Age", 1941,   43,  180000, ["#14532d","#f5f5f4"]],
  ["Police Comics",          "Quality Comics",    "Golden Age", 1941,  102,  160000, ["#1e40af","#dc2626"]],
  ["All-American Comics",    "DC Comics",         "Golden Age", 1939,  102,  700000, ["#991b1b","#fde047"]],
  // ── Silver Age ──
  ["Showcase",               "DC Comics",         "Silver Age", 1956,   93,  850000, ["#1e3a8a","#9ca3af"]],
  ["Justice League",         "DC Comics",         "Silver Age", 1960,  261,  750000, ["#1d4ed8","#dc2626"]],
  ["Green Lantern",          "DC Comics",         "Silver Age", 1960,  224,  650000, ["#065f46","#a3e635"]],
  ["Flash",                  "DC Comics",         "Silver Age", 1959,  350,  700000, ["#991b1b","#fde047"]],
  ["Brave and the Bold",     "DC Comics",         "Silver Age", 1955,  200,  450000, ["#1e40af","#f59e0b"]],
  ["Teen Titans",            "DC Comics",         "Silver Age", 1966,   53,  350000, ["#dc2626","#1d4ed8"]],
  ["Hawkman",                "DC Comics",         "Silver Age", 1964,   27,  280000, ["#b45309","#fde047"]],
  ["Aquaman",                "DC Comics",         "Silver Age", 1962,   56,  250000, ["#1d4ed8","#f97316"]],
  ["Fantastic Four",         "Marvel Comics",     "Silver Age", 1961,  416,  900000, ["#1e40af","#ea580c"]],
  ["Amazing Spider-Man",     "Marvel Comics",     "Silver Age", 1963,  800, 1200000, ["#dc2626","#1d4ed8"]],
  ["X-Men",                  "Marvel Comics",     "Silver Age", 1963,  544,  950000, ["#ca8a04","#1e3a8a"]],
  ["Avengers",               "Marvel Comics",     "Silver Age", 1963,  503,  850000, ["#991b1b","#b45309"]],
  ["Incredible Hulk",        "Marvel Comics",     "Silver Age", 1962,  474,  800000, ["#166534","#7e22ce"]],
  ["Daredevil",              "Marvel Comics",     "Silver Age", 1964,  380,  550000, ["#dc2626","#fafaf9"]],
  ["Thor",                   "Marvel Comics",     "Silver Age", 1962,  502,  600000, ["#1d4ed8","#fde047"]],
  ["Silver Surfer",          "Marvel Comics",     "Silver Age", 1968,   18,  300000, ["#9ca3af","#1e3a8a"]],
  ["Captain Marvel",         "Marvel Comics",     "Silver Age", 1968,   62,  250000, ["#dc2626","#1d4ed8"]],
  ["Nick Fury SHIELD",       "Marvel Comics",     "Silver Age", 1968,   15,  200000, ["#1c1917","#dc2626"]],
  // ── Bronze Age ──
  ["Ghost Rider",            "Marvel Comics",     "Bronze Age", 1973,   81,  180000, ["#1c1917","#f97316"]],
  ["Tomb of Dracula",        "Marvel Comics",     "Bronze Age", 1972,   70,  150000, ["#1c1917","#7e22ce"]],
  ["Werewolf By Night",      "Marvel Comics",     "Bronze Age", 1972,   43,  120000, ["#1c1917","#6b21a8"]],
  ["Iron Fist",              "Marvel Comics",     "Bronze Age", 1975,   15,  200000, ["#ca8a04","#1c1917"]],
  ["Luke Cage Power Man",    "Marvel Comics",     "Bronze Age", 1972,  125,   90000, ["#ca8a04","#dc2626"]],
  ["Conan the Barbarian",    "Marvel Comics",     "Bronze Age", 1970,  275,   80000, ["#7f1d1d","#d97706"]],
  ["New Teen Titans",        "DC Comics",         "Bronze Age", 1980,   91,  250000, ["#dc2626","#1d4ed8"]],
  ["Swamp Thing",            "DC Comics",         "Bronze Age", 1972,   24,  180000, ["#166534","#fde047"]],
  ["House of Mystery",       "DC Comics",         "Bronze Age", 1970,  321,   50000, ["#1c1917","#6b21a8"]],
  ["Defenders",              "Marvel Comics",     "Bronze Age", 1972,  152,   70000, ["#1d4ed8","#dc2626"]],
  ["Spectacular Spider-Man", "Marvel Comics",     "Bronze Age", 1976,  263,   80000, ["#dc2626","#1d4ed8"]],
  ["What If",                "Marvel Comics",     "Bronze Age", 1977,   47,   60000, ["#1e40af","#f97316"]],
  ["Ms. Marvel",             "Marvel Comics",     "Bronze Age", 1977,   23,  150000, ["#dc2626","#1e3a8a"]],
  ["Nova",                   "Marvel Comics",     "Bronze Age", 1976,   25,  130000, ["#1d4ed8","#f97316"]],
  ["Spider-Woman",           "Marvel Comics",     "Bronze Age", 1978,   50,  100000, ["#7e22ce","#fde047"]],
  ["Micronauts",             "Marvel Comics",     "Bronze Age", 1979,   59,   75000, ["#1e40af","#f97316"]],
  ["Master of Kung Fu",      "Marvel Comics",     "Bronze Age", 1973,  125,   65000, ["#dc2626","#fde047"]],
  ["Machine Man",            "Marvel Comics",     "Bronze Age", 1978,   19,   60000, ["#9ca3af","#1e40af"]],
  ["ROM Spaceknight",        "Marvel Comics",     "Bronze Age", 1979,   75,   55000, ["#9ca3af","#dc2626"]],
  // ── Copper Age ──
  ["Crisis on Infinite Earths","DC Comics",       "Copper Age", 1985,   12,  250000, ["#1c1917","#dc2626"]],
  ["Watchmen",               "DC Comics",         "Copper Age", 1986,   12,  350000, ["#1c1917","#f5f5f4"]],
  ["Dark Knight Returns",    "DC Comics",         "Copper Age", 1986,    4,  300000, ["#1c1917","#fde047"]],
  ["New Mutants",            "Marvel Comics",     "Copper Age", 1983,  100,  150000, ["#ca8a04","#1e3a8a"]],
  ["X-Factor",               "Marvel Comics",     "Copper Age", 1986,  149,  100000, ["#1d4ed8","#fde047"]],
  ["Web of Spider-Man",      "Marvel Comics",     "Copper Age", 1985,  129,   75000, ["#dc2626","#1d4ed8"]],
  ["Secret Wars",            "Marvel Comics",     "Copper Age", 1984,   12,  200000, ["#1e40af","#dc2626"]],
  ["Swamp Thing Alan Moore", "DC Comics",         "Copper Age", 1983,   64,  200000, ["#166534","#fde047"]],
  ["Sandman",                "DC/Vertigo",        "Copper Age", 1989,   75,  300000, ["#1c1917","#9ca3af"]],
  ["Animal Man",             "DC Comics",         "Copper Age", 1988,   26,  150000, ["#f97316","#1c1917"]],
  ["TMNT",                   "Mirage Studios",    "Copper Age", 1984,   62,  350000, ["#166534","#f97316"]],
  ["Spawn",                  "Image Comics",      "Copper Age", 1992,  350,  400000, ["#1c1917","#dc2626"]],
  ["WildC.A.T.s",            "Image Comics",      "Copper Age", 1992,   50,  200000, ["#1e40af","#fde047"]],
  ["Youngblood",             "Image Comics",      "Copper Age", 1992,   41,  150000, ["#dc2626","#1e40af"]],
  ["Superman Man of Steel",  "DC Comics",         "Copper Age", 1986,  134,  120000, ["#1d4ed8","#dc2626"]],
  ["Justice League Intl",    "DC Comics",         "Copper Age", 1987,   60,  100000, ["#1d4ed8","#dc2626"]],
  ["Legion of Super-Heroes", "DC Comics",         "Copper Age", 1984,   63,  100000, ["#1d4ed8","#f97316"]],
  ["Alpha Flight",           "Marvel Comics",     "Copper Age", 1983,  130,  120000, ["#dc2626","#f5f5f4"]],
  ["Doom Patrol",            "DC Comics",         "Copper Age", 1987,   87,   90000, ["#1c1917","#9ca3af"]],
  ["Batman",                 "DC Comics",         "Copper Age", 1986,  713,  200000, ["#1c1917","#fde047"]],
  // ── Modern Age ──
  ["Preacher",               "DC/Vertigo",        "Modern Age", 1995,   66,  120000, ["#1c1917","#dc2626"]],
  ["Transmetropolitan",      "DC/Vertigo",        "Modern Age", 1997,   60,   80000, ["#1e40af","#f97316"]],
  ["Y The Last Man",         "DC/Vertigo",        "Modern Age", 2002,   60,  100000, ["#166534","#fde047"]],
  ["Fables",                 "DC/Vertigo",        "Modern Age", 2002,  150,  100000, ["#166534","#f97316"]],
  ["Ultimate Spider-Man",    "Marvel Comics",     "Modern Age", 2000,  160,  150000, ["#dc2626","#1d4ed8"]],
  ["Ultimates",              "Marvel Comics",     "Modern Age", 2002,   13,  120000, ["#1d4ed8","#dc2626"]],
  ["Astonishing X-Men",      "Marvel Comics",     "Modern Age", 2004,   68,  100000, ["#ca8a04","#1e3a8a"]],
  ["New Avengers",           "Marvel Comics",     "Modern Age", 2004,   64,   80000, ["#991b1b","#b45309"]],
  ["Walking Dead",           "Image Comics",      "Modern Age", 2003,  193,  200000, ["#1c1917","#dc2626"]],
  ["Invincible",             "Image Comics",      "Modern Age", 2003,  144,  150000, ["#1d4ed8","#f97316"]],
  ["Kingdom Come",           "DC Comics",         "Modern Age", 1996,    4,  200000, ["#1d4ed8","#dc2626"]],
  ["JLA",                    "DC Comics",         "Modern Age", 1997,  125,  100000, ["#1d4ed8","#dc2626"]],
  ["Planetary",              "DC/Wildstorm",      "Modern Age", 1999,   27,  120000, ["#1e40af","#f97316"]],
  ["Powers",                 "Image Comics",      "Modern Age", 2000,   37,   80000, ["#1c1917","#fde047"]],
  ["Civil War",              "Marvel Comics",     "Modern Age", 2006,    7,  100000, ["#1d4ed8","#dc2626"]],
  ["Annihilation",           "Marvel Comics",     "Modern Age", 2006,    6,   80000, ["#7e22ce","#f97316"]],
  ["Final Crisis",           "DC Comics",         "Modern Age", 2008,    7,   80000, ["#1c1917","#dc2626"]],
  ["Secret Invasion",        "Marvel Comics",     "Modern Age", 2008,    8,   80000, ["#166534","#dc2626"]],
  ["Blackest Night",         "DC Comics",         "Modern Age", 2009,    8,  100000, ["#1c1917","#6b21a8"]],
  ["Siege",                  "Marvel Comics",     "Modern Age", 2010,    4,   60000, ["#1e40af","#fde047"]],
];

// ─── grade pools per era ──────────────────────────────────────────────────────
const GRADES: Record<Era, string[]> = {
  "Golden Age": ["1.0","1.5","2.0","2.5","3.0","3.5","4.0","4.5","5.0","5.5","6.0","7.0","8.0"],
  "Silver Age": ["2.0","3.0","4.0","4.5","5.0","5.5","6.0","6.5","7.0","7.5","8.0","8.5","9.0","9.2"],
  "Bronze Age": ["3.0","4.0","5.0","6.0","7.0","7.5","8.0","8.5","9.0","9.2","9.4","9.6"],
  "Copper Age": ["5.0","6.0","7.0","8.0","8.5","9.0","9.2","9.4","9.6","9.8"],
  "Modern Age": ["7.0","8.0","9.0","9.2","9.4","9.6","9.8","9.8","10.0"],
};
const GRADER_POOL: Grader[] = ["CGC","CGC","CGC","CGC","CBCS","CBCS","Raw","Raw","Raw"];

// ─── deterministic RNG (xorshift32) ──────────────────────────────────────────
function xr(seed: number) {
  let s = (seed | 1) >>> 0;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function pick<A>(r: () => number, a: readonly A[]): A { return a[Math.floor(r() * a.length)]; }

function gradeMul(grade: string): number {
  const g = parseFloat(grade);
  if (g >= 9.8) return 7.5; if (g >= 9.4) return 4; if (g >= 9.0) return 2.2;
  if (g >= 8.0) return 1.4; if (g >= 6.0) return 0.9; if (g >= 4.0) return 0.55;
  if (g >= 2.0) return 0.3; return 0.18;
}

function makeProduct(idx: number): CatalogProduct {
  const r = xr(idx * 2654435769 + 1);
  const titleIdx = idx % TITLES.length;
  const issueBlock = Math.floor(idx / TITLES.length); // 0–14
  const [titleName, pub, era, startYear, maxIssue, basePrice, palette] = TITLES[titleIdx];
  const issueNum = Math.max(2, 1 + (issueBlock * Math.max(1, Math.floor(maxIssue / 15))));
  const grade = pick(r, GRADES[era]);
  const grader: Grader = pick(r, GRADER_POOL);
  const seller = SELLERS[idx % SELLERS.length];
  const priceVariance = 0.75 + r() * 0.5;
  const price = Math.max(500, Math.round(basePrice * gradeMul(grade) * priceVariance));
  const year = Math.min(2020, startYear + Math.floor(issueNum / 12));
  const rating = r() > 0.15 ? 5 : 4;
  const reviewCount = Math.floor(r() * 18) + 1;
  const fbCount = Math.floor(r() * 4) + 1;
  const titleSlug = titleName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const slug = `${titleSlug}-${issueNum}-c${idx}`;

  const feedback: Feedback[] = Array.from({ length: fbCount }, (_, fi) => {
    const fr = xr(idx * 100 + fi + 7);
    return {
      id: `fb-${idx}-${fi}`,
      from: pick(fr, BUYERS),
      rating: fr() > 0.18 ? 5 : 4,
      comment: pick(fr, FC),
      date: new Date(Date.now() - fr() * 730 * 86400000).toISOString().slice(0, 10),
    };
  });

  return {
    slug,
    title: titleName,
    issue: `#${issueNum}`,
    publisher: pub,
    year,
    era,
    grader,
    grade,
    label: grader === "Raw" ? "Ungraded" : "Universal Blue",
    price,
    sku: `CAT-${idx.toString(36).toUpperCase().padStart(4,"0")}`,
    stock: 1,
    creators: { writer: "Various", artist: "Various", cover: "Various" },
    summary: `${titleName} #${issueNum} — ${era} collectible. ${grader === "Raw" ? "Carefully graded raw copy." : `${grader} ${grade}.`}`,
    description: [
      `${titleName} #${issueNum} (${year}) from ${pub}. Published during the ${era}, this copy offers a great opportunity to add a classic to your collection.`,
      `${grader === "Raw" ? "Honestly graded raw copy with all defects photographed and disclosed." : `Professionally graded by ${grader} at ${grade} on the 10.0 scale.`}`,
    ],
    highlights: [`${era} issue`, `${pub}`, `${grader} ${grade}`, `Year: ${year}`],
    palette,
    rating,
    reviewCount,
    sellerId: seller.id,
    sellerName: seller.name,
    sellerRating: seller.rating,
    feedback,
  };
}

// ─── exports ─────────────────────────────────────────────────────────────────
export const catalog: CatalogProduct[] = Array.from({ length: 1500 }, (_, i) => makeProduct(i));

export function getCatalogProduct(slug: string): CatalogProduct | undefined {
  return catalog.find((p) => p.slug === slug);
}

export const catalogBySeller = (sellerId: string) => catalog.filter((p) => p.sellerId === sellerId);

