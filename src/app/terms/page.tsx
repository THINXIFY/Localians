import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Localians terms of service.",
  alternates: { canonical: routes.terms },
};

export default function TermsPage() {
  return (
    <SubPage
      eyebrow="Legal"
      title="Terms of Service"
      intro="The terms that govern use of Localians."
      notice={
        <>
          <strong className="font-medium text-fg">Not yet published.</strong> The Terms of Service will be available here
          before accounts open.
        </>
      }
    />
  );
}
