import { Features } from "@/components/sections/Features";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Frameworks } from "@/components/sections/Frameworks";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Navbar } from "@/components/sections/Navbar";
import { Pricing } from "@/components/sections/Pricing";
import { ProblemSolution } from "@/components/sections/ProblemSolution";
import { Showcase } from "@/components/sections/Showcase";
import { TechStrip } from "@/components/sections/TechStrip";
import { UseCases } from "@/components/sections/UseCases";
import { site } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: site.name,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Windows, Linux",
  description: site.description,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free Beta" },
};

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
