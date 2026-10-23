import type { Metadata } from "next";
import { SubPage } from "@/components/sections/SubPage";
import { routes } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: "The terms for using Localians to share locally running web apps through preview links.",
  path: routes.terms,
});

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
