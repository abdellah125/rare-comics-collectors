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
    // No `host` directive: it is a Yandex extension that Bing Webmaster Tools flags as
    // "Syntax not understood"; Google and Bing only read User-agent, Allow, Disallow and Sitemap.
    sitemap: `${site.url}/sitemap.xml`,
  };
}
