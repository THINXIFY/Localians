import type { Metadata } from "next";
import { site } from "./site";

/**
 * Metadata for a public, indexable page. Next.js replaces nested metadata objects (openGraph, twitter, alternates)
 * per segment instead of merging them, so every public page sets all three here: its own canonical URL, and Open
 * Graph / X cards with its own title, description and URL (the shared social image comes from app/opengraph-image).
 */
export function pageMetadata({ title, description, path, absoluteTitle }: { title: string; description: string; path: string; absoluteTitle?: boolean }): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} · ${site.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: "en_US",
      title: fullTitle,
      description,
      url: path,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Localians — share localhost apps securely" }],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: ["/opengraph-image"] },
  };
}

/** Pages that must never appear in search results (sign-in flows, account and app pages). */
export const noIndex: Metadata["robots"] = { index: false, follow: false, nocache: true };

export const absoluteUrl = (path: string) => new URL(path, site.url).toString();

/** BreadcrumbList structured data for a page under Home. */
export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

/** FAQPage structured data. Only for questions and answers that are visible on the same page. */
export function faqPage(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((q) => ({ "@type": "Question", name: q.question, acceptedAnswer: { "@type": "Answer", text: q.answer } })),
  };
}
