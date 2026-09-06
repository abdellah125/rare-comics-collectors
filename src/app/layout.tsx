import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Orbitron } from "next/font/google";
import "./globals.css";

import { site } from "@/lib/site";
import { brandStyle } from "@/lib/brand-color";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], display: "swap", weight: ["700", "900"] });

const baseMetadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — Graded Comics for Sale, CGC & CBCS Grading Services`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.legalName, url: site.url }],
  creator: site.legalName,
  publisher: site.legalName,
  keywords: [
    "buy graded comics",
    "CGC graded comics for sale",
    "CBCS grading service",
    "comic book grading",
    "comic pressing service",
    "comic book appraisal",
    "sell comic books",
    `comic book store ${site.address.city}`,
    "key issue comics",
    "comic consignment",
  ],
  category: "shopping",
  alternates: { canonical: site.url },
  openGraph: {
    type: "website",
    url: site.url,
    siteName: site.name,
    title: `${site.name} — Graded Comics, Grading & Collector Services`,
    description: site.description,
    locale: site.locale,
    images: [{ url: "/api/og", width: 1200, height: 630, alt: site.name }],
  },
  twitter: { card: "summary_large_image", site: site.twitter, creator: site.twitter, images: ["/api/og"] },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  formatDetection: { telephone: true, address: true, email: true },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    // iOS ignores SVG touch icons, so serve a rasterised one.
    apple: [{ url: "/api/icon?size=180", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

/** Marketplace name and favicon come from Settings › General so a rebrand needs no deploy. */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings().catch(() => null);
  // Ownership tokens for Google Search Console and Bing Webmaster Tools (HTML-tag method).
  const verification: Metadata["verification"] = {
    ...(env.seo.googleSiteVerification ? { google: env.seo.googleSiteVerification } : {}),
    ...(env.seo.bingSiteVerification ? { other: { "msvalidate.01": env.seo.bingSiteVerification } } : {}),
  };
  if (!settings) return { ...baseMetadata, verification };
  const name = settings["marketplace.name"] || site.name;
  const favicon = settings["marketplace.faviconMediaId"] ? `/api/media/${settings["marketplace.faviconMediaId"]}` : "/icon.svg";
  return {
    ...baseMetadata,
    verification,
    title: { default: `${name} — Graded Comics for Sale, CGC & CBCS Grading Services`, template: `%s | ${name}` },
    applicationName: name,
    openGraph: { ...baseMetadata.openGraph, siteName: name },
    icons: { icon: [{ url: favicon }], apple: [{ url: "/api/icon?size=180", sizes: "180x180", type: "image/png" }] },
  };
}

export const viewport: Viewport = { themeColor: "#0d1017", width: "device-width", initialScale: 1, colorScheme: "light" };

/** Root layout: document shell only. Storefront chrome lives in (site)/layout, the admin has its own. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await getSettings();
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${orbitron.variable} h-full antialiased`} style={brandStyle(settings["marketplace.primaryColor"]) as React.CSSProperties | undefined}>
      <body className="flex min-h-full flex-col bg-white">{children}</body>
    </html>
  );
}
