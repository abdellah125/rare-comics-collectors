import type { Metadata } from "next";
import { site, fullAddress } from "@/lib/site";

/** Build page metadata with sane OG/Twitter/canonical defaults. */
/** Google shows about 60 characters of a title and about 155 of a description. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
const BRAND_SUFFIX = ` | ${site.name}`;

/**
 * The layout appends " | <site name>" to every title. A title that already names the site, or that
 * would run past TITLE_MAX with it, is used as it is, so the words that matter are not cut off and the
 * brand is never printed twice.
 */
export function searchTitle(title: string): string | { absolute: string } {
  return title.includes(site.name) || title.length + BRAND_SUFFIX.length > TITLE_MAX ? { absolute: title } : title;
}

/**
 * At most `max` characters: whole sentences when they fit (ending at a full stop beyond half of the
 * limit), otherwise whole words and an ellipsis. Never a word cut in half.
 */
export function clampDescription(text: string, max = DESCRIPTION_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const stop = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? head.length - 1 : -1);
  if (stop >= max * 0.5) return head.slice(0, stop + 1);
  const space = head.lastIndexOf(" ", max - 1);
  return `${head.slice(0, space > 0 ? space : max - 1).replace(/[,;:—–-]\s*$/, "")}…`;
}

export function pageMetadata({
  title,
  description,
  path,
  keywords,
  type = "website",
  noIndex = false,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  noIndex?: boolean;
}): Metadata {
  const url = `${site.url}${path === "/" ? "" : path}`;
  const ogImage = `/api/og?title=${encodeURIComponent(title)}`;
  description = clampDescription(description);

  return {
    title: searchTitle(title),
    description,
    keywords,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type,
      url,
      siteName: site.name,
      title,
      description,
      locale: site.locale,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      site: site.twitter,
      creator: site.twitter,
      title,
      description,
      images: [ogImage],
    },
  };
}

const postalAddress = {
  "@type": "PostalAddress",
  streetAddress: site.address.street,
  addressLocality: site.address.city,
  addressRegion: site.address.region,
  postalCode: site.address.postalCode,
  addressCountry: site.address.country,
};

/**
 * Organization + LocalBusiness graph emitted once from the root layout.
 * `Store` is a LocalBusiness subtype, which is what Google wants for a
 * physical retail location with hours and a map pin.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site.url}/#organization`,
        name: site.name,
        legalName: site.legalName,
        url: site.url,
        logo: { "@type": "ImageObject", url: `${site.url}/icon.svg` },
        description: site.description,
        foundingDate: site.founded,
        email: site.email,
        telephone: site.phone,
        address: postalAddress,
        sameAs: Object.values(site.social),
      },
      {
        "@type": "Store",
        "@id": `${site.url}/#store`,
        name: site.name,
        image: `${site.url}/icon.svg`,
        url: site.url,
        description: `${site.name} — graded comic book sales, CGC & CBCS grading submission, pressing and appraisal in ${site.address.city}, ${site.address.region}.`,
        telephone: site.phone,
        email: site.email,
        priceRange: "$$-$$$$",
        currenciesAccepted: site.currency,
        paymentAccepted: "Cash, Credit Card, Debit Card, Wire Transfer, PayPal",
        address: postalAddress,
        geo: { "@type": "GeoCoordinates", latitude: site.geo.lat, longitude: site.geo.lng },
        hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`,
        openingHoursSpecification: site.openingHours.map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: h.days,
          opens: h.opens,
          closes: h.closes,
        })),
        parentOrganization: { "@id": `${site.url}/#organization` },
        areaServed: { "@type": "Country", name: "United States" },
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        url: site.url,
        name: site.name,
        publisher: { "@id": `${site.url}/#organization` },
        inLanguage: "en-US",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${site.url}/store?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
