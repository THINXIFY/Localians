import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Questions, feedback or a problem with sharing your localhost? Get in touch with the Localians team.",
  path: routes.contact,
});

export default function ContactPage() {
  return (
    <SubPage
      eyebrow="Contact"
      title="Get in touch"
      intro="Questions about the beta, feedback, or partnership ideas — we'd like to hear them."
      notice={
        <>
          <strong className="font-medium text-fg">Contact details are coming soon.</strong> A support address will be
          published here before beta access opens.
        </>
      }
    />
  );
}
