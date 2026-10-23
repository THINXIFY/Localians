import { ArrowRight, BookOpen } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/SectionHeader";
import { routes, site } from "@/lib/site";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative px-4 pb-20 sm:px-6 sm:pb-28">
      <Reveal y={24} className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-[24px] border border-line bg-bg-2">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_80%_at_50%_100%,#000,transparent)]" />
          <div className="absolute bottom-[-260px] left-1/2 h-[520px] w-[min(900px,130vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(184,255,59,0.18),transparent)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </div>

        <div className="flex flex-col items-center px-6 py-20 text-center sm:px-10 sm:py-28">
          <Eyebrow>Ready when you are</Eyebrow>
          <h2
            id="cta-title"
            className="mt-6 max-w-[16ch] text-balance text-[36px] font-semibold leading-[1.04] tracking-[-0.04em] text-fg sm:text-[50px] lg:text-[60px]"
          >
            Your next preview is one command away.
          </h2>
          <p className="mt-5 max-w-[46ch] text-pretty text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">
            Stop deploying just to show progress. Share your localhost free for 24 hours and keep building.
          </p>

          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href={routes.getStarted} size="lg" className="w-full sm:w-auto">
              Start Free
              <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href={routes.docs} variant="secondary" size="lg" className="w-full sm:w-auto">
              <BookOpen className="size-4" aria-hidden="true" />
              Explore Documentation
            </ButtonLink>
          </div>

          <div className="mt-10 flex max-w-full items-center gap-3 rounded-full border border-line bg-black/50 py-1.5 pl-4 pr-1.5 backdrop-blur">
            <code className="truncate font-mono text-[13px] text-fg">
              <span className="select-none text-accent">$ </span>
              {site.command}
            </code>
            <CopyButton value={site.command} label="Copy share command" className="rounded-full" />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
