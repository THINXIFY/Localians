import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { Features } from "@/components/sections/Features";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Frameworks } from "@/components/sections/Frameworks";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Navbar } from "@/components/sections/Navbar";
import { faqs, Pricing } from "@/components/sections/Pricing";
import { ProblemSolution } from "@/components/sections/ProblemSolution";
import { Showcase } from "@/components/sections/Showcase";
import { TechStrip } from "@/components/sections/TechStrip";
import { UseCases } from "@/components/sections/UseCases";
import { absoluteUrl, faqPage, pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Share Localhost Online with Secure HTTPS Links | Localians",
  absoluteTitle: true,
  description:
    "Share localhost apps securely with one command. Get an HTTPS preview link for your local Next.js, Vite or other dev server — public or password protected.",
  path: "/",
});

/** Only facts that are true of the product today (the FAQ markup mirrors the FAQ shown on the page). */
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    url: absoluteUrl("/"),
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Localhost tunneling",
    operatingSystem: "Windows, macOS, Linux",
    description: site.description,
    featureList: [
      "Share a local dev server with one command",
      "Secure HTTPS preview links",
      "Password-protected previews",
      "WebSockets and hot reload",
      "Live preview dashboard with traffic analytics",
    ],
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free beta" },
    publisher: { "@type": "Organization", name: site.name, url: absoluteUrl("/") },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/images/logo/icon-512.png"),
  },
  { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url: absoluteUrl("/") },
  faqPage(faqs),
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <TechStrip />
        <ProblemSolution />
        <Features />
        <Showcase />
        <HowItWorks />
        <Frameworks />
        <UseCases />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
      <JsonLd data={structuredData} />
    </>
  );
}
