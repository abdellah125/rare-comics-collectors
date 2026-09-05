import type { MetadataRoute } from "next";
import { publishedWhere } from "@/lib/catalog/products";
import { db } from "@/lib/db";
import { policies } from "@/lib/policies";
import { services } from "@/lib/services";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

/** Regenerated at most hourly; product and seller entries come from the live catalogue. */
export const revalidate = 3600;

// Account, cart, checkout, dashboards and the admin are noindex and deliberately absent.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => `${site.url}${path}`;
  const settings = await getSettings();

  const [products, sellers, latestProduct] = await Promise.all([
    db.product.findMany({ where: publishedWhere, select: { slug: true, updatedAt: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } }, orderBy: { publishedAt: "desc" }, take: 5000 }),
    settings["features.sellerStorefronts"] ? db.sellerProfile.findMany({ where: { status: "approved" }, select: { slug: true, updatedAt: true } }) : Promise.resolve([]),
    db.product.findFirst({ where: publishedWhere, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const storeChanged = latestProduct?.updatedAt ?? new Date();
  const absolute = (imageUrl: string) => (imageUrl.startsWith("http") ? imageUrl : url(imageUrl));

  const core: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: storeChanged, changeFrequency: "daily", priority: 1 },
    { url: url("/store"), lastModified: storeChanged, changeFrequency: "daily", priority: 0.95 },
    { url: url("/services"), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/contact"), changeFrequency: "monthly", priority: 0.7 },
    { url: url("/faq"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/support"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/track-order"), changeFrequency: "yearly", priority: 0.4 },
    { url: url("/policies"), changeFrequency: "yearly", priority: 0.4 },
    { url: url("/account/register"), changeFrequency: "yearly", priority: 0.3 },
  ];

  const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
    url: url(`/store/${p.slug}`),
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
    images: p.images[0]?.url ? [absolute(p.images[0].url)] : undefined,
  }));

  const sellerUrls: MetadataRoute.Sitemap = sellers.map((s) => ({ url: url(`/sellers/${s.slug}`), lastModified: s.updatedAt, changeFrequency: "weekly", priority: 0.6 }));
  const serviceUrls: MetadataRoute.Sitemap = services.map((s) => ({ url: url(`/services/${s.slug}`), changeFrequency: "monthly", priority: 0.75 }));
  const policyUrls: MetadataRoute.Sitemap = policies.map((p) => ({ url: url(`/policies/${p.slug}`), lastModified: new Date(p.updated), changeFrequency: "yearly", priority: 0.3 }));

  return [...core, ...productUrls, ...sellerUrls, ...serviceUrls, ...policyUrls];
}
