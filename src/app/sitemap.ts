import type { MetadataRoute } from "next";
import { products } from "@/lib/products";
import { services } from "@/lib/services";
import { policyPages } from "@/lib/nav";
import { site } from "@/lib/site";

// Static build date — avoids a new timestamp on every request, which search
// engines treat as noise. Bump when content changes materially.
const LAST_MODIFIED = new Date("2026-08-01T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${site.url}${path}`;

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/store"), changeFrequency: "daily", priority: 0.95 },
    { url: url("/services"), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/contact"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/faq"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/policies"), changeFrequency: "yearly", priority: 0.4 },
    { url: url("/support"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/track-order"), changeFrequency: "yearly", priority: 0.4 },
  ];

  const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
    url: url(`/store/${p.slug}`),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const serviceUrls: MetadataRoute.Sitemap = services.map((s) => ({
    url: url(`/services/${s.slug}`),
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  const policyUrls: MetadataRoute.Sitemap = policyPages.map((p) => ({
    url: url(`/policies/${p.slug}`),
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [...core, ...productUrls, ...serviceUrls, ...policyUrls].map((entry) => ({
    ...entry,
    lastModified: LAST_MODIFIED,
  }));
}
