import type { MetadataRoute } from "next";
import { routes, site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", routes.docs, routes.gettingStarted, routes.cliGuide, routes.frameworks, routes.troubleshooting, routes.security, routes.getStarted, routes.about, routes.contact, routes.privacy, routes.terms];
  // routes.getStarted is the public /signup page; /login and /dashboard are intentionally excluded.
  return paths.map((path) => ({ url: new URL(path, site.url).toString() }));
}
