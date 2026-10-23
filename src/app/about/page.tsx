import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, BookOpen, Gauge, KeyRound, Play, Share2, Users, Zap, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TunnelVisual } from "@/components/about/TunnelVisual";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/sections/Footer";
import { Navbar } from "@/components/sections/Navbar";
import { buttonClasses, ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionHeader } from "@/components/ui/SectionHeader";
import { absoluteUrl, breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "About Localians | Secure Localhost Sharing Platform",
  absoluteTitle: true,
  description: "Discover Localians, the developer platform for sharing local applications through secure HTTPS preview links, developed by THINXIFY.",
  path: routes.about,
});

const capabilities = [
  "Share a running local app through a secure HTTPS preview link, for demos, reviews, testing and collaboration.",
  "Start from the command line, then manage your projects and previews from the dashboard.",
  "Protect a link with a password, and choose how long a preview stays up.",
  "Every project gets a free 24-hour preview window. Paid passes add extended previews and custom URLs when available.",
];

const principles: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Zap, title: "Simplicity", text: "One command and a link. No pipeline to set up first." },
  { icon: Gauge, title: "Speed", text: "Show work the moment it runs, instead of waiting for a build and deploy." },
  { icon: Users, title: "Productivity", text: "Fewer throwaway staging deployments, more time spent building." },
  { icon: KeyRound, title: "Secure sharing", text: "HTTPS links, optional passwords and timers you control." },
];

const steps: { n: string; title: string; text: string; icon: LucideIcon }[] = [
  { n: "01", title: "Run Your App", text: "Start your local development server the way you always do.", icon: Play },
  { n: "02", title: "Connect Localians", text: "Use the Localians CLI to establish a preview tunnel.", icon: Share2 },
  { n: "03", title: "Share Your Link", text: "Share the generated HTTPS URL with your team or clients.", icon: Globe },
];

const structuredData = [
  breadcrumbs([{ name: "About", path: routes.about }]),
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: absoluteUrl("/"),
    description: "A developer platform for sharing locally running applications through secure HTTPS preview links.",
    parentOrganization: { "@type": "Organization", name: "THINXIFY", url: site.operator.url },
  },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="relative isolate">
        {/* ------------------------------------------------------------ hero */}
        <section aria-labelledby="about-title" className="relative overflow-hidden pb-20 pt-[calc(var(--header-h)+64px)] sm:pb-28 sm:pt-[calc(var(--header-h)+96px)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]">
            <div className="bg-grid mask-fade-y absolute inset-0" />
            <div className="absolute left-1/2 top-[-260px] h-[480px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.12),transparent)]" />
          </div>
          <div className="container-x flex flex-col items-center text-center">
            <Eyebrow>About Localians</Eyebrow>
            <h1 id="about-title" className="mt-6 max-w-[16ch] text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] text-fg sm:text-[56px] lg:text-[68px]">
              Built for Developers. Made for Sharing.
            </h1>
            <p className="mt-6 max-w-[58ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[18px]">
              Localians makes it simple to turn locally running applications into secure HTTPS preview links. Share your work, collaborate with others, and get feedback without
              complicated deployment workflows.
            </p>
            <TunnelVisual />
          </div>
        </section>

        {/* ------------------------------------------------------------ what it is */}
        <section aria-labelledby="what-title" className="section-y relative border-t border-line">
          <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
            <Reveal>
              <Eyebrow>The platform</Eyebrow>
              <h2 id="what-title" className="mt-5 text-balance text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[42px]">
                What is Localians?
              </h2>
              <p className="mt-5 max-w-[44ch] text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
                Localians is a developer-focused localhost-sharing platform. It exposes the application running on your computer through an HTTPS preview link, so the people you work with can open it in a browser.
              </p>
            </Reveal>
            <Reveal delay={0.06}>
              <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
                {capabilities.map((c) => (
                  <li key={c} className="flex gap-3.5 px-5 py-4 text-[15px] leading-relaxed text-fg-2 sm:px-6">
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-[2px] bg-accent" />
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ why */}
        <section aria-labelledby="why-title" className="section-y relative border-t border-line">
          <div className="container-x">
            <SectionHeader
              id="why-title"
              eyebrow="Why we built it"
              title="Great Ideas Deserve to Be Shared."
              description="Showing an unfinished app to a client or teammate usually means a staging server, a build, a deploy and a link that's out of date by the next commit. Localians removes those steps from the middle of development, so feedback arrives while the work is still easy to change."
            />
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {principles.map((p, i) => (
                <li key={p.title}>
                  <Reveal delay={i * 0.05} className="surface hairline-top flex h-full flex-col p-6">
                    <p.icon className="size-5 text-accent" aria-hidden="true" />
                    <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-fg">{p.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{p.text}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ how it works */}
        <section aria-labelledby="how-title" className="section-y relative border-t border-line">
          <div className="container-x">
            <SectionHeader id="how-title" eyebrow="How it works" title="How Localians Works" description="Three steps from a running dev server to a link anyone can open." />
            <ol className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-5">
              {steps.map((s, i) => (
                <li key={s.n}>
                  <Reveal delay={i * 0.06} className="surface hairline-top h-full p-6 sm:p-7">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[13px] text-accent">{s.n}</span>
                      <s.icon className="size-5 text-fg-3" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-fg">{s.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{s.text}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
            <Reveal className="mx-auto mt-8 flex max-w-full w-fit items-center gap-3 rounded-full border border-line bg-black/50 py-1.5 pl-5 pr-1.5">
              <code className="truncate font-mono text-[13.5px] text-fg">
                <span className="select-none text-accent">$ </span>
                {site.command}
              </code>
              <CopyButton value={site.command} label={`Copy command: ${site.command}`} className="rounded-full" />
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ THINXIFY */}
        <section aria-labelledby="thinxify-title" className="section-y relative border-t border-line">
          <div className="container-x">
            <Reveal className="mx-auto flex max-w-[760px] flex-col items-center rounded-[24px] border border-line bg-bg-2 px-6 py-12 text-center sm:px-12 sm:py-16">
              <span className="rounded-full border border-line-strong px-3 py-1 font-mono text-[11.5px] uppercase tracking-[0.2em] text-fg-2">THINXIFY</span>
              <h2 id="thinxify-title" className="mt-6 text-balance text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[40px]">
                Built by THINXIFY.
              </h2>
              <p className="mt-5 max-w-[54ch] text-pretty text-[16px] leading-relaxed text-fg-2">
                Localians is developed by THINXIFY, a technology company specializing in custom software, AI automation, web applications, SaaS development and digital solutions.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
                <a href={site.operator.url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                  Explore THINXIFY
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
                <ButtonLink href={routes.services} variant="ghost" size="lg">
                  See THINXIFY services
                </ButtonLink>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ closing CTA */}
        <section aria-labelledby="cta-title" className="relative px-4 pb-20 sm:px-6 sm:pb-28">
          <Reveal y={24} className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[24px] border border-line bg-bg-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_100%,#000,transparent)]" />
              <div className="absolute bottom-[-260px] left-1/2 h-[520px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.16),transparent)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            </div>
            <div className="flex flex-col items-center px-6 py-16 text-center sm:px-10 sm:py-24">
              <h2 id="cta-title" className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[48px]">
                Your Localhost. Ready to Share.
              </h2>
              <p className="mt-5 max-w-[46ch] text-pretty text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">Start sharing your development work in seconds with Localians.</p>
              <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href={routes.getStarted} size="lg" className="w-full sm:w-auto">
                  Start Sharing
                  <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={routes.docs} variant="secondary" size="lg" className="w-full sm:w-auto">
                  <BookOpen className="size-4" aria-hidden="true" />
                  View Documentation
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
      <JsonLd data={structuredData} />
    </>
  );
}
