import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, Orbitron } from "next/font/google";
import "./globals.css";

import { site } from "@/lib/site";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], display: "swap", weight: ["600", "700"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], display: "swap", weight: ["700", "900"] });

export const metadata: Metadata = {
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

export const viewport: Viewport = { themeColor: "#0d1017", width: "device-width", initialScale: 1, colorScheme: "light" };

/** Root layout: document shell only. Storefront chrome lives in (site)/layout, the admin has its own. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${orbitron.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white">{children}</body>
    </html>
  );
}
