import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { ScrollbarGlow } from "@/components/ui/ScrollbarGlow";
import { ConsentBanner } from "@/components/ui/ConsentBanner";
import { GA_MEASUREMENT_ID, googleTagBootstrap } from "@/lib/analytics";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  display: "swap",
  // Code snippets aren't the largest paint: don't let this font compete with the page's CSS and body font.
  preload: false,
});

/**
 * Site-wide defaults. Deliberately no canonical URL or og:url here: they would be inherited by every page that doesn't
 * set its own. Public pages use pageMetadata() (src/lib/seo.ts); private pages set robots: noIndex.
 */
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: site.title,
    template: "%s · Localians",
  },
  description: site.description,
  applicationName: site.name,
  creator: "Thinxify Technologies",
  publisher: site.name,
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  // Google Search Console ownership verification for https://localians.com.
  verification: { google: "iXvhd5hOPWfiz1lhpSC8k6aCHeh37V1mJVrQgw1UD1Y" },
  openGraph: { type: "website", siteName: site.name, locale: "en_US", title: site.title, description: site.description },
  twitter: { card: "summary_large_image", title: site.title, description: site.description },
};

export const viewport: Viewport = {
  themeColor: "#070907",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Google tag (gtag.js), with Consent Mode: no analytics cookies until the visitor accepts (src/lib/analytics.ts). */}
        <script dangerouslySetInnerHTML={{ __html: googleTagBootstrap }} />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
        {/* Scroll-reveal styles only hide content once JavaScript runs, so pages are always readable without it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.js=''" }} />
      </head>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React loads; this
          only ignores attribute differences on this element, not on anything inside it. */}
      <body className="min-h-dvh" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#070907]"
        >
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <ScrollbarGlow />
        <ConsentBanner />
      </body>
    </html>
  );
}
