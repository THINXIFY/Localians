import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { SubPage } from "@/components/sections/SubPage";
import { buttonClasses } from "@/components/ui/Button";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { routes, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Contact Localians: Support and Account Questions",
  description: "Email the Localians team for technical help, account questions, billing or privacy requests. We read every message and reply by email.",
  path: routes.contact,
});

export default function ContactPage() {
  return (
    <SubPage
      eyebrow="Contact"
      title="Get in Touch."
      intro="Have a question about Localians, need technical assistance, or want to discuss your account? We're here to help."
    >
      <section aria-labelledby="contact-email" className="surface hairline-top max-w-[560px] p-7 sm:p-9">
        <h2 id="contact-email" className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-fg-3">
          Email
        </h2>
        <p className="mt-3 break-all text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">
          <a href={`mailto:${site.supportEmail}`} className="underline-offset-4 transition-colors hover:text-accent hover:underline">
            {site.supportEmail}
          </a>
        </p>
        <p className="mt-3 text-[14.5px] leading-relaxed text-fg-2">
          Include your Localians username and, for a payment question, your Order ID, so we can find your account quickly.
        </p>
        <a href={`mailto:${site.supportEmail}`} className={buttonClasses({ size: "lg", className: "mt-7" })}>
          <Mail className="size-4" aria-hidden="true" />
          Email Us
        </a>
      </section>
      <JsonLd data={breadcrumbs([{ name: "Contact", path: routes.contact }])} />
    </SubPage>
  );
}
