/**
 * Title parser for HipComic listing titles. A HipComic search scrape carries no structured
 * fields, so everything a listing needs (series, issue, grade, year, publisher, label, page
 * quality, certification number) has to come out of the seller's free-text title.
 *
 * The rule throughout: a field is only filled when the title states it (or, for the publisher,
 * when the series is one of the unambiguous flagship runs in SERIES_PUBLISHERS). Anything the
 * title does not say stays null and the importer holds the row back instead of guessing.
 */

export const CGC_GRADES = {
  "10.0": "Gem Mint", "9.9": "Mint", "9.8": "Near Mint/Mint", "9.6": "Near Mint+", "9.4": "Near Mint", "9.2": "Near Mint-",
  "9.0": "Very Fine/Near Mint", "8.5": "Very Fine+", "8.0": "Very Fine", "7.5": "Very Fine-", "7.0": "Fine/Very Fine",
  "6.5": "Fine+", "6.0": "Fine", "5.5": "Fine-", "5.0": "Very Good/Fine", "4.5": "Very Good+", "4.0": "Very Good",
  "3.5": "Very Good-", "3.0": "Good/Very Good", "2.5": "Good+", "2.0": "Good", "1.8": "Good-", "1.5": "Fair/Good",
  "1.0": "Fair", "0.5": "Poor",
};

/** Site eras (src/lib/catalog/collection-copy.ts): Golden 1938–55, Silver 1956–69, Bronze 1970–84, Copper 1985–91, Modern 1992+. */
export function eraForYear(year) {
  if (year < 1938) return null;
  if (year < 1956) return "Golden Age";
  if (year < 1970) return "Silver Age";
  if (year < 1985) return "Bronze Age";
  if (year < 1992) return "Copper Age";
  return "Modern Age";
}
const ERA_RANGE = { "Golden Age": [1938, 1955], "Silver Age": [1956, 1969], "Bronze Age": [1970, 1984], "Copper Age": [1985, 1991], "Modern Age": [1992, 2100] };

/**
 * Publisher names as the site already spells them, matched only OUTSIDE the series title.
 * Words that are also people or characters (Archie Goodwin, Michael Avon Oeming, Dell'Otto,
 * Harvey Kurtzman, "1st Captain Marvel") only count with "Comics" after them, next to the
 * year, or as a segment of their own; see publishersIn().
 */
const NAME_LIKE = new Set(["Archie Comics", "Avon Periodicals", "Harvey Comics", "Dell Comics", "Quality Comics", "Atlas Comics", "Warren Publishing", "Eclipse Comics", "Titan Comics", "Image Comics", "Ablaze", "Valiant Comics"]);
const PUBLISHER_PATTERNS = [
  [/(?<!\b(?:captain|capt\.?|ms\.?|miss|mary|kid|1st|first|original|new|of|vs\.?)\s)\bmarvel\b(?!\s*(?:family|girl|boy|man\b|universe|age\b|zombies|knights|legacy|now))/i, "Marvel Comics"],
  [/\bd\.?c\.?(?: comics)?\b/i, "DC Comics"],
  [/\btimely\b/i, "Timely Comics"],
  [/\batlas\b/i, "Atlas Comics"],
  [/\bimage\b/i, "Image Comics"],
  [/\bdark horse\b/i, "Dark Horse Comics"],
  [/\bidw\b/i, "IDW Publishing"],
  [/\bboom!?(?: studios)?\b/i, "Boom! Studios"],
  [/\btop cow\b/i, "Top Cow"],
  [/\bmirage\b/i, "Mirage Studios"],
  [/\bfawcett\b/i, "Fawcett Publications"],
  [/\bfiction house\b/i, "Fiction House"],
  [/\bharvey\b/i, "Harvey Comics"],
  [/\bcharlton\b/i, "Charlton Comics"],
  [/\bavon\b/i, "Avon Periodicals"],
  [/\bcentaur\b/i, "Centaur Publications"],
  [/\bdell\b/i, "Dell Comics"],
  [/\bgold key\b/i, "Gold Key Comics"],
  [/\bquality(?: comics)?\b/i, "Quality Comics"],
  [/\barchie\b/i, "Archie Comics"],
  [/\bvaliant\b/i, "Valiant Comics"],
  [/\bbongo\b/i, "Bongo Comics"],
  [/\bdynamite\b/i, "Dynamite Entertainment"],
  [/\bzenescope\b/i, "Zenescope Entertainment"],
  [/\bwarren\b/i, "Warren Publishing"],
  [/\bmlj\b/i, "MLJ Magazines"],
  [/\baftershock\b/i, "AfterShock Comics"],
  [/\bvertigo\b/i, "DC Comics"],
  [/\bbetter pub(?:\.|lications)?\b/i, "Better Publications"],
  [/\bnedor\b/i, "Nedor Comics"],
  [/\blev gleason\b/i, "Lev Gleason Publications"],
  [/\bfox(?: feature| features| comics)\b/i, "Fox Feature Syndicate"],
  [/\bst\.? john\b/i, "St. John Publications"],
  [/\bziff[- ]davis\b/i, "Ziff-Davis"],
  [/\bstandard comics\b/i, "Standard Comics"],
  [/\beclipse\b/i, "Eclipse Comics"],
  [/\bcounterpoint\b/i, "Counterpoint Comics"],
  [/\btitan\b/i, "Titan Comics"],
  [/\boni press\b/i, "Oni Press"],
  [/\bablaze\b/i, "Ablaze"],
];
// "EC" and "Quality" style words are too ambiguous in free text; EC is only taken from "EC Comics".
PUBLISHER_PATTERNS.push([/\bec comics\b/i, "EC Comics"]);

const M = "Marvel Comics";
const D = "DC Comics";
/**
 * Flagship series whose publisher is not in doubt, keyed by the normalised series name.
 * A value is a publisher or a list of [fromYear, toYear, publisher] ranges for names that
 * changed hands or were reused (the row then needs a year inside one of the ranges).
 */
export const SERIES_PUBLISHERS = {
  // Marvel
  "amazing spider-man": M, "spectacular spider-man": M, "peter parker the spectacular spider-man": M, "web of spider-man": M,
  "spider-man": M, "ultimate spider-man": M, "superior spider-man": M, "spider-gwen": M, "edge of spider-verse": M, "spider-woman": M,
  "miles morales spider-man": M, "ultimate fallout": M, "amazing fantasy": [[1961, 2100, M]], "venom": M, "venom lethal protector": M, "carnage": M,
  "x-men": M, "uncanny x-men": M, "giant-size x-men": M, "new mutants": M, "x-factor": M, "x-force": M, "x-23": M, "wolverine": M,
  "wolverine limited series": M, "cable": M, "gambit": M, "deadpool": M, "excalibur": M, "alpha flight": M, "generation x": M,
  "incredible hulk": M, "hulk": M, "immortal hulk": M, "she-hulk": M, "savage she-hulk": M, "sensational she-hulk": M,
  "avengers": M, "west coast avengers": M, "new avengers": M, "mighty avengers": M, "young avengers": M, "fantastic four": M,
  "iron man": M, "invincible iron man": M, "thor": M, "mighty thor": M, "captain america": [[1968, 2100, M]], "silver surfer": M,
  "daredevil": [[1964, 2100, M]], "journey into mystery": [[1962, 2100, M]], "tales of suspense": [[1962, 1968, M]],
  "tales to astonish": [[1962, 1968, M]], "strange tales": [[1962, 2100, M]], "sub-mariner": [[1968, 2100, M]],
  "ghost rider": [[1967, 2100, M]], "moon knight": M, "punisher": M, "punisher war journal": M, "defenders": M, "nova": M,
  "marvel super heroes secret wars": M, "secret wars": M, "secret wars ii": M, "infinity gauntlet": M, "infinity war": M, "thanos": M,
  "thanos quest": M, "warlock": M, "captain marvel": [[1968, 2100, M]], "ms. marvel": M, "inhumans": M, "eternals": M,
  "black panther": M, "doctor strange": M, "power man": M, "power man and iron fist": M, "iron fist": M, "luke cage hero for hire": M,
  "hero for hire": M, "marvel team-up": M, "marvel two-in-one": M, "marvel spotlight": M, "marvel premiere": M, "marvel super-heroes": M,
  "werewolf by night": M, "tomb of dracula": M, "howard the duck": M, "what if": M, "what if?": M, "micronauts": [[1979, 1986, M]],
  "rom": [[1979, 1986, M]], "transformers": [[1984, 1991, M]], "g.i. joe a real american hero": [[1982, 1994, M]],
  "conan the barbarian": [[1970, 1993, M]], "savage sword of conan": [[1974, 1995, M]], "star wars": [[1977, 1986, M], [2015, 2100, M]],
  "guardians of the galaxy": M, "strange academy": M, "marvels": M, "new warriors": M, "darkhawk": M, "sleepwalker": M,
  "marvel comics presents": M, "marvel tales": [[1964, 2100, M]], "sgt. fury and his howling commandos": M, "sgt. fury": M,
  "master of kung fu": M, "special marvel edition": M, "marvel feature": M, "astonishing tales": M, "amazing adventures": [[1961, 2100, M]],
  "captain america annual": M, "amazing spider-man annual": M, "fantastic four annual": M, "x-men annual": M, "avengers annual": M,
  "sub-mariner annual": M, "incredible hulk annual": M, "thor annual": M, "iron man annual": M, "daredevil annual": M,
  // DC
  "batman": D, "detective comics": D, "superman": D, "action comics": D, "wonder woman": D, "flash": [[1959, 2100, D]], "the flash": [[1959, 2100, D]],
  "green lantern": D, "justice league of america": D, "justice league": D, "jla": D, "aquaman": D, "swamp thing": D,
  "saga of the swamp thing": D, "teen titans": D, "new teen titans": D, "harley quinn": D, "superboy": D, "adventure comics": D,
  "all star comics": D, "all-star comics": D, "all-american comics": D, "sensation comics": D, "world's finest comics": D, "world's finest": D,
  "brave and the bold": D, "showcase": D, "house of secrets": D, "house of mystery": D, "watchmen": D, "batman adventures": D,
  "batman the dark knight returns": D, "dark knight returns": D, "batman the killing joke": D, "nightwing": D, "robin": D, "catwoman": D,
  "legion of super-heroes": D, "firestorm": D, "fury of firestorm": D, "omega men": D, "crisis on infinite earths": D, "hellblazer": D,
  "preacher": D, "superman's pal jimmy olsen": D, "superman's girl friend lois lane": D, "dc comics presents": D, "doom patrol": D,
  "hawkman": D, "atom": D, "mystery in space": D, "strange adventures": D, "green arrow": D, "supergirl": D, "batgirl": D, "joker": D,
  "all-star batman": D, "all star batman": D, "star spangled comics": D, "more fun comics": D, "sandman": [[1974, 2100, D]],
  "batman annual": D, "superman annual": D, "our army at war": D, "g.i. combat": [[1957, 2100, D]], "weird war tales": D, "jonah hex": D,
  "new gods": D, "mister miracle": D, "forever people": D, "kamandi": D, "demon": D, "shazam": D, "shazam!": D, "lobo": [[1990, 2100, D]],
  // Image and others
  "spawn": "Image Comics", "walking dead": "Image Comics", "invincible": "Image Comics", "savage dragon": "Image Comics", "saga": "Image Comics",
  "department of truth": "Image Comics", "something is killing the children": "Boom! Studios", "hellboy": "Dark Horse Comics",
  "teenage mutant ninja turtles": [[1984, 1993, "Mirage Studios"], [2011, 2100, "IDW Publishing"]], "futurama": "Bongo Comics",
  "grimm fairy tales": "Zenescope Entertainment", "vampirella": [[1969, 1983, "Warren Publishing"]], "creepy": [[1964, 1983, "Warren Publishing"]],
  "eerie": [[1966, 1983, "Warren Publishing"]], "gargoyles": [[2022, 2100, "Dynamite Entertainment"]],
  // Long tail seen in the HipComic scrapes (only names that belong to one publisher)
  "longshot": M, "vision and the scarlet witch": M, "marauders": M, "immortal x-men": M, "silk": M, "blood hunt": M, "shogun warriors": M,
  "venom separation anxiety": M, "avengers arena": M, "astonishing x-men": M, "scarlet witch": M, "king in black": M, "onslaught reborn": M,
  "sinister war": M, "kitty pryde and wolverine": M, "marc spector moon knight": M, "vengeance of the moon knight": M, "moon knight annual": M,
  "dark avengers": M, "secret invasion": M, "a.x.e. judgment day": M, "a.x.e judgment day": M, "devil's reign omega": M, "new fantastic four": M,
  "world war hulk": M, "spider-man india": M, "thor god of thunder": M, "wolverine revenge": M, "rocket raccoon": M, "power pack": M,
  "extreme carnage alpha": M, "extreme carnage omega": M, "extreme carnage agony": M, "extreme carnage phage": M, "extreme carnage scream": M,
  "extreme carnage riot": M, "extreme carnage lasher": M, "extreme carnage toxin": M, "sins of sinister": M, "mary jane and black cat": M,
  "united states of captain america": M, "doctor strange sorcerer supreme": M, "fallen son the death of captain america": M, "civil war": M,
  "civil war ii": M, "deadpool kills the marvel universe": M, "spider-man and his amazing friends": M, "further adventures of indiana jones": M,
  "star wars return of the jedi": M, "x-men adventures": M, "spider-man adventures": M, "house of x": M, "powers of x": M,
  "alien": [[2021, 2100, M]], "predator vs wolverine": M, "aliens vs avengers": M, "a-team": M, "rawhide kid": [[1960, 2100, M]],
  "all winners comics": [[1941, 1946, "Timely Comics"]], "marvel mystery comics": [[1939, 1949, "Timely Comics"]], "captain america comics": [[1941, 1949, "Timely Comics"]],
  "spider-man annual": M, "spider-man 2099": M, "x-men 2099": M, "secret war": M, "onslaught unleashed": M, "america chavez made in the usa": M,
  "mighty avengers": M, "new x-men": M, "x-men red": M, "x-men gold": M, "x-men blue": M, "wolverine origins": M, "ultimate x-men": M, "ultimates": M,
  "thunderbolts": M, "runaways": M, "nyx": M, "young avengers presents": M, "hawkeye": M, "black widow": M, "black cat": [[2019, 2100, M]], "elektra": M,
  "daredevil the man without fear": M, "punisher war zone": M, "punisher limited series": M, "ghost rider 2099": M, "morbius the living vampire": M,
  "morbius": M, "blade": M, "spider-man 2099 exodus": M, "miles morales": M, "spider-verse": M, "spider-geddon": M, "gwenpool": M,
  "unbelievable gwenpool": M, "deadpool and wolverine wwiii": M, "wolverine and the x-men": M, "x-men legacy": M, "x-men unlimited": M,
  "batman and the joker the deadly duo": D, "batman/superman": D, "superman/batman": D, "batman the long halloween": D, "dark crisis": D,
  "poison ivy": D, "batman vs. robin": D, "batman vs robin": D, "infinite frontier": D, "black lightning": D, "captain atom": [[1987, 2100, D]],
  "suicide squad": D, "naomi": D, "future state wonder woman": D, "harley quinn 30th anniversary special": D, "absolute batman": D,
  "absolute superman": D, "absolute wonder woman": D, "batman the dark knight": D, "earth 2": D, "new titans": D, "new teen titans annual": D,
  "huntress": D, "all-star squadron": D, "batman adventures mad love": D, "superman adventures": D, "joker the man who stopped laughing": D,
  "justice league vs godzilla vs kong": D, "books of magic": D, "batman and robin adventures": D, "world of krypton": D,
  "flash comics": [[1940, 1949, D]], "wonder girl": D, "batman special": D, "batman in darkest knight": D, "batman/lobo": D, "batman beyond": D,
  "batman and robin": D, "batman white knight": D, "batman damned": D, "batman who laughs": D, "dceased": D, "dark nights metal": D,
  "dark nights death metal": D, "doomsday clock": D, "flashpoint": D, "blackest night": D, "identity crisis": D, "kingdom come": D,
  "superman the man of steel": D, "adventures of superman": D, "man of steel": D, "superman's pal jimmy olsen": D, "green lantern corps": D,
  "tales of the teen titans": D, "justice society of america": D, "jsa": D, "v for vendetta": D, "y the last man": D, "fables": D,
  "king spawn": "Image Comics", "gunslinger spawn": "Image Comics", "scorched": "Image Comics", "nocterra": "Image Comics", "eight billion genies": "Image Comics",
  "ice cream man": "Image Comics", "paper girls": "Image Comics", "wytches": "Image Comics", "thief of thieves": "Image Comics",
  "mirka andolfo's sweet paprika": "Image Comics", "wildc.a.t.s": [[1992, 1998, "Image Comics"]], "youngblood": [[1992, 1996, "Image Comics"]],
  "witchblade": [[1995, 2015, "Top Cow"]], "darkness": [[1996, 2013, "Top Cow"]], "house of slaughter": "Boom! Studios", "brzrkr": "Boom! Studios",
  "mighty morphin power rangers": [[2016, 2100, "Boom! Studios"]], "mighty morphin": [[2020, 2100, "Boom! Studios"]],
  "star wars dark empire": "Dark Horse Comics", "star wars dark empire ii": "Dark Horse Comics", "star wars knights of the old republic": "Dark Horse Comics",
  "predator": [[1989, 2019, "Dark Horse Comics"]], "x-o manowar": [[1992, 1996, "Valiant Comics"]], "harbinger": [[1992, 1995, "Valiant Comics"]],
  "red sonja": [[1975, 1986, M], [2005, 2100, "Dynamite Entertainment"]], "four color": [[1939, 1962, "Dell Comics"]],
  "archie": [[1946, 2100, "Archie Comics"]], "archie comics": [[1946, 2100, "Archie Comics"]], "shock suspenstories": "EC Comics",
  "crime suspenstories": "EC Comics", "weird science": [[1950, 1953, "EC Comics"]], "tales from the crypt": [[1950, 1955, "EC Comics"]],
  "vault of horror": [[1950, 1955, "EC Comics"]], "haunt of fear": [[1950, 1954, "EC Comics"]], "weird fantasy": [[1950, 1953, "EC Comics"]],
  "whiz comics": "Fawcett Publications", "captain marvel adventures": "Fawcett Publications", "marvel family": "Fawcett Publications",
  "planet comics": "Fiction House", "jumbo comics": "Fiction House", "jungle comics": "Fiction House", "wings comics": "Fiction House",
  "fight comics": "Fiction House", "rangers comics": "Fiction House",
};

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to", "vs", "vs.", "with"]);
const UPPER = new Set(["dc", "jla", "jsa", "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "tmnt", "usa", "u.s.", "g.i.", "gi", "tv", "nyx", "ufo", "wwii", "cgc", "cbcs", "ss", "jsa", "rri", "ltd", "nycc", "sdcc", "c2e2", "fcbd", "b&w", "3d", "x-o", "m.o.d.o.k.", "modok", "s.h.i.e.l.d.", "shield", "oa", "a.i.m.", "l.b.", "lb", "ec", "idw", "nm", "vf", "fn", "vg", "gd"]);
const FIXES = [
  [/\bspider[- ]?man\b/gi, "Spider-Man"], [/\bx[- ]?men\b/gi, "X-Men"], [/\bsub[- ]?mariner\b/gi, "Sub-Mariner"], [/\bx[- ]?factor\b/gi, "X-Factor"],
  [/\bx[- ]?force\b/gi, "X-Force"], [/\bshe[- ]?hulk\b/gi, "She-Hulk"], [/\bspider[- ]?woman\b/gi, "Spider-Woman"], [/\bspider[- ]?gwen\b/gi, "Spider-Gwen"],
];

const isShouting = (s) => { const letters = s.replace(/[^A-Za-z]/g, ""); return letters.length >= 4 && letters === letters.toUpperCase(); };
const capWord = (w) => w.replace(/^([("'\[]*)([a-z])/, (m, p, c) => p + c.toUpperCase());

/** Title case for ALL-CAPS text; mixed-case text only gets stray lowercase words capitalised. */
export function tidyCase(text) {
  const shouting = isShouting(text);
  const words = text.split(/\s+/).filter(Boolean);
  const out = words.map((w, i) => {
    const bare = w.toLowerCase().replace(/^[("'\[]+|[)"'\],.:;!]+$/g, "");
    if (UPPER.has(bare)) return w.toUpperCase();
    if (shouting || (isShouting(w) && w.replace(/[^A-Za-z]/g, "").length > 3)) {
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(bare)) return lower;
      return lower.split("-").map((part) => capWord(part)).join("-").replace(/(^|[^a-z])mc([a-z])/g, (m, a, c) => `${a}Mc${c.toUpperCase()}`);
    }
    // "Vengeance Of The Moon Knight" → "of the", but "Batman: The Killing Joke" keeps its capital.
    if (i > 0 && SMALL.has(bare) && !/[:.!?]$/.test(words[i - 1]) && /^[A-Za-z][a-z.]*$/.test(w)) return w.toLowerCase();
    return /^[a-z]/.test(w) && w.length > 3 ? capWord(w) : w;
  });
  let s = out.join(" ");
  s = s.replace(/^([a-z])/, (c) => c.toUpperCase());
  for (const [re, to] of FIXES) s = s.replace(re, to);
  return s;
}

/** Publishers a free-text fragment names, with the context rules for name-like words. */
function publishersIn(text) {
  const found = new Set();
  const segments = text.split(/\s+-\s+|--+|[|•*()\/,;¦]|\s-|-\s/).map((x) => x.trim()).filter(Boolean);
  for (const [re, name] of PUBLISHER_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    if (!NAME_LIKE.has(name)) { found.add(name); continue; }
    const after = text.slice(m.index + m[0].length);
    const before = text.slice(0, m.index);
    const own = segments.some((seg) => new RegExp(`^(?:${re.source})(?:\\s+(?:comics?|publications?|pub\\.?|periodicals))?$`, "i").test(seg));
    if (own || /^\s+(?:comics|publications?|periodicals|file copy)\b/i.test(after) || /^\s*(?:19|20)\d\d\b/.test(after) || /\b(?:19|20)\d\d\s*$/.test(before)) found.add(name);
  }
  return [...found];
}

export const normSeries = (s) => s.toLowerCase().replace(/^the\s+/, "").replace(/[:,]/g, " ").replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();

const PAGE_QUALITY = [
  [/\b(?:cream|cr|c)\s*(?:-|\/|to)\s*(?:ow|off[- ]?white)\b(?:\s*pages?)?/i, "Cream to off-white pages"],
  [/\b(?:ow|off[- ]?white)\s*(?:-|\/|to)?\s*(?:w|wh|wp|white)\b(?:\s*pages?)?|\bowwp\b|\bow\/?w\b|\bw\/ow\b/i, "Off-white to white pages"],
  [/\boff[- ]?white(?:\s*pages?)?\b|\bow\b(?:\s*pages?)?/i, "Off-white pages"],
  [/\bwhite\s*pages?\b|\bwp\b|\bwhite pgs?\b/i, "White pages"],
];

/** Marketing filler and census claims that are not facts about the book (or can go stale). */
const FILLER = [
  /\bhighest(?: cgc)?(?: graded| rated)?(?: cgc)?(?: certified)?(?: copy)?\b/gi, /\bcensus\s*=?\s*\d+\b/gi, /\btop grade!*\b/gi, /\bgorgeous(?: slab)?\b/gi,
  /\bwow\b!*/gi, /\bl@@k\b/gi, /\bhot\b!+/gi, /\bmint!+/gi, /\b(?:super |very |extremely )?rarer?\b!*/gi, /\bhtf\b/gi, /\bhard to find\b/gi, /\bcomic book\b/gi, /\bcomics? books?\b/gi,
  /\bextra rich color strike\b/gi, /\b(?:new )?(?:movie|show|film|tv series|series)s? coming(?: soon)?\b!*/gi, /\bcoming soon\b!*/gi, /\binvest(?:ment)?\b!*/gi,
  /\bkey issue\b/gi, /\[key issue\]/gi, /\bkey\b(?=\s+1st)/gi, /\bgraded\b/gi, /\bcomic\b(?!s|[- ]?con)/gi, /\bslab(?:bed)?\b/gi, /\bbeautiful\b/gi, /\bnice\b/gi, /\bsharp\b/gi,
  /\bscarce\b!*/gi, /\bmarvel boarder\b/gi, /\bhigh grade\b/gi, /\bw\/coa\b/gi, /\b\d{8,}\b/g,
  // Letter grades repeat the numeric grade ("CGC 6.0 FN"); the number is what the listing shows.
  /(?<![A-Za-z\/])(?:NM\/?MT?|NM|VF\/NM|VF|FN\/VF|FN|VG\/FN|VG|GD\/VG|GD|FR|PR|MT)[+-]?(?![A-Za-z\/])/g,
];

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * @returns {{ series: string|null, issue: string|null, year: number|null, era: string|null, grader: string|null, grade: string|null,
 *   label: string|null, pageQuality: string|null, certNumber: string|null, publisher: string|null, notes: string|null,
 *   signed: boolean, truncated: boolean, holds: string[] }}
 */
export function parseTitle(raw, { seller = "" } = {}) {
  const holds = [];
  let t = String(raw ?? "");
  // Broken scraper/template text such as "{product.Pubilcation_Year} {product.Publisher" (closed or not).
  t = t.replace(/\{[^{}]*\}/g, " ").replace(/\{[^{}]*$/g, " ");
  t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  t = t.replace(/\b(CGC|CBCS|PGX)([\s(:-]*(?:SS\s*)?)(\d)\s*[.,]\s*(\d)(?!\d)/gi, "$1$2$3.$4"); // "CGC 9. 8", "CGC 8,0"
  t = t.replace(/\b(?:NT|NOT)\s+\d\.\d\b/gi, " ").replace(/\(\s*\d+\s*x\s*\d\.\d\s*\)/gi, " "); // "NOT 9.8", "(1x 9.8)" census asides
  const truncated = /(\.\.\.|…)\s*$/.test(t);
  if (truncated) t = t.replace(/\s*\S*(\.\.\.|…)\s*$/, "");

  // Certification number: CGC numbers are 10 digits (7 + 3), sellers append them to the title.
  let certNumber = null;
  const cert = t.match(/(?:^|[\s\-–—])(\d{7})-?(\d{3})\s*$/);
  if (cert) { certNumber = cert[1] + cert[2]; t = t.slice(0, cert.index).trim(); }
  // AtlantaClassicComics ends every title with an internal stock code (JH6, JM1, JH44…).
  if (/^atlantaclassiccomics$/i.test(seller)) t = t.replace(/\s+[A-Z]{2}\d{1,3}\s*$/, "");
  t = t.replace(/[\s\-–—|•*]+$/g, "").trim();

  // Lots and sets do not fit a one-slab listing (several issues, often several grades).
  const hashes = [...t.matchAll(/#\s*(\d+)/g)].map((m) => m[1]);
  if (/#\s*\d+\s*(?:-|–|—|to|thru|&|,)\s*#?\s*\d+\b/i.test(t) || /\b(?:lot of|complete (?:set|run|series)|full set|set of|\d+\s*(?:book|comic|issue)s?\s+lot|lot)\b/i.test(t) || new Set(hashes).size >= 3 || /(?:\b\d{1,3}\s+){3,}\d{1,3}\b/.test(t.replace(/\b(19|20)\d\d\b/g, ""))) holds.push("lot or multi-issue set");

  // Grader and grade.
  const graderMatch = t.match(/\b(CGC|CBCS|PGX)\b/i);
  const grader = graderMatch ? graderMatch[1].toUpperCase() : null;
  if (!grader) holds.push("no grading company in the title");
  const normGrade = (g) => { const n = g === "10" ? "10.0" : g; return CGC_GRADES[n] ? n : null; };
  let grade = null;
  const gradeWords = "(?:\\W*(?:graded|grade|universal|certified|ss|sig(?:nature)?(?:\\s*series)?|signature\\s*series|nm\\/?m?t?|mt|vf\\/?nm|vf|fn|vg|gd|label|blue))*";
  const after = t.match(new RegExp(`\\b(?:CGC|CBCS|PGX)${gradeWords}\\W{0,3}(10(?:\\.0)?|\\d\\.\\d)(?!\\d)`, "i"));
  const before = t.match(/(?<![\d.#])(10\.0|\d\.\d)\W{0,3}(?:graded\W*)?(?:CGC|CBCS|PGX)\b/i);
  let gradeSpan = null;
  if (after && normGrade(after[1])) { grade = normGrade(after[1]); gradeSpan = after; }
  else if (before && normGrade(before[1])) { grade = normGrade(before[1]); gradeSpan = before; }
  const allGrades = new Set([...t.replace(/#\s*\d+(?:\.\d+)?/g, " ").matchAll(/(?<![\d.$:\/])(10\.0|\d\.\d)(?![\d\/])/g)].map((m) => normGrade(m[1])).filter(Boolean));
  if (!grade && allGrades.size === 1) grade = [...allGrades][0];
  if (!grade) holds.push("no numeric grade in the title");
  else if (allGrades.size > 1) holds.push("more than one grade in the title");

  // Work on a copy with the grade phrase blanked so its digits are not read as issue or year.
  let w = t;
  if (gradeSpan) w = w.slice(0, gradeSpan.index) + " ¦ " + w.slice(gradeSpan.index + gradeSpan[0].length);
  w = w.replace(/\b(?:CGC|CBCS|PGX)\b/gi, " ¦ ");
  if (grade && !gradeSpan) w = w.replace(new RegExp(`(?<![\\d.])${grade.replace(".", "\\.")}(?!\\d)`), " ¦ ");

  // Year: "(1961)", a bare 1930–2029 number, or a cover date such as "(DC 10/60)".
  let year = null;
  const years = [...w.matchAll(/(?<![#\d\/:-])\b(19[3-9]\d|20[0-2]\d)\b(?![\/\d])/g)].map((m) => ({ y: Number(m[1]), i: m.index, paren: w[m.index - 1] === "(" && w[m.index + 4] === ")" }));
  const distinct = [...new Set(years.map((y) => y.y))];
  if (distinct.length === 1) year = distinct[0];
  else if (distinct.length > 1) {
    const paren = [...new Set(years.filter((y) => y.paren).map((y) => y.y))];
    if (paren.length === 1) year = paren[0];
    else holds.push("more than one year in the title");
  }
  const coverDate = w.match(/\(\s*[A-Za-z .!]*?\s*(\d{1,2})\/(\d{2})\s*\)/);
  if (year === null && coverDate && Number(coverDate[1]) >= 1 && Number(coverDate[1]) <= 12) {
    const yy = Number(coverDate[2]);
    if (yy >= 30) year = 1900 + yy; else if (yy <= 26) year = 2000 + yy;
  }
  if (year !== null && year > 2026) { year = null; }

  // Issue and series.
  let issue = null;
  let series = null;
  const head = (s) => s.replace(/¦/g, " ").replace(/\(\s*(?:19|20)\d\d\s*\)/g, " ").replace(/\b(?:19[3-9]\d|20[0-2]\d)\b\s*$/, " ").replace(/^[\s\-–—:;,.]+|[\s\-–—:;,.(]+$/g, "").replace(/\s+/g, " ").trim();
  let volume = null;
  const vol = w.match(/#\s*v(?:ol\.?)?\s*(\d{1,2})\s+#?\s*(?=\d|nn\b)/i);
  if (vol) { volume = vol[1]; w = `${w.slice(0, vol.index)}# ${w.slice(vol.index + vol[0].length)}`; }
  const hash = w.match(/#\s*(-1|1\/2|nn\b|\d{1,4}(?:\.\d{1,2})?[A-Za-z]?)(?![\d])/i) ?? w.match(/\b(?:No\.?|Number)\s*(\d{1,4})\b/i);
  let rest = w;
  if (hash) {
    issue = /^nn$/i.test(hash[1]) ? "nn" : `#${hash[1].replace(/^0+(?=\d)/, "")}`;
    series = head(w.slice(0, hash.index));
    rest = w.slice(hash.index + hash[0].length);
  } else {
    // "FANTASTIC FOUR 9 CGC 6.5 …", "Captain Marvel 5 (2024), …": a bare number straight after the series name.
    const graderAt = w.indexOf("¦");
    const bare = (graderAt > 0 ? w.slice(0, graderAt) : w).match(/^([^\d#¦(]+?)(?:\s*\(\s*(?:19|20)\d\d\s*\))?\s+(\d{1,3})(?=\s|,|\(|-|$)/);
    if (bare && !/\b(?:vol|volume|book|part|no)\.?$/i.test(bare[1])) {
      issue = `#${bare[2].replace(/^0+(?=\d)/, "")}`;
      series = head(bare[1]);
      rest = w.slice(bare[0].length);
    }
  }
  if (!issue) holds.push("no issue number in the title");

  // Publisher named as a prefix of the series ("DC COMICS WONDER WOMAN #204").
  let publisher = null;
  if (series) {
    const prefix = series.match(/^(marvel comics|dc comics|image comics|dark horse comics|idw publishing|boom!? studios)\b[\s:–-]*/i);
    if (prefix && series.length > prefix[0].length + 2) {
      publisher = PUBLISHER_PATTERNS.find(([re]) => re.test(prefix[1]))?.[1] ?? null;
      series = series.slice(prefix[0].length).trim();
    }
    series = series.replace(/\s*:\s*/g, ": ").replace(/\s+/g, " ").replace(/^the\s+(?=\S)/i, (m) => m).trim();
    series = tidyCase(series).replace(/\s+\?$/, "?");
    if (series.length < 2 || series.length > 90) { holds.push("series title could not be read"); }
  }

  // Page quality.
  let pageQuality = null;
  for (const [re, name] of PAGE_QUALITY) {
    const m = rest.match(re);
    if (m) { pageQuality = name; rest = rest.replace(re, " ¦ "); break; }
  }

  // Label. Only what the title states: SS / Signature Series, restored, qualified. A signature
  // mentioned without the label type is recorded as `signed` and left for a human to confirm.
  const signed = /\b(?:signed|signature|autograph(?:ed)?|remark(?:ed)?)\b/i.test(t) || /\bSS\b/.test(t);
  let label = "Universal Blue";
  if (/\bSS\b|\bsignature series\b|\bsig(?:\.|nature)? series\b|\bcgc sig\b|\byellow label\b/i.test(t)) label = "Signature Series (Yellow)";
  else if (/\brestored\b|\brestoration\b|\bpurple label\b|\bconserved\b/i.test(t)) label = /\bconserved\b/i.test(t) ? null : "Restored (Purple)";
  else if (/\bqualified\b|\bgreen label\b/i.test(t)) label = "Qualified (Green)";
  else if (signed) label = null;
  if (label === null) holds.push("signed or conserved book without a stated label type");

  // Publisher named in the rest of the title, else the flagship-series table.
  if (!publisher) {
    const unique = publishersIn(rest);
    if (unique.length === 1) publisher = unique[0];
    else if (unique.length > 1) holds.push("more than one publisher named in the title");
  }
  let era = null;
  const statedEra = t.match(/\b(golden|silver|bronze|copper|modern) age\b/i);
  if (year !== null) era = eraForYear(year);
  else if (statedEra) era = `${statedEra[1][0].toUpperCase()}${statedEra[1].slice(1).toLowerCase()} Age`;
  if (!publisher && series) {
    const key = normSeries(series).replace(/\bgi joe\b/, "g.i. joe").replace(/\s+facsimile(?: edition)?$/, "");
    const entry = SERIES_PUBLISHERS[key] ?? (/^marvel(?:'s)? (?!family|mystery|boy)/.test(key) ? M : /^dc (?!versus|vs)/.test(key) ? D : undefined);
    if (typeof entry === "string") publisher = entry;
    else if (Array.isArray(entry)) {
      const range = year !== null ? [year, year] : era ? ERA_RANGE[era] : null;
      if (range) { const hit = entry.filter(([from, to]) => range[0] >= from && range[1] <= to); if (hit.length === 1) publisher = hit[0][2]; }
    }
  }
  if (!publisher) holds.push("publisher not stated and not determinable from the series");
  // The catalogue stores a publication year for every listing, so a stated era alone is not enough.
  if (year === null) holds.push("no publication year in the title");
  if (year !== null && !era) holds.push("published before 1938 (no matching era category)");

  // Notes: what is left, minus parsed tokens, publisher words, filler and marketing claims.
  let notes = rest.replace(/\(\s*(?:19|20)\d\d\s*\)/g, " ¦ ").replace(/(?<![#\d\/:-])\b(?:19[3-9]\d|20[0-2]\d)\b(?![\/\d])/g, " ¦ ");
  notes = notes.replace(new RegExp(`\\b(?:${MONTHS})\\b\\.?(?=\\s*¦)`, "gi"), " ").replace(/\(\s*[A-Za-z .!]*?\s*\d{1,2}\/\d{2}\s*\)/g, " ¦ ");
  notes = notes.replace(/\b(?:golden|silver|bronze|copper|modern) age\b/gi, " ¦ ").replace(/\bpages?\b/gi, (m, off, s) => (/¦\s*$/.test(s.slice(0, off)) ? " " : m));
  for (const re of FILLER) notes = notes.replace(re, " ");
  notes = notes.replace(/\bSS\b|\bsignature series\b|\bsig(?:\.|nature)? series\b/gi, " ¦ ").replace(/\buniversal(?: grade)?\b/gi, " ");
  notes = notes.replace(/\b(marvel|dc|image|timely|atlas)-(?=\S)/gi, "$1 ¦ ");
  notes = notes.replace(/[|•*]+|\/\/+/g, " ¦ ").replace(/\(\s*\)/g, " ").replace(/\s+!+/g, " ").replace(/\s*--+\s*/g, " ¦ ").replace(/\s+-\s+|\s+-(?=\S)|(?<=\S)-\s+/g, " ¦ ");
  // A publisher is dropped when it is a fragment of its own or leads/ends one ("Marvel Comic Book 1989 …"),
  // never from the middle of a sentence ("1st Arnold Drake story for DC").
  const publisherWord = new RegExp(`^(?:${PUBLISHER_PATTERNS.map(([re]) => re.source).join("|")})(?:\\s+(?:comics?|publications?|pub\\.?|periodicals|studios|vertigo|entertainment|publishing))*$`, "i");
  const trimPublisher = (p) => {
    const words = p.split(" ");
    for (let n = Math.min(3, words.length); n >= 1; n--) {
      if (publisherWord.test(words.slice(0, n).join(" "))) return words.slice(n).join(" ");
      if (words.length > n && publisherWord.test(words.slice(-n).join(" ")) && !/\b(?:for|by|from|at|of|to|and|&|vs\.?)$/i.test(words.slice(0, -n).join(" "))) return words.slice(0, -n).join(" ");
    }
    return p;
  };
  const clean = (p) => p.replace(/^[\s,.;:!\-–—)]+|[\s,.;:!\-–—(]+$/g, "").replace(/\s+/g, " ").trim();
  const parts = notes.split("¦").map((p) => clean(trimPublisher(clean(p)))).filter((p) => p.length > 2 && /[A-Za-z]{2}/.test(p));
  notes = parts.map((p) => tidyCase(p)).join("; ");
  if (notes.length > 160) notes = notes.slice(0, 160).replace(/[;,]?\s+\S*$/, "");
  notes = notes || null;

  return { series: series || null, issue, volume, year, era, grader, grade, label, pageQuality, certNumber, publisher, notes, signed, truncated, holds };
}
