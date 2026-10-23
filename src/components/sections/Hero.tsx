import { ArrowRight, Link2, Lock, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { HeroDemo } from "@/components/demo/HeroDemo";
import { ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Reveal } from "@/components/ui/Reveal";
import { routes, site } from "@/lib/site";

/** Staggered rise for the above-the-fold text: it paints right away (no fade), so it never delays the largest paint. */
const rise = (delay: number) => ({ className: "hero-rise", style: { "--rise-delay": `${delay}s` } as CSSProperties });

export function Hero({ customUrls }: { customUrls: boolean }) {
  const proof = [
    { icon: ShieldCheck, label: "Instant HTTPS links" },
    { icon: Lock, label: "Password protection" },
    { icon: Link2, label: customUrls ? "Custom URLs" : "Custom URLs · soon" },
  ];
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden pt-[calc(var(--header-h)+56px)] sm:pt-[calc(var(--header-h)+80px)]">
      {/* Backdrop: fading grid + restrained accent wash */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="bg-grid mask-fade-y absolute inset-0" />
        <div className="absolute left-1/2 top-[-280px] h-[620px] w-[min(1100px,140vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.14),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <div className="container-x">
        <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
          <div {...rise(0)}>
            <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white/[0.03] py-1.5 pl-1.5 pr-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-2 sm:pl-2 sm:pr-3.5 sm:text-[11.5px] sm:tracking-[0.16em]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-accent" />
                Beta
              </span>
              Free 24-hour previews
            </p>
          </div>

          <div {...rise(0.06)}>
            <h1 id="hero-title" className="mt-7 text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] text-fg sm:text-[60px] lg:text-[74px]">
              <span className="block">Share your localhost.</span>
              <span className="block bg-[linear-gradient(180deg,#dcff9e_0%,#b8ff3b_70%)] bg-clip-text pb-1 text-transparent">Securely. One command.</span>
            </h1>
          </div>

          <div {...rise(0.12)}>
            <p className="mt-6 max-w-[54ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[18px]">
              Turn the app running on your computer into a secure HTTPS preview link for clients and teammates. No deploys, no port forwarding, no
              config.
            </p>
          </div>

          <div {...rise(0.16)} className="hero-rise mt-8 flex w-full max-w-[420px] items-center gap-3 rounded-full border border-line bg-black/50 py-1.5 pl-5 pr-1.5 backdrop-blur">
            <code className="min-w-0 flex-1 truncate text-left font-mono text-[13.5px] text-fg">
              <span className="select-none text-accent">$ </span>
              {site.command}
            </code>
            <CopyButton value={site.command} label={`Copy command: ${site.command}`} className="rounded-full" />
          </div>

          <div {...rise(0.2)} className="hero-rise mt-7 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href={routes.getStarted} size="lg" className="w-full sm:w-auto">
              Start Free
              <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/#pricing" variant="secondary" size="lg" className="w-full sm:w-auto">
              See Pricing
            </ButtonLink>
          </div>

          <div {...rise(0.24)}>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-fg-2" aria-label="Highlights">
              {proof.map((p) => (
                <li key={p.label} className="inline-flex items-center gap-1.5">
                  <p.icon className="size-3.5 text-accent" aria-hidden="true" />
                  {p.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Reveal delay={0.3} y={28} className="mt-16 sm:mt-20">
          <HeroDemo />
        </Reveal>
      </div>
    </section>
  );
}
