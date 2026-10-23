import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * Crawl the public marketing site and docs; skip the signed-in app and internal APIs. Sign-in pages stay crawlable
 * so search engines can see their noindex tag (a disallowed URL can still be indexed from links, without content).
 * Previews live on the separate preview domain, which the gateway marks noindex on every response.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/onboarding", "/cli/"] },
    sitemap: new URL("/sitemap.xml", site.url).toString(),
  };
}
