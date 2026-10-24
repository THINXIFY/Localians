import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, BookOpen, KeyRound, Link2, Radar, Share2, ShieldCheck, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { JsonLd } from "@/components/seo/JsonLd";
import { VsixDownload, VsixDownloadButton, VsixInstallSteps } from "@/components/vscode/VsixDownload";
import { Footer } from "@/components/sections/Footer";
import { Navbar } from "@/components/sections/Navbar";
import { buttonClasses, ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionHeader } from "@/components/ui/SectionHeader";
import { absoluteUrl, breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";
import { vscodeAvailability, vscodeExtension } from "@/lib/vscode-extension";

export const metadata: Metadata = pageMetadata({
  title: "Localians for VS Code: Share Localhost from Your Editor",
  absoluteTitle: true,
  description: "Turn your running dev server into a shareable HTTPS preview link without leaving VS Code. Connect once, click Share, send the link.",
  path: routes.vscodeExtension,
});

const capabilities: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Share2, title: "Share local ports", text: "Pick a running dev server and share it. One share per port, stopped from the sidebar or the status bar." },
  { icon: ShieldCheck, title: "Secure HTTPS links", text: "Every preview is reached over HTTPS. The link is copied for you when the tunnel is confirmed." },
  { icon: KeyRound, title: "Your Localians account", text: "Approve VS Code in your browser once. The sign-in is a revocable token kept in VS Code's Secret Storage." },
  { icon: Link2, title: "Copy and manage links", text: "Previews stay listed with their status. Copy, open, stop or share again, even for previews started elsewhere." },
  { icon: Radar, title: "Project detection", text: "Finds apps running on common ports, recognizes frameworks in your workspace, and matches the project that uses that port." },
  { icon: Terminal, title: "Access and timing", text: "Choose public or password protected, and how long the link works. Localians applies the project's free preview or Preview Pass." },
];

const steps = [
  { n: "01", title: "Install the extension", text: "From the Marketplace (coming soon), or by hand from a downloaded .vsix file." },
  { n: "02", title: "Sign in once", text: "Open Localians in the activity bar and click Sign In to Localians. Approve the one-time code in your browser." },
  { n: "03", title: "Share your app", text: "Start your dev server: Localians finds it. Check the project, click Share App, and send the copied link." },
];

export default function VsCodeExtensionPage() {
  const { installable, downloadable, downloadHref, comingSoon } = vscodeAvailability();
  const { marketplace } = vscodeExtension;

  const structured: object[] = [breadcrumbs([{ name: "VS Code Extension", path: routes.vscodeExtension }])];
  // Only describe it as an available application when it truly is.
  if (installable || downloadable) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: vscodeExtension.displayName,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Windows, macOS, Linux",
      softwareVersion: vscodeExtension.version,
      url: absoluteUrl(routes.vscodeExtension),
      ...(installable ? { installUrl: marketplace.listingUrl } : { downloadUrl: downloadHref.startsWith("/") ? absoluteUrl(downloadHref) : downloadHref }),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: "THINXIFY", url: site.operator.url },
    });
  }

  return (
    <>
      <Navbar />
      <main id="main" className="relative isolate">
        {/* ------------------------------------------------------------ hero */}
        <section aria-labelledby="vsc-title" className="relative overflow-hidden pb-16 pt-[calc(var(--header-h)+64px)] sm:pb-24 sm:pt-[calc(var(--header-h)+96px)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]">
            <div className="bg-grid mask-fade-y absolute inset-0" />
            <div className="absolute left-1/2 top-[-260px] h-[480px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.1),transparent)]" />
          </div>
          <div className="container-x flex flex-col items-center text-center">
            <Eyebrow>VS Code extension</Eyebrow>
            <h1 id="vsc-title" className="mt-6 max-w-[16ch] text-balance text-[40px] font-semibold leading-[1.04] tracking-[-0.045em] text-fg sm:text-[56px] lg:text-[68px]">
              Share Localhost. Right From VS Code.
            </h1>
            <p className="mt-6 max-w-[56ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[18px]">
              Turn your running development server into a shareable HTTPS preview link without leaving your editor.
            </p>

            {comingSoon ? (
              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-accent" data-testid="vscode-status">
                Coming soon · Preview
              </p>
            ) : installable ? null : (
              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-accent" data-testid="vscode-status">
                Preview release · Manual install
              </p>
            )}

            <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row" data-testid="vscode-actions">
              {installable ? (
                <a href={marketplace.installUri} className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })} data-testid="install-marketplace">
                  Install from Marketplace
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <button type="button" disabled className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-medium text-fg-3 sm:w-auto" data-testid="install-disabled">
                  Install from Marketplace · Soon
                </button>
              )}
              <VsixDownloadButton className="w-full sm:w-auto" />
              <ButtonLink href={routes.vscodeDocs} variant="ghost" size="lg" className="w-full sm:w-auto">
                <BookOpen className="size-4" aria-hidden="true" />
                View Documentation
              </ButtonLink>
            </div>
            {installable ? (
              <a href={marketplace.listingUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-[13px] text-fg-3 underline-offset-4 hover:text-fg hover:underline">
                View on the Visual Studio Marketplace <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
            <p className="mt-5 text-[13px] text-fg-3">
              Needs VS Code {vscodeExtension.minVscode} or newer and a free Localians account.{" "}
              {comingSoon ? "Until the extension is released, you can share from any terminal with the CLI." : null}
            </p>
            {comingSoon ? (
              <div className="mt-4 flex max-w-full items-center gap-3 rounded-full border border-line bg-black/50 py-1.5 pl-4 pr-1.5">
                <code className="truncate font-mono text-[13px] text-fg">
                  <span className="select-none text-accent">$ </span>
                  {site.command}
                </code>
                <CopyButton value={site.command} label={`Copy command: ${site.command}`} className="rounded-full" />
              </div>
            ) : null}
          </div>
        </section>

        {/* ------------------------------------------------------------ screenshots */}
        <section aria-label="The extension in VS Code" className="relative border-t border-line py-14 sm:py-20">
          <div className="container-x grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {[
              { src: "/images/vscode/welcome.png", alt: "The Localians sidebar in VS Code: Welcome to Localians, with a Sign In to Localians button and a Getting started guide", caption: "Sign in once" },
              { src: "/images/vscode/share-form.png", alt: "The sidebar with the running Next.js app detected, a new project, password protection, a 30-minute link and the Share App button", caption: "Pick your app, click Share App" },
              { src: "/images/vscode/two-previews.png", alt: "Two live previews in the sidebar, each with its port, link, Copy Link, Open and Stop", caption: "Several apps at once" },
            ].map((shot, i) => (
              <Reveal key={shot.src} delay={i * 0.06}>
                <figure className="surface hairline-top flex h-full flex-col overflow-hidden">
                  <div className="flex flex-1 items-start justify-center bg-black/30 p-4 sm:p-6">
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      width={375}
                      height={949}
                      sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
                      className="h-auto max-h-[560px] w-full max-w-[300px] rounded-lg border border-line object-cover object-top"
                    />
                  </div>
                  <figcaption className="border-t border-line px-5 py-3 text-[13px] text-fg-2">{shot.caption}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ capabilities */}
        <section aria-labelledby="vsc-capabilities" className="section-y relative border-t border-line">
          <div className="container-x">
            <SectionHeader id="vsc-capabilities" eyebrow="What it does" title="Everything you need, inside the editor." description="No terminal commands, no deploys and no second tool to install: the extension includes the same tunnel client as the Localians CLI." />
            <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((c, i) => (
                <li key={c.title}>
                  <Reveal delay={(i % 3) * 0.05} className="surface hairline-top flex h-full flex-col p-6">
                    <c.icon className="size-5 text-accent" aria-hidden="true" />
                    <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-fg">{c.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{c.text}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ three steps */}
        <section aria-labelledby="vsc-steps" className="section-y relative border-t border-line">
          <div className="container-x">
            <SectionHeader id="vsc-steps" eyebrow="Three steps" title="From editor to link in a minute." />
            <ol className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-5">
              {steps.map((s, i) => (
                <li key={s.n}>
                  <Reveal delay={i * 0.06} className="surface hairline-top h-full p-6 sm:p-7">
                    <span className="font-mono text-[13px] text-accent">{s.n}</span>
                    <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-fg">{s.title}</h3>
                    <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">{s.text}</p>
                  </Reveal>
                </li>
              ))}
            </ol>

          </div>
        </section>

        {/* ------------------------------------------------------------ download */}
        <section id="download" aria-labelledby="vsc-download" className="section-y relative scroll-mt-20 border-t border-line">
          <div className="container-x">
            <SectionHeader
              id="vsc-download"
              eyebrow="Install"
              title="Download VSIX"
              description="Install Localians for VS Code from a file now, or from the Marketplace once it is published there."
            />
            <div className="mx-auto mt-12 flex max-w-[1040px] min-w-0 flex-col gap-10 sm:gap-12">
              <Reveal className="min-w-0">
                <VsixDownload />
              </Reveal>
              <Reveal delay={0.06} className="min-w-0">
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-fg">Install from a .vsix file</h3>
                <p className="mt-1.5 text-[14px] text-fg-2">Four steps, about a minute.</p>
                <VsixInstallSteps className="mt-5" />
              </Reveal>
              <Reveal delay={0.1} className="min-w-0">
                <div className="flex flex-col gap-3 rounded-xl border border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6" data-testid="marketplace-note">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">
                      Install from Marketplace
                      {installable ? null : <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-3">Coming soon</span>}
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
                      {installable
                        ? "Search for Localians in the Extensions view, or use the Install from Marketplace button above."
                        : "The extension isn't on the Visual Studio Marketplace yet. When it is, you'll be able to install it with one click and get automatic updates."}
                    </p>
                  </div>
                  {installable ? (
                    <a href={marketplace.installUri} className={buttonClasses({ variant: "secondary", size: "md", className: "w-full shrink-0 sm:w-auto" })}>
                      Install from Marketplace
                    </a>
                  ) : null}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ closing CTA */}
        <section aria-labelledby="vsc-cta" className="relative px-4 pb-20 sm:px-6 sm:pb-28">
          <Reveal y={24} className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[24px] border border-line bg-bg-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_100%,#000,transparent)]" />
              <div className="absolute bottom-[-260px] left-1/2 h-[520px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.16),transparent)]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            </div>
            <div className="flex flex-col items-center px-6 py-16 text-center sm:px-10 sm:py-24">
              <h2 id="vsc-cta" className="max-w-[18ch] text-balance text-[34px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[46px]">
                Your editor. Ready to share.
              </h2>
              <p className="mt-5 max-w-[46ch] text-pretty text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">Start with a free Localians account. Every project gets a free 24-hour preview.</p>
              <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <ButtonLink href={routes.getStarted} size="lg" className="w-full sm:w-auto">
                  Start Free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={routes.vscodeDocs} variant="secondary" size="lg" className="w-full sm:w-auto">
                  <BookOpen className="size-4" aria-hidden="true" />
                  View Documentation
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
      <JsonLd data={structured} />
    </>
  );
}
