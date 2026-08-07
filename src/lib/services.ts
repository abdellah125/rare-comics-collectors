export type Service = {
  slug: string;
  name: string;
  short: string;
  /** price in cents; null = quoted */
  price: number | null;
  priceNote: string;
  turnaround: string;
  icon: "shield" | "press" | "search" | "scale" | "camera" | "truck";
  summary: string;
  description: string[];
  includes: string[];
  steps: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
};

export const services: Service[] = [
  {
    slug: "grading-submission",
    name: "CGC & CBCS Grading Submission",
    short: "Authorised submission at dealer rates",
    price: 3900,
    priceNote: "per book, plus grader tier fee",
    turnaround: "18–45 business days",
    icon: "shield",
    summary:
      "We are an authorised submission centre for both CGC and CBCS. Send us your books and we handle packing, declared values, tier selection and the entire round trip.",
    description: [
      "Most collectors lose money on grading before the book is even opened — wrong tier, wrong declared value, or damage in transit. As an authorised submission centre we absorb that risk for you.",
      "Every book is pre-screened by a VaultCollect grader before it goes out. If we think a book will not return the grade you are paying for, we tell you before we submit it, not after.",
      "You get dealer submission rates, consolidated shipping, and a single point of contact for the entire process.",
    ],
    includes: [
      "Pre-screen and honest grade estimate on every book",
      "Dealer-rate submission to CGC or CBCS",
      "Declared value and tier selection handled for you",
      "Insured, tracked shipping both directions",
      "Photo documentation before and after encapsulation",
      "Online status tracking through your VaultCollect account",
    ],
    steps: [
      { title: "Request a submission kit", body: "Tell us how many books you're sending. We ship you archival bags, boards, and a rigid shipper." },
      { title: "We pre-screen", body: "A VaultCollect grader inspects each book, estimates the grade, and flags press candidates or restoration concerns." },
      { title: "You approve", body: "You receive a per-book recommendation with estimated grade, tier cost, and expected value. Nothing is submitted without your sign-off." },
      { title: "We submit and track", body: "Books go out in a consolidated dealer shipment. You track progress from your account." },
      { title: "Return or consign", body: "Slabs come back to you insured, or roll straight into a consignment listing on our store." },
    ],
    faqs: [
      { q: "Do I need my own CGC membership?", a: "No. We submit under our dealer account, which is why the per-book rate is lower than retail submission." },
      { q: "What if the grade comes back lower than estimated?", a: "Our pre-screen estimate is advisory, not a guarantee. If we miss by more than one full grade point we refund our service fee on that book." },
      { q: "Is my book insured while you have it?", a: "Yes. Books are covered under our $60M vault policy from the moment we sign for them until they are delivered back to you." },
    ],
  },
  {
    slug: "pressing-and-cleaning",
    name: "Professional Pressing & Dry Cleaning",
    short: "Non-invasive defect removal",
    price: 2500,
    priceNote: "per book",
    turnaround: "10–20 business days",
    icon: "press",
    summary:
      "Heat and humidity pressing removes non-colour-breaking bends, spine roll, and dents. Correctly done, it is fully accepted by both CGC and CBCS and is not restoration.",
    description: [
      "Pressing is the highest-return service in the hobby when it is done on the right book. A single removed bend can move a 9.2 to a 9.6 and double the realised value.",
      "It is also the easiest way to destroy a book in unskilled hands. Our presser has fifteen years of experience and works exclusively on a calibrated, humidity-controlled system.",
      "We only press books where we believe there is a grade to gain. If your book will not improve, we tell you and return it unpressed at no charge.",
    ],
    includes: [
      "Candidacy assessment before any work begins",
      "Humidity-controlled heat press",
      "Dry cleaning of surface dirt and pencil marks",
      "Staple and spine realignment where appropriate",
      "Before-and-after photography",
      "No-improvement, no-charge guarantee",
    ],
    steps: [
      { title: "Send the book", body: "Ship it to us or add pressing to any raw book you buy from our store." },
      { title: "Candidacy review", body: "We identify which defects are pressable and estimate the realistic grade gain." },
      { title: "Press", body: "Multi-stage humidity and heat cycle, adjusted for paper age and stock." },
      { title: "Grade or return", body: "Roll straight into a grading submission, or have the pressed book returned to you." },
    ],
    faqs: [
      { q: "Does pressing count as restoration?", a: "No. Pressing uses no foreign material and is explicitly accepted by CGC and CBCS. Books receive a standard Universal label." },
      { q: "Which defects can't be pressed out?", a: "Colour-breaking creases, tears, stains, staple holes, and anything involving missing paper. Pressing changes shape, not substance." },
      { q: "Can you press Golden Age newsprint?", a: "Yes, with a reduced-temperature cycle. Brittle books are assessed individually and we decline anything we judge unsafe." },
    ],
  },
  {
    slug: "restoration-detection",
    name: "Restoration & Authenticity Detection",
    short: "UV, magnification and solvent-free analysis",
    price: 1900,
    priceNote: "per book",
    turnaround: "3–5 business days",
    icon: "search",
    summary:
      "Long-wave UV examination, high-magnification inspection, and paper-weight analysis to detect colour touch, trimming, married pages, glue, and reproduction covers.",
    description: [
      "Undisclosed restoration is the single most expensive mistake a collector can make. A purple-label book can be worth a fifth of the same book in blue.",
      "Our detection service catches colour touch, spine tears sealed with glue, trimmed edges, married interiors, and reproduced covers before you buy — or before you submit.",
      "You receive a written report with UV photography that stands up as documentation in a resale or insurance context.",
    ],
    includes: [
      "Long-wave UV examination, full front and back",
      "40x magnification inspection of spine, staples and edges",
      "Dimensional check against publisher trim specs",
      "Page count, centrefold and interior verification",
      "Written report with UV photography",
      "Fee credited back if you proceed to grading with us",
    ],
    steps: [
      { title: "Submit the book", body: "Ship it in, or bring it to the Austin location for same-day examination by appointment." },
      { title: "Examination", body: "UV, magnification and dimensional analysis by two independent examiners." },
      { title: "Report", body: "A written PDF report with photography, delivered to your account within five business days." },
    ],
    faqs: [
      { q: "Is this the same as CGC's restoration check?", a: "It uses the same methods. It is not a substitute for a CGC grade, but it tells you what a grader will find before you pay tier fees." },
      { q: "What if you find restoration?", a: "You get the full report either way. If you bought the book from us, we refund it in full under our authenticity guarantee." },
      { q: "Can you detect a trimmed book?", a: "Yes — dimensional measurement against publisher trim specs is part of every examination, and it is the most common defect we catch." },
    ],
  },
  {
    slug: "appraisal-and-valuation",
    name: "Collection Appraisal & Valuation",
    short: "Insurance and estate-grade documentation",
    price: null,
    priceNote: "quoted by collection size — from $250",
    turnaround: "5–15 business days",
    icon: "scale",
    summary:
      "Formal written appraisals for insurance scheduling, estate settlement, divorce proceedings and charitable donation, built on realised auction data rather than guide prices.",
    description: [
      "Guide prices are not appraisals. Insurers, executors and courts want documented fair market value tied to comparable realised sales, prepared by a qualified party.",
      "We build every appraisal from twelve months of realised sales across the major auction houses and marketplaces, adjusted for grade, label type and census position.",
      "Reports are signed, dated, and formatted to be accepted by carriers and probate courts.",
    ],
    includes: [
      "Itemised inventory with grade, label and cert number",
      "Fair market value per item with comparable sales cited",
      "Replacement value for insurance scheduling",
      "Signed and dated appraiser statement",
      "Digital and printed copies",
      "Annual re-valuation at 40% of the original fee",
    ],
    steps: [
      { title: "Scope call", body: "A short call to size the collection and confirm the purpose of the appraisal." },
      { title: "Inventory", body: "On-site for larger collections in Central Texas, or by structured photo submission." },
      { title: "Valuation", body: "Each item valued against twelve months of realised comparables." },
      { title: "Report delivery", body: "Signed PDF and printed copy, plus a spreadsheet inventory you can hand to your carrier." },
    ],
    faqs: [
      { q: "Do insurers accept your appraisals?", a: "Yes. Our reports follow standard personal-property appraisal formatting and cite comparable realised sales for every line item." },
      { q: "Will you appraise a collection you might buy?", a: "We will, but we disclose the conflict in writing and you are free to obtain an independent second appraisal. We never condition an appraisal on a sale." },
      { q: "How large a collection can you handle?", a: "We have appraised single books and estates over 40,000 issues. Large collections are quoted by the box." },
    ],
  },
  {
    slug: "consignment-and-brokerage",
    name: "Consignment & Private Brokerage",
    short: "We sell it for you, at our reach",
    price: null,
    priceNote: "8–15% commission, no listing fees",
    turnaround: "Listed within 5 business days",
    icon: "camera",
    summary:
      "List your books through the VaultCollect store and our auction channels. Professional photography, market-priced listings, and payout within seven days of a cleared sale.",
    description: [
      "Selling high-value books yourself means fee stacking, chargeback exposure, and buyers who negotiate against your inexperience. Consignment removes all three.",
      "We photograph, describe, price against realised comparables, and market your books to a buyer list built over fourteen years — including private clients who never shop public marketplaces.",
      "Commission is 15% under $2,500, 12% to $10,000, and 8% above. No listing fees, no photography charge, no minimum term.",
    ],
    includes: [
      "Professional multi-angle photography",
      "Market-researched pricing against realised sales",
      "Listing on our store plus major auction channels",
      "Private client outreach for six-figure books",
      "Insured storage in our Austin vault while listed",
      "Payout by ACH or wire within seven days of cleared funds",
    ],
    steps: [
      { title: "Submit your list", body: "Send us cert numbers or photographs. We return a proposed price for each book within two business days." },
      { title: "Agree terms", body: "A one-page agreement covering price floors, commission tier and term. No exclusivity beyond the agreed period." },
      { title: "We list and sell", body: "Books are photographed, listed, and actively marketed. You track views and offers from your account." },
      { title: "Get paid", body: "ACH or wire within seven days of cleared funds, with a full statement." },
    ],
    faqs: [
      { q: "Can I set a minimum price?", a: "Yes. Every consignment agreement includes a price floor that we cannot sell below without your written approval." },
      { q: "What if it doesn't sell?", a: "We re-price with your approval at 60 days. If you want it back at any point, we ship it back insured at cost." },
      { q: "Do you consign raw books?", a: "Yes, though we usually recommend grading anything we expect to realise over $400." },
    ],
  },
  {
    slug: "vault-storage",
    name: "Insured Vault Storage",
    short: "Climate-controlled, fully insured",
    price: 1200,
    priceNote: "per book, per year",
    turnaround: "Same-day intake",
    icon: "truck",
    summary:
      "Climate-controlled, humidity-stabilised, fire-suppressed storage for high-value slabs, with per-item insurance and 48-hour retrieval.",
    description: [
      "Paper degrades in ordinary homes. Heat cycles, humidity swings and UV exposure will pull a white-page book to off-white within a decade.",
      "Our vault holds 68°F and 45% relative humidity year-round, with inert-gas fire suppression, no windows, and 24-hour monitored access control.",
      "Every stored item is individually scheduled on our $60M policy at its appraised value.",
    ],
    includes: [
      "68°F / 45% RH climate control, monitored continuously",
      "Inert-gas fire suppression — no water damage risk",
      "Individual insurance scheduling at appraised value",
      "24-hour monitored access control and CCTV",
      "48-hour retrieval, or same-day by appointment",
      "Quarterly condition audit with photographs",
    ],
    steps: [
      { title: "Schedule intake", body: "Ship in or drop off. Each item is photographed, catalogued and scheduled on the policy." },
      { title: "Stored and monitored", body: "Items are barcoded and located. Environmental conditions are logged continuously." },
      { title: "Retrieve any time", body: "Request retrieval from your account. Shipped insured within 48 hours, or collect in person same-day." },
    ],
    faqs: [
      { q: "Can I visit my books?", a: "Yes, by appointment during business hours. Viewing takes place in our inspection room, not the vault floor." },
      { q: "What happens if VaultCollect closes?", a: "Stored items are held as bailment, not as company assets. They are not exposed to our creditors and would be returned to owners." },
      { q: "Is there a minimum term?", a: "Twelve months, billed annually. Retrieval before term end is permitted with no penalty; unused months are not refunded." },
    ],
  },
];

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}
