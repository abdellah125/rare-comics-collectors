/**
 * First-appearance facts for the characters the store and the guides refer to most.
 * Everything here is well documented and stable; keep it that way — an entry is
 * only added when the issue, cover date and creators are certain.
 */
export type CharacterFact = {
  name: string;
  slug: string;
  publisher: string;
  /** Title of the first (full) appearance and its issue */
  firstTitle: string;
  firstIssue: string;
  /** Cover date, e.g. "November 1974" */
  firstDate: string;
  creators: string;
  /** Extra context, e.g. an earlier cameo */
  note?: string;
};

export const CHARACTER_FACTS: CharacterFact[] = [
  { name: "Superman", slug: "superman", publisher: "DC Comics", firstTitle: "Action Comics", firstIssue: "#1", firstDate: "June 1938", creators: "Jerry Siegel and Joe Shuster" },
  { name: "Batman", slug: "batman", publisher: "DC Comics", firstTitle: "Detective Comics", firstIssue: "#27", firstDate: "May 1939", creators: "Bob Kane and Bill Finger" },
  { name: "Captain America", slug: "captain-america", publisher: "Timely Comics", firstTitle: "Captain America Comics", firstIssue: "#1", firstDate: "March 1941", creators: "Joe Simon and Jack Kirby" },
  { name: "Captain Marvel (Shazam)", slug: "captain-marvel-shazam", publisher: "Fawcett Publications", firstTitle: "Whiz Comics", firstIssue: "#2", firstDate: "February 1940", creators: "Bill Parker and C. C. Beck", note: "Numbered #2 on the cover; there is no regular Whiz Comics #1." },
  { name: "Wonder Woman", slug: "wonder-woman", publisher: "DC Comics", firstTitle: "All Star Comics", firstIssue: "#8", firstDate: "December 1941 – January 1942", creators: "William Moulton Marston and H. G. Peter" },
  { name: "Fantastic Four", slug: "fantastic-four", publisher: "Marvel Comics", firstTitle: "Fantastic Four", firstIssue: "#1", firstDate: "November 1961", creators: "Stan Lee and Jack Kirby" },
  { name: "Hulk", slug: "hulk", publisher: "Marvel Comics", firstTitle: "The Incredible Hulk", firstIssue: "#1", firstDate: "May 1962", creators: "Stan Lee and Jack Kirby" },
  { name: "Spider-Man", slug: "spider-man", publisher: "Marvel Comics", firstTitle: "Amazing Fantasy", firstIssue: "#15", firstDate: "August 1962", creators: "Stan Lee and Steve Ditko" },
  { name: "Thor", slug: "thor", publisher: "Marvel Comics", firstTitle: "Journey into Mystery", firstIssue: "#83", firstDate: "August 1962", creators: "Stan Lee, Larry Lieber and Jack Kirby" },
  { name: "Iron Man", slug: "iron-man", publisher: "Marvel Comics", firstTitle: "Tales of Suspense", firstIssue: "#39", firstDate: "March 1963", creators: "Stan Lee, Larry Lieber, Don Heck and Jack Kirby" },
  { name: "Doctor Strange", slug: "doctor-strange", publisher: "Marvel Comics", firstTitle: "Strange Tales", firstIssue: "#110", firstDate: "July 1963", creators: "Stan Lee and Steve Ditko" },
  { name: "X-Men", slug: "x-men", publisher: "Marvel Comics", firstTitle: "The X-Men", firstIssue: "#1", firstDate: "September 1963", creators: "Stan Lee and Jack Kirby", note: "Also the first appearance of Magneto." },
  { name: "Avengers", slug: "avengers", publisher: "Marvel Comics", firstTitle: "The Avengers", firstIssue: "#1", firstDate: "September 1963", creators: "Stan Lee and Jack Kirby" },
  { name: "Nick Fury", slug: "nick-fury", publisher: "Marvel Comics", firstTitle: "Sgt. Fury and His Howling Commandos", firstIssue: "#1", firstDate: "May 1963", creators: "Stan Lee and Jack Kirby", note: "His first appearance as Agent of S.H.I.E.L.D. is Strange Tales #135 (August 1965)." },
  { name: "Silver Surfer", slug: "silver-surfer", publisher: "Marvel Comics", firstTitle: "Fantastic Four", firstIssue: "#48", firstDate: "March 1966", creators: "Stan Lee and Jack Kirby", note: "His own series began with Silver Surfer #1 in August 1968." },
  { name: "Black Panther", slug: "black-panther", publisher: "Marvel Comics", firstTitle: "Fantastic Four", firstIssue: "#52", firstDate: "July 1966", creators: "Stan Lee and Jack Kirby" },
  { name: "Vision", slug: "vision", publisher: "Marvel Comics", firstTitle: "The Avengers", firstIssue: "#57", firstDate: "October 1968", creators: "Roy Thomas and John Buscema" },
  { name: "Mephisto", slug: "mephisto", publisher: "Marvel Comics", firstTitle: "Silver Surfer", firstIssue: "#3", firstDate: "December 1968", creators: "Stan Lee and John Buscema" },
  { name: "Morbius", slug: "morbius", publisher: "Marvel Comics", firstTitle: "The Amazing Spider-Man", firstIssue: "#101", firstDate: "October 1971", creators: "Roy Thomas and Gil Kane", note: "Amazing Spider-Man #102 tells his origin." },
  { name: "Ghost Rider", slug: "ghost-rider", publisher: "Marvel Comics", firstTitle: "Marvel Spotlight", firstIssue: "#5", firstDate: "August 1972", creators: "Roy Thomas, Gary Friedrich and Mike Ploog" },
  { name: "Blade", slug: "blade", publisher: "Marvel Comics", firstTitle: "The Tomb of Dracula", firstIssue: "#10", firstDate: "July 1973", creators: "Marv Wolfman and Gene Colan" },
  { name: "Punisher", slug: "punisher", publisher: "Marvel Comics", firstTitle: "The Amazing Spider-Man", firstIssue: "#129", firstDate: "February 1974", creators: "Gerry Conway, Ross Andru and John Romita Sr." },
  { name: "Wolverine", slug: "wolverine", publisher: "Marvel Comics", firstTitle: "The Incredible Hulk", firstIssue: "#181", firstDate: "November 1974", creators: "Len Wein, Herb Trimpe and John Romita Sr.", note: "A one-panel cameo on the last page of Incredible Hulk #180 (October 1974) precedes the first full appearance in #181." },
  { name: "Moon Knight", slug: "moon-knight", publisher: "Marvel Comics", firstTitle: "Werewolf by Night", firstIssue: "#32", firstDate: "August 1975", creators: "Doug Moench and Don Perlin" },
  { name: "Storm", slug: "storm", publisher: "Marvel Comics", firstTitle: "Giant-Size X-Men", firstIssue: "#1", firstDate: "May 1975", creators: "Len Wein and Dave Cockrum", note: "Nightcrawler, Colossus and Thunderbird debut in the same issue; X-Men #94 (August 1975) is the new team's first regular issue." },
  { name: "Nova", slug: "nova", publisher: "Marvel Comics", firstTitle: "Nova", firstIssue: "#1", firstDate: "September 1976", creators: "Marv Wolfman and John Buscema" },
  { name: "Phoenix", slug: "phoenix", publisher: "Marvel Comics", firstTitle: "The X-Men", firstIssue: "#101", firstDate: "October 1976", creators: "Chris Claremont and Dave Cockrum", note: "Jean Grey herself first appeared in X-Men #1 (1963); #101 is the first appearance of the Phoenix identity." },
  { name: "Kitty Pryde", slug: "kitty-pryde", publisher: "Marvel Comics", firstTitle: "The X-Men", firstIssue: "#129", firstDate: "January 1980", creators: "Chris Claremont and John Byrne", note: "Emma Frost (the White Queen) and Sebastian Shaw debut in the same issue." },
  { name: "She-Hulk", slug: "she-hulk", publisher: "Marvel Comics", firstTitle: "The Savage She-Hulk", firstIssue: "#1", firstDate: "February 1980", creators: "Stan Lee and John Buscema" },
  { name: "Teenage Mutant Ninja Turtles", slug: "teenage-mutant-ninja-turtles", publisher: "Mirage Studios", firstTitle: "Teenage Mutant Ninja Turtles", firstIssue: "#1", firstDate: "May 1984", creators: "Kevin Eastman and Peter Laird", note: "The first printing had a run of about 3,000 copies; later printings are common and clearly marked." },
  { name: "John Constantine", slug: "john-constantine", publisher: "DC Comics", firstTitle: "The Saga of the Swamp Thing", firstIssue: "#37", firstDate: "June 1985", creators: "Alan Moore, Stephen Bissette and John Totleben", note: "Brief background cameos in Saga of the Swamp Thing #25 precede the first full appearance." },
  { name: "Deadpool", slug: "deadpool", publisher: "Marvel Comics", firstTitle: "The New Mutants", firstIssue: "#98", firstDate: "February 1991", creators: "Fabian Nicieza and Rob Liefeld", note: "Gideon and Domino (Copycat) also debut in #98." },
  { name: "Harley Quinn", slug: "harley-quinn", publisher: "DC Comics", firstTitle: "The Batman Adventures", firstIssue: "#12", firstDate: "September 1993", creators: "Paul Dini and Bruce Timm", note: "She first appeared on television in the Batman: The Animated Series episode 'Joker's Favor' (September 1992) before her comic debut." },
  { name: "Riri Williams (Ironheart)", slug: "riri-williams", publisher: "Marvel Comics", firstTitle: "Invincible Iron Man", firstIssue: "#9", firstDate: "May 2016", creators: "Brian Michael Bendis and Mike Deodato", note: "A cameo in Invincible Iron Man #7 (March 2016) precedes the first full appearance in #9." },
];

export const characterFact = (nameOrSlug: string) => {
  const key = nameOrSlug.trim().toLowerCase();
  return CHARACTER_FACTS.find((c) => c.slug === key || c.name.toLowerCase() === key) ?? null;
};
