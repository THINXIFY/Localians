import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionHeader } from "@/components/ui/SectionHeader";
import { routes } from "@/lib/site";

const included = [
  "Localhost preview sharing",
  "Public HTTPS preview links",
  "Project dashboard",
  "Password-protected previews",
  "Connection monitoring",
  "Basic usage visibility",
];

export const faqs = [
  {
    question: "What is Localians?",
    answer:
      "Localians lets you share a web app running on your computer through a secure HTTPS preview link, with one command and without deploying it. It works like a localhost tunnel built for showing work to clients and teammates.",
  },
  {
    question: "Do my clients need to install anything?",
    answer: "No. Clients can open the shared preview link directly in their web browser.",
  },
  {
    question: "Does my computer need to stay online?",
    answer: "Yes. Your development server and Localians connection must remain running for the live preview to work.",
  },
  {
    question: "Can I protect my preview?",
    answer:
      "Yes. Make a project password protected and visitors must enter the password before they see your app. Changing the password signs everyone out right away, and you can stop a preview from the dashboard at any time.",
  },
  {
    question: "Does Localians host my application?",
    answer:
      "No. Localians connects visitors to your locally running development server. It is not a replacement for production hosting.",
  },
  {
    question: "Can I share from VS Code?",
    answer: "A Localians extension for VS Code is coming soon. Until then, run the share command in VS Code's terminal — it works the same way.",
  },
  {
    question: "Which frameworks does it support?",
    answer:
      "Any local server that speaks HTTP: Next.js, Vite (React, Vue, Svelte), Angular, Django, Rails, Express and more. WebSockets and hot reload work through the preview link. Next.js and Vite are covered by our automated end-to-end tests.",
  },
];

export function Pricing() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader
          id="pricing-title"
          eyebrow="Simple start"
          title="Start building. Share for free."
          description="Explore the core Localians experience during our early beta."
        />

        <Reveal y={24} className="mx-auto mt-14 max-w-[960px] sm:mt-16">
          <div className="relative overflow-hidden rounded-[20px] border border-accent/20 bg-[linear-gradient(160deg,#141b10_0%,var(--card)_45%)] shadow-[0_40px_100px_-50px_rgba(184,255,59,0.35)]">
            <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 size-80 rounded-full bg-[radial-gradient(closest-side,rgba(184,255,59,0.12),transparent)]" />
            <div className="relative grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="flex flex-col border-b border-line p-7 sm:p-9 md:border-b-0 md:border-r">
                <div className="flex items-center gap-3">
                  <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">Free Beta</h3>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                    Early access
                  </span>
                </div>
                <p className="mt-6 flex items-baseline gap-2">
                  <span className="text-[56px] font-semibold leading-none tracking-[-0.05em] text-fg">$0</span>
                  <span className="text-[15px] text-fg-3">/ month</span>
                </p>
                <p className="mt-4 max-w-[32ch] text-[15px] leading-relaxed text-fg-2">
                  Everything you need to try instant localhost sharing.
                </p>
                <div className="mt-8 md:mt-auto md:pt-10">
                  <ButtonLink href={routes.getStarted} size="lg" className="w-full">
                    Join the Free Beta
                    <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
                  </ButtonLink>
                  <p className="mt-3 text-center text-[12.5px] text-fg-3">Beta availability and usage limits may apply.</p>
                </div>
              </div>

              <div className="p-7 sm:p-9">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-fg-3">Included</p>
                <ul className="mt-5 space-y-3.5">
                  {included.map((item) => (
                    <li key={item} className="flex items-center gap-3 text-[15px] text-fg">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/[0.12] text-accent">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>

        <div id="faq" className="mx-auto mt-24 grid max-w-[1080px] gap-10 sm:mt-32 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-fg sm:text-[36px]">
              Questions, answered.
            </h2>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-fg-2">
              Still unsure? Read the{" "}
              <Link href={routes.docs} className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent">
                documentation
              </Link>
              .
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <Accordion items={faqs} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
