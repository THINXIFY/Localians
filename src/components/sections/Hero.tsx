import { ArrowRight } from "lucide-react";
import { HeroDemo } from "@/components/demo/HeroDemo";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { routes } from "@/lib/site";

export function Hero() {
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
          <Reveal>
            <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white/[0.03] py-1.5 pl-1.5 pr-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-2 sm:pl-2 sm:pr-3.5 sm:text-[11.5px] sm:tracking-[0.16em]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-accent">
                <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-accent" />
                Beta
              </span>
              Local development. Global access.
            </p>
          </Reveal>

          <Reveal delay={0.06}>
            <h1
              id="hero-title"
              className="mt-7 text-[42px] font-semibold leading-[1.02] tracking-[-0.045em] text-fg sm:text-[60px] lg:text-[74px]"
            >
              <span className="block">Your localhost.</span>
              <span className="block bg-[linear-gradient(180deg,#dcff9e_0%,#b8ff3b_70%)] bg-clip-text pb-1 text-transparent">
                Anyone&apos;s browser.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-[54ch] text-pretty text-[16.5px] leading-relaxed text-fg-2 sm:text-[18px]">
              Share your local web apps with clients and teammates in seconds. Secure HTTPS previews, real-time
              updates, and zero deployment hassle.
            </p>
          </Reveal>

          <Reveal delay={0.18} className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href={routes.getStarted} size="lg" className="w-full sm:w-auto">
              Start Sharing Free
              <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="/#how-it-works" variant="secondary" size="lg" className="w-full sm:w-auto">
              See How It Works
            </ButtonLink>
          </Reveal>

          <Reveal delay={0.24}>
            <p className="mt-6 font-mono text-[12.5px] tracking-[0.02em] text-fg-3">
              One command<span className="text-accent">.</span> One link<span className="text-accent">.</span>{" "}
              Anywhere<span className="text-accent">.</span>
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.3} y={28} className="mt-16 sm:mt-20">
          <HeroDemo />
        </Reveal>
      </div>
    </section>
  );
}
