import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { Features } from "@/components/sections/Features";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Frameworks } from "@/components/sections/Frameworks";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Navbar } from "@/components/sections/Navbar";
import { buildFaqs, Pricing } from "@/components/sections/Pricing";
import { ProblemSolution } from "@/components/sections/ProblemSolution";
import { Showcase } from "@/components/sections/Showcase";
import { TechStrip } from "@/components/sections/TechStrip";
import { UseCases } from "@/components/sections/UseCases";
import { absoluteUrl, faqPage, pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { launchFlags, type LaunchFlags } from "@/server/launch";

/** Static, refreshed when an admin changes the payment setting (revalidatePath) and at least every 5 minutes. */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { payments } = await launchFlags();
  return pageMetadata({
    title: "Share Localhost Online with Secure HTTPS Links | Localians",
    absoluteTitle: true,
    description: payments
      ? "Share localhost apps with one command: free 24-hour HTTPS preview links with password protection, or a $5 7-Day Pass with a custom URL. A simple ngrok alternative."
      : "Share localhost apps with one command: free 24-hour HTTPS preview links with password protection and auto-stop timers. A simple ngrok alternative for previews.",
    path: "/",
  });
}

/** Only facts that are true of the product in this environment (the FAQ markup mirrors the FAQ shown on the page). */
function structuredData(flags: LaunchFlags) {
  const offers = [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD", description: "One 24-hour preview window per project" },
    ...(flags.payments ? [{ "@type": "Offer", name: "7-Day Preview Pass", price: "5", priceCurrency: "USD", description: "One-time payment: 7 more days for one project and a custom URL" }] : []),
  ];
  return [
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
        "Preview timers with auto-stop",
        "WebSockets and hot reload",
        "Projects and traffic analytics",
        ...(flags.customUrls ? ["Custom preview URLs"] : []),
      ],
      offers,
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
    faqPage(buildFaqs(flags)),
  ];
}

export default async function Home() {
  const flags = await launchFlags();
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero customUrls={flags.customUrls} />
        <TechStrip />
        <ProblemSolution />
        <Features customUrls={flags.customUrls} vscode={flags.vscode} />
        <Showcase />
        <HowItWorks />
        <Frameworks />
        <UseCases />
        <Pricing payments={flags.payments} customUrls={flags.customUrls} vscode={flags.vscode} />
        <FinalCta />
      </main>
      <Footer />
      <JsonLd data={structuredData(flags)} />
    </>
  );
}
