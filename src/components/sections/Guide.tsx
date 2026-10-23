import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { breadcrumbs, faqPage } from "@/lib/seo";
import { routes } from "@/lib/site";

export type FaqItem = { question: string; answer: string };

/** Questions and answers shown on the page; the FAQPage markup is generated from the same items. */
export function GuideFaq({ items }: { items: FaqItem[] }) {
  return (
    <section aria-labelledby="faq-title" className="mt-16">
      <h2 id="faq-title" className="text-[22px] font-semibold tracking-[-0.02em] text-fg">
        Questions
      </h2>
      <div className="mt-6 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <div key={item.question} className="py-5">
            <h3 className="text-[16px] font-medium text-fg">{item.question}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{item.answer}</p>
          </div>
        ))}
      </div>
      <JsonLd data={faqPage(items)} />
    </section>
  );
}

/** Closing call to action, plus breadcrumb markup for the guide. */
export function GuideCta({ name, path }: { name: string; path: string }) {
  return (
    <div className="mt-16 flex flex-col gap-4 rounded-[var(--radius-card)] border border-accent/25 bg-accent/[0.04] p-6 sm:p-8">
      <p className="text-[20px] font-semibold tracking-[-0.02em] text-fg">Share your first preview in about a minute.</p>
      <p className="text-[15px] leading-relaxed text-fg-2">Free to start with a 24-hour preview per project. No credit card, nothing to deploy.</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={routes.getStarted}>
          Start Sharing Free
          <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
        <Link href={routes.gettingStarted} className="inline-flex h-10 items-center text-[14.5px] font-medium text-fg-2 underline underline-offset-4 hover:text-fg">
          Read the getting started guide
        </Link>
      </div>
      <JsonLd data={breadcrumbs([{ name: "Guides", path: routes.shareLocalhost }, ...(path === routes.shareLocalhost ? [] : [{ name, path }])])} />
    </div>
  );
}

/** A link inside guide prose. */
export function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-fg underline underline-offset-4 hover:decoration-accent">
      {children}
    </Link>
  );
}
