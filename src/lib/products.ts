export type Era = "Golden Age" | "Silver Age" | "Bronze Age" | "Copper Age" | "Modern Age";
export type Grader = "CGC" | "CBCS" | "Raw";

export type Product = {
  slug: string;
  title: string;
  issue: string;
  publisher: string;
  year: number;
  era: Era;
  grader: Grader;
  grade: string;
  label: string;
  certNumber?: string;
  /** price in cents */
  price: number;
  compareAt?: number;
  sku: string;
  stock: number;
  keyIssue?: string;
  creators: { writer: string; artist: string; cover: string };
  summary: string;
  description: string[];
  highlights: string[];
  palette: [string, string];
  featured?: boolean;
  bestseller?: boolean;
  rating: number;
  reviewCount: number;
  image?: string;
};

export const products: Product[] = [
  {
    slug: "action-comics-1-cgc-2-5",
    title: "Action Comics",
    issue: "#1",
    publisher: "DC Comics",
    year: 1938,
    era: "Golden Age",
    grader: "CGC",
    grade: "2.5",
    label: "Universal Blue",
    certNumber: "0920254001",
    price: 125000000,
    sku: "RCC-AC1-CGC25",
    stock: 1,
    keyIssue: "First appearance and origin of Superman",
    creators: { writer: "Jerry Siegel", artist: "Joe Shuster", cover: "Joe Shuster" },
    summary: "The most important comic book ever printed — Superman's world debut in a CGC 2.5 Good+ grade.",
    description: [
      "Action Comics #1 (June 1938) is the single most coveted comic book in the world. Jerry Siegel and Joe Shuster's creation — the Last Son of Krypton — changed popular culture forever, birthing the superhero genre itself.",
      "This CGC 2.5 copy presents with complete pages and readable story content, making it one of the most accessible entry points into true Action Comics #1 ownership. Fewer than 100 copies are believed to survive at any grade.",
      "CGC Universal Blue label certifies authenticity and completeness. Full provenance documentation and escrow service available on request.",
    ],
    highlights: [
      "First appearance and origin of Superman — created by Jerry Siegel & Joe Shuster",
      "Published June 1938 by Detective Comics, Inc. (later DC Comics)",
      "Widely considered the most valuable comic book in the world",
      "CGC 2.5 Good+ — complete pages, readable story, displayable copy",
    ],
    palette: ["#1e3a8a", "#dc2626"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 3,
    // local SVG cover generated per product — never 404s
    image: "/covers/action-comics-1-cgc-2-5.jpg",
  },
  {
    slug: "detective-comics-27-cgc-2-0",
    title: "Detective Comics",
    issue: "#27",
    publisher: "DC Comics",
    year: 1939,
    era: "Golden Age",
    grader: "CGC",
    grade: "2.0",
    label: "Universal Blue",
    certNumber: "0912387654",
    price: 75000000,
    sku: "RCC-DC27-CGC20",
    stock: 1,
    keyIssue: "First appearance of Batman (Bruce Wayne)",
    creators: { writer: "Bill Finger", artist: "Bob Kane", cover: "Bob Kane" },
    summary: "The Night of the Bat — Batman's world debut in Detective Comics #27, CGC 2.0 Good.",
    description: [
      "Detective Comics #27 (May 1939) introduced the world to Bruce Wayne — 'The Batman' — in a story scripted by Bill Finger and drawn by Bob Kane. Within two years Batman would headline his own title and anchor DC Comics for generations.",
      "This CGC 2.0 Good example is complete with all pages intact. The cover shows the iconic Batman silhouette in grey and blue against the night sky, a design that has endured for over 85 years.",
      "An exceptionally rare book: surviving copies number in the dozens. CGC Blue label certifies this as authentic and unrestored.",
    ],
    highlights: [
      "First appearance of Batman (Bruce Wayne) — created by Bob Kane & Bill Finger",
      "Published May 1939 — the dawn of the Bat-mythos",
      "Complete copy — all pages present and accounted for",
      "CGC 2.0 Good — unrestored, authentic, blue label certified",
    ],
    palette: ["#1c1917", "#eab308"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 2,
    // no confirmed public-domain image for this title — gradient fallback renders instead
  },
  {
    slug: "marvel-comics-1-cgc-4-0",
    title: "Marvel Comics",
    issue: "#1",
    publisher: "Timely Comics",
    year: 1939,
    era: "Golden Age",
    grader: "CGC",
    grade: "4.0",
    label: "Universal Blue",
    certNumber: "1004567890",
    price: 28500000,
    sku: "RCC-MC1-CGC40",
    stock: 1,
    keyIssue: "First appearance of the Human Torch (android) and Prince Namor the Sub-Mariner",
    creators: { writer: "Carl Burgos", artist: "Bill Everett", cover: "Frank R. Paul" },
    summary: "The book that started it all for Marvel — Timely Comics #1 with the original Human Torch and Namor.",
    description: [
      "Marvel Comics #1 (October 1939, cover-dated) launched Timely Comics — the company that would become Marvel. It introduced the original android Human Torch (Carl Burgos) and the savage undersea king Namor the Sub-Mariner (Bill Everett).",
      "This CGC 4.0 VG copy retains strong cover color and clear interior art. Its Frank R. Paul cover is one of the most recognisable in all of pulp and comics history.",
      "First printings of this issue are distinguished from the later second print. This copy has been verified as an original first print by CGC.",
    ],
    highlights: [
      "First appearance of the original Human Torch (android) — Carl Burgos",
      "First appearance of Prince Namor the Sub-Mariner — Bill Everett",
      "First issue of Timely Comics, forerunner of Marvel Comics",
      "CGC 4.0 VG — vibrant cover, blue label first print",
    ],
    palette: ["#7f1d1d", "#f97316"],
    featured: true,
    rating: 5,
    reviewCount: 2,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "superman-1-cgc-3-5",
    title: "Superman",
    issue: "#1",
    publisher: "DC Comics",
    year: 1939,
    era: "Golden Age",
    grader: "CGC",
    grade: "3.5",
    label: "Universal Blue",
    certNumber: "1008765432",
    price: 42500000,
    sku: "RCC-SUP1-CGC35",
    stock: 1,
    keyIssue: "First solo Superman title; reprints Superman's origin from Action Comics #1",
    creators: { writer: "Jerry Siegel", artist: "Joe Shuster", cover: "Joe Shuster" },
    summary: "Superman's first solo title — reprinting his origin alongside new adventures. CGC 3.5 VG−.",
    description: [
      "Superman #1 (Summer 1939) was the first comic book devoted entirely to a single superhero. It reprinted the origin story from Action Comics #1 and added new Siegel & Shuster material, cementing Superman as a cultural phenomenon.",
      "This CGC 3.5 Very Good− copy shows moderate wear consistent with Golden Age newsstand distribution; the cover image — Superman striding forward in full cape — remains clear and colourful.",
      "An important cornerstone book for any serious Golden Age collection. Blue label confirms unrestored status.",
    ],
    highlights: [
      "First solo Superman comic book — Summer 1939",
      "Reprints the origin from Action Comics #1 alongside new stories",
      "Siegel & Shuster art throughout — the definitive Golden Age team",
      "CGC 3.5 VG− — unrestored, blue label, displayable grade",
    ],
    palette: ["#1d4ed8", "#dc2626"],
    featured: true,
    rating: 5,
    reviewCount: 4,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "batman-1-cgc-4-5",
    title: "Batman",
    issue: "#1",
    publisher: "DC Comics",
    year: 1940,
    era: "Golden Age",
    grader: "CGC",
    grade: "4.5",
    label: "Universal Blue",
    certNumber: "1102233445",
    price: 19500000,
    sku: "RCC-BAT1-CGC45",
    stock: 1,
    keyIssue: "First appearances of the Joker and Catwoman",
    creators: { writer: "Bill Finger", artist: "Bob Kane", cover: "Bob Kane" },
    summary: "Batman's first solo title — introducing the Joker and Catwoman in one book. CGC 4.5 VG+.",
    description: [
      "Batman #1 (Spring 1940) is among the top-ten most valuable comics in existence. It introduces both the Joker — in two separate stories — and Selina Kyle (here called 'the Cat'), making it a landmark even within the Golden Age.",
      "This CGC 4.5 VG+ copy shows light wear with bright cover colours. The iconic Bob Kane cover featuring Batman and Robin against a yellow moon is vivid and striking at this grade.",
      "Both Joker stories ('The Joker' and 'The Joker Returns') appear here alongside Robin's early adventures. A truly irreplaceable piece of comics history.",
    ],
    highlights: [
      "First appearance of the Joker — two stories in a single issue",
      "First appearance of Catwoman (as 'the Cat')",
      "Batman's debut solo title — Spring 1940",
      "CGC 4.5 VG+ — bright cover, blue label, unrestored",
    ],
    palette: ["#111827", "#fbbf24"],
    featured: true,
    rating: 5,
    reviewCount: 3,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "captain-america-comics-1-cgc-6-0",
    title: "Captain America Comics",
    issue: "#1",
    publisher: "Timely Comics",
    year: 1941,
    era: "Golden Age",
    grader: "CGC",
    grade: "6.0",
    label: "Universal Blue",
    certNumber: "1203344556",
    price: 45000000,
    sku: "RCC-CAP1-CGC60",
    stock: 1,
    keyIssue: "First appearance of Captain America (Steve Rogers) and Bucky Barnes",
    creators: { writer: "Joe Simon", artist: "Jack Kirby", cover: "Jack Kirby" },
    summary: "Cap punches Hitler on the cover — one of the most iconic images in American pop culture. CGC 6.0 FN.",
    description: [
      "Captain America Comics #1 (March 1941) arrived nine months before Pearl Harbor. Joe Simon and Jack Kirby's wartime hero — Steve Rogers transformed by a super-soldier serum — became an immediate phenomenon, selling nearly one million copies on its first print run.",
      "The cover of Cap decking Adolf Hitler is one of the most audacious and celebrated images in all of comics. This CGC 6.0 Fine copy shows outstanding colour fidelity and crisp line work throughout.",
      "Also introduces Bucky Barnes as Cap's sidekick. A Kirby masterclass in dynamic composition from the very first page.",
    ],
    highlights: [
      "First appearance of Captain America (Steve Rogers) and Bucky Barnes",
      "Legendary Kirby cover — Cap punching Hitler, March 1941",
      "Published nine months before the United States entered World War II",
      "CGC 6.0 FN — exceptional colour, blue label, unrestored",
    ],
    palette: ["#dc2626", "#1d4ed8"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 5,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "all-star-comics-8-cgc-5-0",
    title: "All Star Comics",
    issue: "#8",
    publisher: "DC Comics",
    year: 1941,
    era: "Golden Age",
    grader: "CGC",
    grade: "5.0",
    label: "Universal Blue",
    certNumber: "1209988776",
    price: 38500000,
    sku: "RCC-ASC8-CGC50",
    stock: 1,
    keyIssue: "First appearance of Wonder Woman (Princess Diana)",
    creators: { writer: "William Moulton Marston", artist: "Harry G. Peter", cover: "Harry G. Peter" },
    summary: "The birth of Wonder Woman — the first female superhero to headline her own series. CGC 5.0 VG/FN.",
    description: [
      "All Star Comics #8 (Dec 1941/Jan 1942) introduced Princess Diana of Themyscira to the world. Created by psychologist William Moulton Marston and illustrated by H.G. Peter, Wonder Woman broke every convention of the era — a powerful female hero in a male-dominated genre.",
      "This CGC 5.0 VG/FN copy shows only moderate wear; the Harry Peter cover retains strong colour saturation. The interior 'Introducing Wonder Woman' story is complete and clearly readable.",
      "One of the three most important debut books in DC's Golden Age — alongside Action Comics #1 and Detective Comics #27.",
    ],
    highlights: [
      "First appearance of Wonder Woman — created by William Moulton Marston",
      "Published December 1941 — one of DC's most significant Golden Age books",
      "First major female superhero in American comic books",
      "CGC 5.0 VG/FN — strong colour, blue label, unrestored",
    ],
    palette: ["#991b1b", "#f59e0b"],
    featured: true,
    rating: 5,
    reviewCount: 4,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "flash-comics-1-cgc-7-0",
    title: "Flash Comics",
    issue: "#1",
    publisher: "DC Comics",
    year: 1940,
    era: "Golden Age",
    grader: "CGC",
    grade: "7.0",
    label: "Universal Blue",
    certNumber: "1305566778",
    price: 22500000,
    sku: "RCC-FC1-CGC70",
    stock: 1,
    keyIssue: "First appearances of the Flash (Jay Garrick) and Hawkman",
    creators: { writer: "Gardner Fox", artist: "Harry Lampert", cover: "Sheldon Moldoff" },
    summary: "Two Golden Age icons debut in one book — Jay Garrick's Flash and Carter Hall's Hawkman. CGC 7.0 FN/VF.",
    description: [
      "Flash Comics #1 (January 1940) introduced two cornerstone DC heroes simultaneously: Jay Garrick as the original Flash — the Fastest Man Alive — and Carter Hall as the reincarnated Hawkman. Both went on to anchor the Justice Society of America.",
      "This CGC 7.0 FN/VF copy is a spectacular example of the book. The Sheldon Moldoff cover — Flash racing against a red and yellow background — is vibrant at this grade. Interior pages are bright and supple.",
      "Among the finest examples of this title known in private hands. A true museum-quality specimen of a seminal Golden Age book.",
    ],
    highlights: [
      "First appearance of the Flash (Jay Garrick) — Gardner Fox & Harry Lampert",
      "First appearance of Hawkman (Carter Hall) — Gardner Fox & Dennis Neville",
      "Cornerstone of the Justice Society of America line-up",
      "CGC 7.0 FN/VF — near-exceptional copy, blue label, unrestored",
    ],
    palette: ["#b91c1c", "#fde047"],
    featured: true,
    rating: 5,
    reviewCount: 3,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "whiz-comics-2-cgc-3-0",
    title: "Whiz Comics",
    issue: "#2",
    publisher: "Fawcett Publications",
    year: 1940,
    era: "Golden Age",
    grader: "CGC",
    grade: "3.0",
    label: "Universal Blue",
    certNumber: "1407788991",
    price: 11500000,
    sku: "RCC-WC2-CGC30",
    stock: 1,
    keyIssue: "First appearance of Captain Marvel (Billy Batson / Shazam)",
    creators: { writer: "Bill Parker", artist: "C.C. Beck", cover: "C.C. Beck" },
    summary: "SHAZAM! — the debut of the World's Mightiest Mortal, the original Captain Marvel. CGC 3.0 GD/VG.",
    description: [
      "Whiz Comics #2 (February 1940 — there was no #1) introduced Billy Batson, the boy who becomes the mighty Captain Marvel by saying the magic word SHAZAM. C.C. Beck's clean, cartoony art style made the character enormously accessible, and Captain Marvel outsold Superman throughout the early 1940s.",
      "This CGC 3.0 GD/VG copy is complete with all pages present. The cover image of Captain Marvel smashing through a car is a Golden Age classic. Moderate wear throughout is appropriate and expected for this era.",
      "Note: Whiz Comics #1 was a promotional ashcan with limited distribution — #2 was the true first newsstand issue. This is the book collectors and historians count as the debut.",
    ],
    highlights: [
      "First appearance of Captain Marvel (Billy Batson / Shazam) — Bill Parker & C.C. Beck",
      "Published February 1940 — Captain Marvel outsold Superman in the early '40s",
      "Whiz Comics #1 was an ashcan; #2 is the true published first issue",
      "CGC 3.0 GD/VG — complete, blue label, unrestored",
    ],
    palette: ["#dc2626", "#facc15"],
    rating: 5,
    reviewCount: 2,
    image: "/covers/whiz-comics-2-cgc-3-0.jpg",
  },
  {
    slug: "green-lantern-1-cgc-4-5",
    title: "Green Lantern",
    issue: "#1",
    publisher: "DC Comics",
    year: 1941,
    era: "Golden Age",
    grader: "CGC",
    grade: "4.5",
    label: "Universal Blue",
    certNumber: "1502211334",
    price: 8500000,
    sku: "RCC-GL1-CGC45",
    stock: 1,
    keyIssue: "First solo title of Alan Scott, the original Green Lantern",
    creators: { writer: "Bill Finger", artist: "Martin Nodell", cover: "Martin Nodell" },
    summary: "Alan Scott's first solo title — the original power ring hero who lit the Golden Age. CGC 4.5 VG+.",
    description: [
      "Green Lantern #1 (Fall 1941) marks the beginning of Alan Scott's solo run following his debut in All-American Comics #16. Martin Nodell's mystical railway lantern-wielding hero predates the Silver Age space-cop reimagining by 18 years.",
      "This CGC 4.5 VG+ copy shows light, even wear with strong cover colours — the dramatic green and purple palette is bright and striking. Interior pages are clean with supple paper.",
      "A highly desirable standalone Golden Age superhero key at an accessible price point relative to the Action/Detective/Batman tier.",
    ],
    highlights: [
      "First solo title for Alan Scott, the original Green Lantern",
      "Published Fall 1941 — 18 years before the Silver Age Green Lantern (Hal Jordan)",
      "Created by Martin Nodell and scripted by Bill Finger",
      "CGC 4.5 VG+ — bright cover, blue label, unrestored",
    ],
    palette: ["#065f46", "#a3e635"],
    rating: 4,
    reviewCount: 2,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "showcase-4-cgc-5-0",
    title: "Showcase",
    issue: "#4",
    publisher: "DC Comics",
    year: 1956,
    era: "Silver Age",
    grader: "CGC",
    grade: "5.0",
    label: "Universal Blue",
    certNumber: "1612344321",
    price: 17500000,
    sku: "RCC-SHW4-CGC50",
    stock: 1,
    keyIssue: "First appearance of Barry Allen, the Silver Age Flash — launches the Silver Age",
    creators: { writer: "Robert Kanigher", artist: "Carmine Infantino", cover: "Carmine Infantino" },
    summary: "The book that launched the Silver Age — Barry Allen's debut as the new Flash. CGC 5.0 VG/FN.",
    description: [
      "Showcase #4 (September–October 1956) is the official starting gun of the Silver Age of Comics. Editor Julius Schwartz, writer Robert Kanigher, and artist Carmine Infantino reimagined the Flash as police scientist Barry Allen — updating a Golden Age concept for the atomic age and igniting a decade of Marvel and DC innovation.",
      "The Infantino cover — Flash sprinting out of a streak of lightning — is among the most recognisable Silver Age images. This CGC 5.0 VG/FN copy shows moderate wear with clear cover art and complete interior pages.",
      "No serious Silver Age collection is complete without this book. Along with Amazing Fantasy #15, it is the defining Silver Age key issue.",
    ],
    highlights: [
      "First appearance of Barry Allen as the Silver Age Flash",
      "Widely recognised as the first book of the Silver Age of Comics (1956)",
      "Art by the legendary Carmine Infantino",
      "CGC 5.0 VG/FN — complete, blue label, unrestored",
    ],
    palette: ["#991b1b", "#9ca3af"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 4,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "fantastic-four-1-cgc-7-0",
    title: "Fantastic Four",
    issue: "#1",
    publisher: "Marvel Comics",
    year: 1961,
    era: "Silver Age",
    grader: "CGC",
    grade: "7.0",
    label: "Universal Blue",
    certNumber: "1708899100",
    price: 14500000,
    sku: "RCC-FF1-CGC70",
    stock: 1,
    keyIssue: "First appearance of the Fantastic Four (Mr. Fantastic, Invisible Girl, Human Torch, Thing)",
    creators: { writer: "Stan Lee", artist: "Jack Kirby", cover: "Jack Kirby" },
    summary: "The comic that launched the Marvel Universe — Lee & Kirby's Fantastic Four make their explosive debut. CGC 7.0 FN/VF.",
    description: [
      "Fantastic Four #1 (November 1961) is the foundation stone of the Marvel Universe. Stan Lee and Jack Kirby — working under editorial pressure to produce a superhero team — created four distinct, flawed, argumentative characters who felt genuinely human. The Marvel Age of Comics was born.",
      "This CGC 7.0 FN/VF copy is a collector-grade example. The Kirby cover — the FF emerging from the ground in a flash of lightning — is bright and crisp. Interior pages are clean with minimal tanning.",
      "Mr. Fantastic (Reed Richards), Invisible Girl (Sue Storm), Human Torch (Johnny Storm), and the Thing (Ben Grimm) all debut here alongside the Mole Man as the first villain.",
    ],
    highlights: [
      "First appearance of the Fantastic Four — all four members debut simultaneously",
      "Published November 1961 — the birth of the Marvel Universe",
      "Stan Lee & Jack Kirby at the height of their collaborative power",
      "CGC 7.0 FN/VF — excellent copy, blue label, unrestored",
    ],
    palette: ["#1e40af", "#ea580c"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 6,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "amazing-fantasy-15-cgc-6-5",
    title: "Amazing Fantasy",
    issue: "#15",
    publisher: "Marvel Comics",
    year: 1962,
    era: "Silver Age",
    grader: "CGC",
    grade: "6.5",
    label: "Universal Blue",
    certNumber: "1812322100",
    price: 48500000,
    sku: "RCC-AF15-CGC65",
    stock: 1,
    keyIssue: "First appearance and origin of Spider-Man (Peter Parker)",
    creators: { writer: "Stan Lee", artist: "Steve Ditko", cover: "Jack Kirby" },
    summary: "With great power comes great responsibility — Spider-Man swings into existence. CGC 6.5 FN+.",
    description: [
      "Amazing Fantasy #15 (August 1962) is the second-most important comic book ever printed. Stan Lee and Steve Ditko's Peter Parker — a nerdy, bullied teenager who gains spider-powers and learns the hardest lesson of his life — became Marvel's most enduring character and redefined the hero archetype.",
      "This CGC 6.5 FN+ copy is an outstanding example. The iconic Jack Kirby cover — Spider-Man swinging with a captive under his arm — is vivid and well-centred. The interior Ditko pages are clean and bright.",
      "The original print run of Amazing Fantasy #15 was so high that this book is relatively more available than Action Comics #1 — yet prices continue to climb as demand outpaces supply at every grade.",
    ],
    highlights: [
      "First appearance and origin of Spider-Man (Peter Parker) — Stan Lee & Steve Ditko",
      "Published August 1962 — cover by Jack Kirby, story art by Steve Ditko",
      "The second-highest valued comic at auction after Action Comics #1",
      "CGC 6.5 FN+ — exceptional for a Silver Age newsstand book, blue label",
    ],
    palette: ["#dc2626", "#1d4ed8"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 8,
    image: "/covers/amazing-fantasy-15-cgc-6-5.jpg",
  },
  {
    slug: "incredible-hulk-1-cgc-6-0",
    title: "Incredible Hulk",
    issue: "#1",
    publisher: "Marvel Comics",
    year: 1962,
    era: "Silver Age",
    grader: "CGC",
    grade: "6.0",
    label: "Universal Blue",
    certNumber: "1905544332",
    price: 15500000,
    sku: "RCC-IH1-CGC60",
    stock: 1,
    keyIssue: "First appearance of the Hulk (Bruce Banner) — original grey Hulk",
    creators: { writer: "Stan Lee", artist: "Jack Kirby", cover: "Jack Kirby" },
    summary: "The original grey Hulk smashes onto the scene — Bruce Banner's debut in Fine condition. CGC 6.0 FN.",
    description: [
      "Incredible Hulk #1 (May 1962) introduced Dr. Bruce Banner, a scientist transformed by gamma radiation into a rampaging grey monster. Stan Lee and Jack Kirby originally printed the Hulk in grey — a production nightmare that led to the iconic green skin from issue #2 onward.",
      "This CGC 6.0 Fine copy presents beautifully. The Steve Ditko-inked Kirby cover — the Hulk carrying Rick Jones with a tank pursuing him — is bold and dynamic. Interior pages are bright with minimal wear.",
      "Only six issues of the original series were published before cancellation in 1963, making #1 even more prized. The grey Hulk wasn't seen again until John Byrne's 1986 run.",
    ],
    highlights: [
      "First appearance of the Hulk (Bruce Banner) — Stan Lee & Jack Kirby",
      "Original grey Hulk — changed to green from issue #2 due to printing issues",
      "Published May 1962; original series cancelled after just 6 issues",
      "CGC 6.0 FN — bright cover, blue label, unrestored",
    ],
    palette: ["#166534", "#7e22ce"],
    featured: true,
    rating: 5,
    reviewCount: 5,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "x-men-1-cgc-9-0",
    title: "X-Men",
    issue: "#1",
    publisher: "Marvel Comics",
    year: 1963,
    era: "Silver Age",
    grader: "CGC",
    grade: "9.0",
    label: "Universal Blue",
    certNumber: "2001122334",
    price: 22500000,
    sku: "RCC-XM1-CGC90",
    stock: 1,
    keyIssue: "First appearance of the X-Men and Magneto",
    creators: { writer: "Stan Lee", artist: "Jack Kirby", cover: "Jack Kirby" },
    summary: "Homo Superior debuts — the X-Men and Magneto in a stunning CGC 9.0 Very Fine/Near Mint specimen.",
    description: [
      "X-Men #1 (September 1963) brought Marvel's mutant metaphor for civil rights and otherness to newsstands. Stan Lee and Jack Kirby introduced Professor Xavier, Cyclops, Marvel Girl, Beast, Iceman, and Angel in a single issue — alongside their greatest nemesis, Magneto.",
      "This CGC 9.0 VF/NM copy is a world-class specimen. The Kirby cover — the X-Men in their original gold-and-blue costumes surrounding the X logo — is pristine with sharp corners and outstanding colour. A truly exceptional Silver Age survivor.",
      "X-Men #1 has seen extraordinary appreciation in high grade over the past decade. A 9.0 of this calibre is rare on the market at any time.",
    ],
    highlights: [
      "First appearance of the X-Men, Professor Xavier, Cyclops, Marvel Girl, Beast, Iceman, Angel",
      "First appearance of Magneto — Stan Lee & Jack Kirby",
      "Published September 1963 — Marvel's civil-rights allegory in comic form",
      "CGC 9.0 VF/NM — top-tier survivor, blue label, unrestored",
    ],
    palette: ["#ca8a04", "#1e3a8a"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 7,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "avengers-1-cgc-8-5",
    title: "Avengers",
    issue: "#1",
    publisher: "Marvel Comics",
    year: 1963,
    era: "Silver Age",
    grader: "CGC",
    grade: "8.5",
    label: "Universal Blue",
    certNumber: "2108877665",
    price: 9500000,
    sku: "RCC-AVG1-CGC85",
    stock: 1,
    keyIssue: "First appearance of the Avengers (Thor, Iron Man, Hulk, Ant-Man, Wasp)",
    creators: { writer: "Stan Lee", artist: "Jack Kirby", cover: "Jack Kirby" },
    summary: "Earth's Mightiest Heroes assemble for the first time. CGC 8.5 VF+ — a near-perfect Silver Age specimen.",
    description: [
      "Avengers #1 (September 1963) united Marvel's biggest characters — Thor, Iron Man, the Hulk, Ant-Man, and the Wasp — into a team book that would become one of the most successful franchises in entertainment history. Stan Lee and Jack Kirby created a concept simple enough to write on a napkin, yet rich enough to sustain 60+ years of stories.",
      "This CGC 8.5 VF+ copy is outstanding. The Kirby cover — the five heroes battling the Hulk — is sharp, bright, and well-centred. Cream to off-white pages with minimal stress. One of the finest unrestored copies known at this grade.",
      "The Loki subplot and the Asgard connection give this issue unexpected depth. A centrepiece for any high-grade Silver Age Marvel collection.",
    ],
    highlights: [
      "First appearance of the Avengers — Thor, Iron Man, Hulk, Ant-Man, Wasp",
      "First time Loki appears as a villain against the assembled team",
      "Published September 1963 — same month as X-Men #1",
      "CGC 8.5 VF+ — near-gem quality, blue label, unrestored",
    ],
    palette: ["#991b1b", "#b45309"],
    featured: true,
    bestseller: true,
    rating: 5,
    reviewCount: 9,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
  {
    slug: "tales-of-suspense-39-cgc-8-0",
    title: "Tales of Suspense",
    issue: "#39",
    publisher: "Marvel Comics",
    year: 1963,
    era: "Silver Age",
    grader: "CGC",
    grade: "8.0",
    label: "Universal Blue",
    certNumber: "2206655443",
    price: 6500000,
    sku: "RCC-TOS39-CGC80",
    stock: 1,
    keyIssue: "First appearance and origin of Iron Man (Tony Stark)",
    creators: { writer: "Stan Lee", artist: "Don Heck", cover: "Jack Kirby" },
    summary: "Invincible Iron Man blazes onto the stage in the original grey armour. CGC 8.0 VF — a superb copy.",
    description: [
      "Tales of Suspense #39 (March 1963) introduced Anthony 'Tony' Stark — industrialist, weapons manufacturer, and unlikely hero — who builds a suit of iron armour to escape captivity in a Vietnamese jungle. Stan Lee, Larry Lieber, and Don Heck created a character whose popularity would only grow exponentially over the decades.",
      "The original armour in this issue is grey; the now-iconic red and gold design came in issue #48. This CGC 8.0 VF copy is a spectacular example: the Kirby cover — Iron Man menacing attackers — is vivid and sharp. Pages are cream to off-white.",
      "A foundational Silver Age key available at a fraction of the price of the Spider-Man or Fantastic Four keys — yet equally important to the Marvel Universe.",
    ],
    highlights: [
      "First appearance and origin of Iron Man (Tony Stark) — Stan Lee, Larry Lieber & Don Heck",
      "Original grey Iron Man armour — predates the red and gold design",
      "Published March 1963 — one of six Marvel key debuts from 1962–1963",
      "CGC 8.0 VF — superb Silver Age survivor, blue label, unrestored",
    ],
    palette: ["#b91c1c", "#d97706"],
    featured: true,
    rating: 5,
    reviewCount: 6,
// image intentionally omitted — broken URL returns 404; gradient fallback renders.

  },
];

// ─── helpers ────────────────────────────────────────────────────────────────

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getFeatured(): Product[] {
  return products.filter((p) => p.featured);
}

export function getBestsellers(): Product[] {
  return products.filter((p) => p.bestseller);
}

export function getByEra(era: Era): Product[] {
  return products.filter((p) => p.era === era);
}

export function relatedProducts(product: Product, limit = 4): Product[] {
  return products
    .filter((p) => p.slug !== product.slug && p.era === product.era)
    .slice(0, limit);
}

// ─── derived lists used by store filters & UI ────────────────────────────────

export const goldenAge = getByEra("Golden Age");
export const silverAge = getByEra("Silver Age");
export const featuredProducts = products.filter((p) => p.featured);
export const bestsellers = products.filter((p) => p.bestseller);

/** All eras present in the current inventory, in display order. */
const ALL_ERAS: readonly Era[] = [
  "Golden Age",
  "Silver Age",
  "Bronze Age",
  "Copper Age",
  "Modern Age",
];
export const eras: Era[] = ALL_ERAS.filter((era) => products.some((p) => p.era === era));

/** All CGC/CBCS/Raw grader labels present in the current inventory. */
export const graders: Grader[] = Array.from(
  new Set(products.map((p) => p.grader))
) as Grader[];

/** All publisher names present in the current inventory, alphabetically sorted. */
export const publishers: string[] = Array.from(
  new Set(products.map((p) => p.publisher))
).sort();

