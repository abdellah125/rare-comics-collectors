import { msg } from "@/lib/i18n/translate";
export const site = {
  name: "Rare Comics Collectors",
  legalName: "Rare Comics Collectors, LLC",
  tagline: "Acquire legends. Grade yours. Know what it's worth.",
  description:
    "Rare Comics Collectors specialises in Golden Age and Silver Age comic books — authenticated, graded and documented. We offer CGC & CBCS grading submission, pressing, restoration detection and appraisal for serious collectors.",
  // Set NEXT_PUBLIC_SITE_URL in production (e.g. https://rarecomicscollectors.com). On Vercel the
  // project's production host is used when it is not set, so canonicals and the sitemap match
  // the domain that actually serves the site.
  url: (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || "https://rarecomicscollectors.com").replace(/\/$/, ""),
  locale: "en_US",
  /** Google tag (gtag.js) id; NEXT_PUBLIC_GOOGLE_TAG_ID overrides it. Public by nature. */
  googleTagId: "GT-NGWX2GTZ",
  /** Google Ads tag, configured on the same gtag.js library as the tag above. */
  googleAdsTagId: "AW-18492141724",
  currency: "USD",
  twitter: "@rarecomicscol",
  founded: "2011",
  email: "hello@rarecomicscollectors.com",
  salesEmail: "sales@rarecomicscollectors.com",
  gradingEmail: "grading@rarecomicscollectors.com",
  /** WhatsApp for customers. The only place the number is written: digits for wa.me, and as displayed. */
  whatsapp: { number: "14185066697", display: "+1 418-506-6697" },
  /** The store's own time zone, used for the "open now" status. */
  timeZone: "America/Chicago",
  phone: "+1-512-555-0184",
  phoneDisplay: "(512) 555-0184",
  address: {
    street: "418 Congress Avenue, Suite 210",
    city: "Austin",
    region: "TX",
    regionName: "Texas",
    postalCode: "78701",
    country: "US",
    countryName: "United States",
  },
  geo: { lat: 30.267_15, lng: -97.743_06 },
  hours: [
    { days: msg("Monday – Friday"), time: "10:00 AM – 7:00 PM" },
    { days: msg("Saturday"), time: "10:00 AM – 6:00 PM" },
    { days: msg("Sunday"), time: "12:00 PM – 5:00 PM" },
  ],
  // Schema.org openingHoursSpecification format
  openingHours: [
    { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "10:00", closes: "19:00" },
    { days: ["Saturday"], opens: "10:00", closes: "18:00" },
    { days: ["Sunday"], opens: "12:00", closes: "17:00" },
  ],
  social: {
    facebook: "https://www.facebook.com/rarecomicscollectors",
    instagram: "https://www.instagram.com/rarecomicscollectors",
    x: "https://x.com/rarecomicscol",
    youtube: "https://www.youtube.com/@rarecomicscollectors",
    linkedin: "https://www.linkedin.com/company/rarecomicscollectors",
  },
  stats: [
    { value: "200K+", label: msg("Books graded & brokered") },
    { value: "42", label: msg("Years combined expertise") },
    { value: "99.4%", label: msg("Positive buyer feedback") },
    { value: "$60M", label: msg("Insured vault coverage") },
  ],
} as const;

export const mapQuery = encodeURIComponent(
  `${site.legalName}, ${site.address.street}, ${site.address.city}, ${site.address.region} ${site.address.postalCode}`,
);

/** Public "get directions" deep link — works on desktop and both mobile platforms. */
export const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
export const mapDirectionsLink = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
/** Keyless embed URL — no API key required. */
export const mapEmbedLink = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

export const fullAddress = `${site.address.street}, ${site.address.city}, ${site.address.region} ${site.address.postalCode}`;
