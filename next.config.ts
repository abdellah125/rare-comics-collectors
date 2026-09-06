import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=()" },
];

/**
 * Canonical public origin. NEXT_PUBLIC_SITE_URL wins; on Vercel the project's production
 * domain is the fallback. Evaluated at build time, like every value in this file.
 */
const canonicalOrigin = (process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/$/, "");
const canonicalHost = canonicalOrigin ? new URL(canonicalOrigin).host : "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
        pathname: "/wikipedia/**",
      },
    ],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Belt and braces for robots.txt: private areas and API responses are never indexed even when linked elsewhere.
      { source: "/:area(admin|account|dashboard|cart|checkout|appeal|report)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/:area(admin|account|dashboard|cart|checkout|appeal|report)/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // Uploaded product photos (/api/media) and social cards (/api/og) stay indexable as images.
      { source: "/api/:path((?!media/|og).*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // Cover scans only change with a deploy.
      { source: "/covers/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
  async rewrites() {
    // IndexNow requires its key file at the site root; the route handler validates the name.
    return [{ source: "/:key(indexnow-[a-f0-9]+)\\.txt", destination: "/api/indexnow/key?key=:key" }];
  },
  async redirects() {
    // Once a custom domain is the canonical origin, the *.vercel.app alias becomes a duplicate:
    // send visitors, crawlers and old links to the real domain. Webhooks and the cron endpoint
    // are exempt so a provider still pointed at the old host keeps working until it is updated.
    // The rule is only emitted for production builds whose canonical host is not itself on
    // vercel.app, so it can never loop.
    if (process.env.VERCEL_ENV !== "production" || !canonicalHost || /\.vercel\.app$/.test(canonicalHost)) return [];
    return [
      {
        source: "/:path((?!api/webhooks|api/jobs).*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: `${canonicalOrigin}/:path`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
