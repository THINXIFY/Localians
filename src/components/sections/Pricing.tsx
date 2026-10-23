import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import Link from "next/link";
import { Accordion } from "@/components/ui/Accordion";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow, SectionHeader } from "@/components/ui/SectionHeader";
import { cn } from "@/lib/cn";
import type { PassOffer } from "@/lib/offer";
import { routes } from "@/lib/site";

type Flags = { payments: boolean; customUrls: boolean; vscode: boolean; offer: PassOffer };

/** Answers shown in the FAQ — and used for the FAQPage structured data, so markup always matches the page. */
export function buildFaqs(flags: Flags) {
  const o = flags.offer;
  return [
    {
      question: "How long do previews last?",
      answer:
        `Every project gets one free 24-hour preview window that starts with its first share. Restarting or reconnecting stays within that window. With the ${o.shortName} the project can be shared for ${o.moreLabel}. You can also set a shorter auto-stop, from 5 minutes.`,
    },
    {
      question: `What is the ${o.priceLabel} ${o.name}?`,
      answer: flags.payments
        ? `A one-time ${o.priceLabel} payment for one project — not a subscription. It adds ${o.daysLabel} of sharing and one reserved custom URL. It starts when your payment is verified and doesn't renew by itself; renewing before it ends adds another ${o.daysLabel}.`
        : `A one-time ${o.priceLabel} upgrade for one project — not a subscription — that adds ${o.daysLabel} of sharing and one reserved custom URL. It's coming soon.`,
    },
    {
      question: "What are custom preview URLs?",
      answer:
        `A memorable link like agentaxio.preview.localians.com that stays the same every time you share the project. It comes with the ${o.shortName}.` +
        (flags.customUrls ? "" : " Custom URLs are coming soon."),
    },
    {
      question: "Can I protect my preview with a password?",
      answer: "Yes, on every plan. Visitors enter the password before they see your app. Changing it signs everyone out right away, and you can stop a preview from the dashboard at any time.",
    },
    {
      question: "How is the payment verified?",
      answer: flags.payments
        ? `You pay ${o.usdtLabel} on BNB Smart Chain (BEP20) — prices are in US dollars, paid 1:1 in USDT — using the details in your dashboard, then send us your transaction hash. We verify the transfer on the blockchain before activating your pass — usually the same day.`
        : "Payments are coming soon. When they open, you'll pay in your dashboard and your pass activates after the payment is verified.",
    },
    {
      question: "Does my computer need to stay online?",
      answer: "Yes. Localians connects visitors to the app running on your machine — it doesn't host a copy. If your computer sleeps or the app stops, the preview shows as offline, even with a pass.",
    },
    {
      question: "Do my clients need to install anything?",
      answer: "No. They open the link in any browser. For a password-protected preview, they enter the password you gave them.",
    },
    {
      question: "Which frameworks does it support?",
      answer:
        "Any local server that speaks HTTP: Next.js, Vite (React, Vue, Svelte), Angular, Django, Rails, Express and more. WebSockets and hot reload work through the preview link.",
    },
  ];
}

export function Pricing({ payments, customUrls, vscode, offer }: Flags) {
  const faqs = buildFaqs({ payments, customUrls, vscode, offer });
  const soon = (on: boolean) => (on ? null : <span className="ml-1.5 rounded-full border border-line-strong px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.12em] text-fg-3">Soon</span>);
  const free = ["One 24-hour preview window per project", "Secure HTTPS link (random)", "Password protection", "Auto-stop timers", "Projects and analytics"];
  const pass: { label: string; tag?: React.ReactNode }[] = [
    { label: `${offer.moreLabel} of sharing for one project` },
    { label: "One reserved custom URL", tag: soon(customUrls) },
    { label: "Password protection" },
    { label: "Reconnect on the same link while active" },
  ];
  const rows: [string, string, string][] = [
    ["Price", "$0", `${offer.priceLabel} one-time`],
    ["Preview time", "24 hours per project", `${offer.moreLabel} per project`],
    ["Preview link", "Random HTTPS link", customUrls ? "Your custom URL" : "Custom URL (soon)"],
    ["Password protection", "✓", "✓"],
    ["Auto-stop timers", "5 min – 24 h", `5 min – ${offer.daysLabel}`],
    ["Projects & analytics", "✓", "✓"],
    ["Subscription", "—", "No, one-time"],
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="section-y relative">
      <div className="container-x">
        <SectionHeader id="pricing-title" eyebrow="Pricing" title={`Free to start. ${offer.priceLabel} when you need more.`} description={`No subscriptions. Share any project free for 24 hours, then add ${offer.daysLabel} for the projects that need it.`} />

        <div className="mx-auto mt-14 grid max-w-[980px] gap-4 sm:mt-16 md:grid-cols-2 md:gap-5">
          {/* ------------------------------------------------------------ Free */}
          <Reveal className="surface hairline-top flex flex-col p-7 sm:p-8">
            <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">Free</h3>
            <p className="mt-5 flex items-baseline gap-2">
              <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-fg">$0</span>
              <span className="text-[14px] text-fg-3">forever</span>
            </p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">Try any project with a full day of sharing.</p>
            <ul className="mt-6 space-y-3">
              {free.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14.5px] text-fg">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 md:mt-auto md:pt-8">
              <ButtonLink href={routes.getStarted} variant="secondary" size="lg" className="w-full">
                Start Free
                <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
              </ButtonLink>
              <p className="mt-3 text-center text-[12px] text-fg-3">Usage limits apply during the beta.</p>
            </div>
          </Reveal>

          {/* ------------------------------------------------------------ 7-Day Pass */}
          <Reveal delay={0.06} className="relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-accent/30 bg-[linear-gradient(160deg,#141b10_0%,var(--card)_55%)] p-7 shadow-[0_40px_100px_-50px_rgba(184,255,59,0.35)] sm:p-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(184,255,59,0.14),transparent)]" />
            <div className="relative flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.02em] text-fg">
                <Sparkles className="size-4 text-accent" aria-hidden="true" />
                {offer.name}
              </h3>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">{payments ? "Per project" : "Coming soon"}</span>
            </div>
            <p className="relative mt-5 flex items-baseline gap-2">
              <span className="text-[52px] font-semibold leading-none tracking-[-0.05em] text-fg">{offer.priceLabel}</span>
              <span className="text-[14px] text-fg-3">one-time · {offer.daysLabel}</span>
            </p>
            <p className="relative mt-3 text-[14.5px] leading-relaxed text-fg-2">A one-time payment, not a subscription. For client reviews that take longer than a day.</p>
            <ul className="relative mt-6 space-y-3">
              {pass.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-[14.5px] text-fg">
                  <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>
                    {item.label}
                    {item.tag}
                  </span>
                </li>
              ))}
            </ul>
            <div className="relative mt-8 md:mt-auto md:pt-8">
              {payments ? (
                <ButtonLink href={routes.billing} size="lg" className="w-full">
                  Upgrade for {offer.priceLabel}
                  <ArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
                </ButtonLink>
              ) : (
                <span aria-disabled="true" className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full border border-line-strong text-[15px] font-medium text-fg-3" data-testid="pass-coming-soon">
                  Coming Soon
                </span>
              )}
              <p className="mt-3 text-center text-[12px] text-fg-3">
                {payments ? "Paid in your dashboard. Activates after payment verification." : "Start free today — the pass will be available from your dashboard."}
              </p>
            </div>
          </Reveal>
        </div>

        {/* ------------------------------------------------------------ comparison */}
        <Reveal className="mx-auto mt-10 max-w-[980px]">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
            <table className="w-full text-left text-[14px]" data-testid="plan-comparison">
              <caption className="sr-only">Free compared with the {offer.name}</caption>
              <thead className="border-b border-line bg-tint/[0.02] text-[12.5px] text-fg-3">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium sm:px-6">
                    Compare
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium sm:px-6">
                    Free
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-accent sm:px-6">
                    {offer.shortName}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(([label, a, b]) => (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-3 font-normal text-fg-2 sm:px-6">
                      {label}
                    </th>
                    {[a, b].map((v, i) => (
                      <td key={i} className={cn("px-4 py-3 sm:px-6", i === 1 ? "text-fg" : "text-fg-2")}>
                        {v === "✓" ? <Check className="size-4 text-accent" aria-label="Included" /> : v === "—" ? <Minus className="size-4 text-fg-3" aria-label="Not applicable" /> : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <div id="faq" className="mx-auto mt-24 grid max-w-[1080px] gap-10 sm:mt-32 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-5 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-fg sm:text-[36px]">Questions, answered.</h2>
            <p className="mt-4 max-w-[36ch] text-[15px] leading-relaxed text-fg-2">
              Still unsure? Read the{" "}
              <Link href={routes.docs} className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent">
                documentation
              </Link>{" "}
              or the{" "}
              <Link href={routes.ngrokAlternative} className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent">
                ngrok comparison
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
