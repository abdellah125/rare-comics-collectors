import type { Metadata } from "next";
import { site, fullAddress } from "@/lib/site";

/** Build page metadata with sane OG/Twitter/canonical defaults. */
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

  return {
    title,
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
