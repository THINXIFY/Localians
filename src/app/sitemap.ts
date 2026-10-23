import type { MetadataRoute } from "next";
import { indexablePaths, routes, site } from "@/lib/site";

const PRIORITY: Record<string, number> = { "/": 1, [routes.shareLocalhost]: 0.9, [routes.docs]: 0.8, [routes.gettingStarted]: 0.8 };

/** Public, indexable pages only (canonical production URLs). Sign-in, account and app pages are intentionally absent. */
export default function sitemap(): MetadataRoute.Sitemap {
  return indexablePaths.map((path) => ({
    url: new URL(path, site.url).toString(),
    changeFrequency: path === routes.privacy || path === routes.terms ? "yearly" : "monthly",
    priority: PRIORITY[path] ?? 0.6,
  }));
}
