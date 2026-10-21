import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Localians team.",
  alternates: { canonical: routes.contact },
};

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
