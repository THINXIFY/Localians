import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/sections/Footer";
import { Navbar } from "@/components/sections/Navbar";
import { buttonClasses } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/SectionHeader";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Software, AI & Web Development Services | THINXIFY",
  absoluteTitle: true,
  description: "Explore professional software development, AI automation, SaaS, web design, SEO, and digital solutions from THINXIFY, the company behind Localians.",
  path: routes.services,
});

/*
 * Every card leads to THINXIFY's contact page, as the owner specified. Checked against thinxify.com (sitemaps, services
 * page) and services.thinxify.com: neither publishes a page per service, so there is no deeper URL to use.
 * Game Development, Domain & Hosting Management, IT Consulting & Strategy and the four newest services (AI agents,
 * AI voice agents, Chrome extensions, APIs) are on the owner's list but aren't named on thinxify.com's services page yet.
 */
const SERVICES_URL = site.servicesContactUrl;

const categories: { id: string; title: string; services: { title: string; description: string }[] }[] = [
  {
    id: "web-digital",
    title: "Web & Digital Experiences",
    services: [
      { title: "Website Development", description: "Fast, modern business websites built to present your brand clearly and turn visitors into enquiries." },
      { title: "WordPress Development", description: "Flexible WordPress builds with custom themes and plugins that your team can manage and update easily." },
      { title: "Webflow & Framer Websites", description: "Polished no-code websites in Webflow or Framer, launched quickly and simple to edit without a developer." },
      { title: "UI/UX & Creative Design", description: "Clean, usable interfaces and visual design that make products easier to understand and more pleasant to use." },
      { title: "E-Commerce Solutions", description: "Online stores built for smooth browsing and checkout, with the tools to manage products and orders." },
    ],
  },
  {
    id: "software-engineering",
    title: "Software & Engineering",
    services: [
      { title: "Custom Software Development", description: "Tailored web and business software designed around your workflow, built to be secure, maintainable and ready to scale." },
      { title: "SaaS Product Development", description: "From first prototype to production, with the accounts, dashboards and infrastructure a subscription product needs." },
      { title: "Mobile App Development", description: "iOS and Android apps built around your users, from the first concept through to release and updates." },
      { title: "Cloud & DevOps Services", description: "Reliable deployment, hosting infrastructure and automation that keep your applications running and easy to ship." },
      { title: "Chrome Extension Development", description: "Browser extensions for Chrome that add features to websites, automate repetitive tasks and fit smoothly into how people work." },
      { title: "API Development & Integrations", description: "Reliable APIs and system integrations that connect your software, services and data, built to be secure and easy to maintain." },
      { title: "Data & Analytics", description: "Dashboards and reporting that turn scattered data into clear insights your team can act on." },
      { title: "Game Development", description: "Engaging interactive games, from early prototype to playable release, shaped around your audience and goals." },
      { title: "Domain & Hosting Management", description: "Help choosing, configuring and maintaining your domains, DNS and hosting so your website stays online." },
    ],
  },
  {
    id: "ai-growth",
    title: "AI, Innovation & Growth",
    services: [
      { title: "AI & Business Automation", description: "Practical AI and workflow automation that removes repetitive tasks and helps your team work faster." },
      { title: "AI Agents & Workflow Automation", description: "Custom AI agents that handle multi-step tasks and connect your tools, so routine workflows run with less manual effort." },
      { title: "AI Voice Agents & Call Automation", description: "Conversational voice agents that answer calls, qualify enquiries and route requests, helping your team handle conversations at scale." },
      { title: "Blockchain & Web3 Development", description: "Decentralized applications and smart-contract solutions for teams that want to build on public blockchain networks." },
      { title: "Token Launch & Marketing", description: "Planning and promotion support for crypto token launches, from positioning and community to launch campaigns." },
      { title: "Search Engine Optimization (SEO)", description: "Technical and content optimization that helps your website become easier to find in search engines." },
      { title: "Digital Marketing", description: "Targeted campaigns across digital channels to reach the right audience and measure what works." },
      { title: "IT Consulting & Strategy", description: "Practical guidance on technology choices, architecture and roadmaps to help you plan and build with confidence." },
    ],
  },
];

const structuredData = [
  breadcrumbs([{ name: "Services", path: routes.services }]),
  { "@context": "https://schema.org", "@type": "Organization", name: "THINXIFY", url: site.operator.url },
];

function ExternalLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

export default function ServicesPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="relative isolate">
        {/* ------------------------------------------------------------ hero */}
        <section aria-labelledby="services-title" className="relative overflow-hidden pb-16 pt-[calc(var(--header-h)+64px)] sm:pb-20 sm:pt-[calc(var(--header-h)+96px)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]">
            <div className="bg-grid mask-fade-y absolute inset-0" />
            <div className="absolute left-1/2 top-[-260px] h-[480px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.1),transparent)]" />
          </div>
          <div className="container-x flex flex-col items-center text-center">
            <Eyebrow>Professional services by THINXIFY</Eyebrow>
            <h1 id="services-title" className="mt-6 max-w-[16ch] text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] text-fg sm:text-[56px] lg:text-[68px]">
              Beyond Localhost. Build What&apos;s Next.
            </h1>
            <p className="mt-6 max-w-[58ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[18px]">
              Explore professional software development, AI, web, and digital growth services from THINXIFY, the technology company behind Localians.
            </p>
            <ExternalLink href={site.operator.url} className={buttonClasses({ size: "lg", className: "mt-9" })}>
              Explore THINXIFY
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </ExternalLink>
            <p className="mt-6 max-w-[56ch] text-[13.5px] leading-relaxed text-fg-3">
              These services are provided by THINXIFY, not by the Localians localhost-sharing platform. The links below open THINXIFY&apos;s own website.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------ services */}
        <section aria-label="THINXIFY services" className="relative border-t border-line pb-20 pt-14 sm:pb-28 sm:pt-20">
          <div className="container-x space-y-14 sm:space-y-16">
            {categories.map((cat) => (
              <div key={cat.id} aria-labelledby={`${cat.id}-title`}>
                <Reveal>
                  <h2 id={`${cat.id}-title`} className="flex items-center gap-3 text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
                    <span aria-hidden="true" className="h-4 w-1 rounded-full bg-accent" />
                    {cat.title}
                  </h2>
                </Reveal>
                <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {cat.services.map((s) => (
                    <li key={s.title} className="group/card relative flex flex-col rounded-[var(--radius-card)] border border-line bg-card p-5 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-tint/[0.03] focus-within:border-accent/40 sm:p-6">
                      <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-fg">{s.title}</h3>
                      <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{s.description}</p>
                      <ExternalLink
                        href={SERVICES_URL}
                        className="mt-5 inline-flex w-fit items-center gap-1.5 text-[14px] font-medium text-accent after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-[''] focus-visible:outline-offset-4 md:mt-auto md:pt-5"
                      >
                        <span>
                          Explore Service<span className="sr-only">: {s.title} (opens THINXIFY in a new tab)</span>
                        </span>
                        <ArrowUpRight className="size-3.5 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5" aria-hidden="true" />
                      </ExternalLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ closing CTA */}
        <section aria-labelledby="work-title" className="relative px-4 pb-20 sm:px-6 sm:pb-28">
          <Reveal y={24} className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[24px] border border-line bg-bg-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_100%,#000,transparent)]" />
              <div className="absolute bottom-[-260px] left-1/2 h-[520px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.16),transparent)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            </div>
            <div className="flex flex-col items-center px-6 py-16 text-center sm:px-10 sm:py-24">
              <h2 id="work-title" className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[48px]">
                Have a Project in Mind?
              </h2>
              <p className="mt-5 max-w-[52ch] text-pretty text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
                From your first idea to a production-ready platform, THINXIFY helps turn ambitious concepts into real digital products.
              </p>
              <ExternalLink href={site.operator.url} className={buttonClasses({ size: "lg", className: "mt-9" })}>
                Work With THINXIFY
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </ExternalLink>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
      <JsonLd data={structuredData} />
    </>
  );
}
