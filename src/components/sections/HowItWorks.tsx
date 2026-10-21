import { Globe, Play, Share2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const steps: { n: string; title: string; description: string; code: string; prompt: boolean; icon: LucideIcon }[] = [
  {
    n: "01",
    title: "Start your app.",
    description: "Run your development server as you normally would.",
    code: "npm run dev",
    prompt: true,
    icon: Play,
  },
  {
    n: "02",
    title: "Share your port.",
    description: "Run Localians and securely expose your local application.",
    code: site.command,
    prompt: true,
    icon: Share2,
  },
  {
    n: "03",
    title: "Send the link.",
    description: "Give clients or teammates a URL they can open from any browser.",
    code: site.demoUrl,
    prompt: false,
    icon: Globe,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="how-title"
          eyebrow="Three simple steps"
          title="From localhost to anywhere."
          description="No complicated setup. No deployment pipeline. Just your app and a shareable link."
        />

        <div className="relative mt-14 sm:mt-16">
          {/* Desktop connector running through the step markers */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-[47px] hidden h-px bg-[linear-gradient(90deg,rgba(184,255,59,0.5),rgba(184,255,59,0.15)_50%,rgba(184,255,59,0.5))] lg:block"
          />
          {/* Mobile/tablet connector */}
          <span aria-hidden="true" className="absolute bottom-10 left-[43px] top-10 w-px sm:left-[47px] bg-gradient-to-b from-accent/40 via-accent/15 to-accent/40 lg:hidden" />

          <ol className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          {steps.map((step, i) => (
            <li key={step.n} className="relative">
              <Reveal delay={i * 0.08} className="surface hairline-top flex h-full flex-col p-6 sm:p-7 lg:items-center lg:text-center">
                <div className="flex items-center gap-4 lg:flex-col lg:gap-3">
                  <span className="relative z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border border-accent/40 bg-[#141b0f] text-accent shadow-[0_0_0_6px_var(--card)]">
                    <step.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-[11.5px] tracking-[0.16em] text-fg-3">STEP {step.n}</span>
                </div>
                <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.025em] text-fg">{step.title}</h3>
                <p className="mb-6 mt-2 max-w-[34ch] text-[15px] leading-relaxed text-fg-2">{step.description}</p>

                <div
                  className={cn(
                    "mt-auto flex w-full items-center justify-between gap-3 rounded-xl border bg-black/40 py-2 pl-3.5 pr-2",
                    step.prompt ? "border-line" : "border-accent/25",
                  )}
                >
                  <code className={cn("min-w-0 truncate text-left font-mono text-[12.5px]", step.prompt ? "text-fg" : "text-accent")}>
                    {step.prompt ? <span className="select-none text-accent">$ </span> : null}
                    {step.code}
                  </code>
                  <CopyButton value={step.code} label={`Copy ${step.prompt ? "command" : "example link"}: ${step.code}`} />
                </div>
              </Reveal>
            </li>
          ))}
          </ol>
        </div>

        <p className="mt-6 text-center text-[12.5px] text-fg-3">The link in step 03 is an example address.</p>
      </div>
    </section>
  );
}
