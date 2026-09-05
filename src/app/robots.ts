import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private areas and transactional routes carry no indexable content.
        disallow: ["/admin", "/account", "/dashboard", "/cart", "/checkout", "/appeal", "/report", "/api/", "/store?", "/*?q="],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
